import type { BotRecord } from '../domain/bot';
import type { ChangeFile } from '../domain/changeset';
import type { FormatSpec } from '../domain/deliverable';
import type { RunStateDto, TurnKind } from '../domain/run-state';
import { idleRunState } from '../domain/run-state';
import type { ErrorCode, HostToUi, RunBoardDto, WorkspaceContext } from '../protocol/messages';
import { COPY, copilotStatusMessage } from './copy';
import { CancelSource } from './cancel';
import type { BotRegistry } from './bot-registry';
import type { ICopilotGateway } from './copilot-gateway';
import { HungError, mapCopilotError } from './copilot-gateway';
import { EmptyMcpPort, McpGateway } from './mcp-gateway';
import { PromptBuilder, turnInstruction, type HistoryTurn } from './prompt-builder';
import { PatchParser } from './patch-parser';
import type { ChangesetStore } from './changeset-store';
import type { ThreadStore } from './thread-store';
import { oneLine, parseMentions, parseVote, stripNeedEditTrailer } from './mentions';
import { removeParseableTodoLines, stripArticleChrome, stripLeadingVoteToken } from './article-strip';
import type { WorkspaceContextPort, FileSystemPort } from './ports';
import { EmptyLspSlicePort, withSelectionFallback, type LspSlicePort, type LspSliceSnapshot } from './lsp-slice';
import { RunBoardStore } from './run-board';
import { packKindFor } from './token-governor';
import { detectFormat } from './deliverable-detect';
import { DeliverableBuilder, templateForBot } from './deliverable-builder';
import { curateFacts } from './deliverable-facts';
import { extractDeliverableSpecs, selectPrimarySpecs } from './deliverable-parse';

export class Orchestrator {
  private state: RunStateDto = idleRunState();
  private cts: CancelSource | undefined;
  private freeze: BotRecord[] = [];
  private history: HistoryTurn[] = [];
  private userText = '';
  private workspace: WorkspaceContext = { otherTabPaths: [] };
  private loopActive = false;
  private lspSlice: LspSliceSnapshot = { diagnostics: [], symbols: [] };
  private deliverableAskCount = 0;
  private deliverableAnswers: string[] = [];

  constructor(
    private readonly registry: BotRegistry,
    private readonly gateway: ICopilotGateway,
    private readonly prompts: PromptBuilder,
    private readonly parser: PatchParser,
    private readonly changesets: ChangesetStore,
    private readonly thread: ThreadStore,
    private readonly workspacePort: WorkspaceContextPort,
    private readonly emit: (msg: HostToUi) => void,
    private readonly mcp: McpGateway = new McpGateway(new EmptyMcpPort(), emit, { settleMs: 0 }),
    readonly board: RunBoardStore = new RunBoardStore(),
    readonly lsp: LspSlicePort = new EmptyLspSlicePort(),
    private readonly files: FileSystemPort = { exists: async () => false, readText: async () => undefined },
  ) {}

  getRunState(): RunStateDto {
    return { ...this.state };
  }

  getFrozenBots(): BotRecord[] {
    return this.freeze.map((b) => ({ ...b }));
  }

  getPositionSummaries(): { botId: string; name: string; summary: string }[] {
    return this.freeze.map((bot) => ({
      botId: bot.id,
      name: bot.name,
      summary: this.positionOneLiner(bot.handle),
    }));
  }

  noteApplyFailed(applyFailed: boolean): void {
    this.state = { ...this.state, applyFailed };
    if (!applyFailed && this.state.phase === 'pendingReview' && !this.changesets.hasPending()) {
      this.state = { ...idleRunState(), applyFailed: false };
    }
    this.pushState();
  }

  /** Successful Approve: invalidate LSP slice and hide the board. Reject: hide only. */
  noteRunCleared(opts: { invalidateSlice: boolean }): void {
    if (opts.invalidateSlice) {
      this.lsp.invalidate();
      this.lspSlice = { diagnostics: [], symbols: [] };
    }
    this.hideBoard();
    this.noteApplyFailed(false);
  }

  async send(text: string): Promise<void> {
    if (this.state.splitOpen) {
      return;
    }
    if (this.state.deliverableAsk) {
      await this.answerDeliverableAsk(text);
      return;
    }
    if (this.state.debateRunning || this.loopActive) {
      return;
    }
    if (this.state.phase === 'pendingReview' || this.state.phase === 'implement') {
      return;
    }

    const parsed = parseMentions(text);
    const resolved: BotRecord[] = [];
    const unresolved: string[] = [];
    for (const handle of parsed.handles) {
      const bot = this.registry.getByHandle(handle);
      if (bot) {
        if (!resolved.some((b) => b.id === bot.id)) {
          resolved.push(bot);
        }
      } else {
        unresolved.push(handle);
      }
    }
    if (unresolved.length > 0) {
      this.fail('unknown-handle', COPY.unknownHandle(unresolved[0]!));
      return;
    }
    if (resolved.length > 1) {
      this.fail('multiple-mentions', COPY.multipleMentions);
      return;
    }

    const solo = resolved[0];
    if (!solo && this.registry.snapshotActive().length === 0) {
      this.fail('zero-active', COPY.zeroActive);
      return;
    }

    this.workspace = await this.workspacePort.getContext();
    if (!this.workspace.folderFsPath) {
      this.fail('no-workspace', COPY.noWorkspace);
      return;
    }

    const copilot = await this.gateway.ensureAvailable();
    if (copilot !== 'ready') {
      this.emitCopilot(copilot);
      return;
    }

    await this.mcp.ensureStartedFromSend();

    this.userText = text;
    this.history = [];
    this.deliverableAskCount = 0;
    this.deliverableAnswers = [];
    this.cts = new CancelSource();
    this.loopActive = true;
    this.board.clear();
    this.board.setGoal(text);
    this.board.clearDissents();
    this.syncFiles();
    this.emitBoard();

    if (solo) {
      this.freeze = [{ ...solo }];
      this.state = {
        phase: 'direct',
        round: 1,
        splitOpen: false,
        debateRunning: true,
        applyFailed: this.changesets.applyFailed,
        frozenBotIds: [solo.id],
        currentBotId: solo.id,
        turn: 'direct',
      };
      this.pushState();
      await this.runDirect(solo);
    } else {
      this.freeze = this.registry.snapshotActive();
      this.state = {
        phase: 'debate',
        round: 0,
        splitOpen: false,
        debateRunning: true,
        applyFailed: this.changesets.applyFailed,
        frozenBotIds: this.freeze.map((b) => b.id),
      };
      this.pushState();
      await this.runDebateRounds(1, 2);
    }

    this.loopActive = false;
  }

  async continueDebate(): Promise<void> {
    if (!this.state.splitOpen || this.loopActive) {
      return;
    }
    const copilot = await this.gateway.ensureAvailable();
    if (copilot !== 'ready') {
      this.emitCopilot(copilot);
      return;
    }
    await this.mcp.ensureStartedFromSend();
    this.cts = new CancelSource();
    this.loopActive = true;
    this.board.clearDissents();
    this.board.addDecision('Continue');
    this.emitBoard();
    this.state = {
      ...this.state,
      phase: 'debate',
      splitOpen: false,
      debateRunning: true,
    };
    this.pushState();
    const nextRound = this.state.round + 1;
    await this.runDebateRounds(nextRound, nextRound);
    this.loopActive = false;
  }

  async pick(botId: string): Promise<void> {
    if (!this.state.splitOpen || this.loopActive) {
      return;
    }
    const bot = this.freeze.find((b) => b.id === botId);
    if (!bot) {
      return;
    }
    const copilot = await this.gateway.ensureAvailable();
    if (copilot !== 'ready') {
      this.emitCopilot(copilot);
      return;
    }
    this.cts = new CancelSource();
    this.loopActive = true;
    this.board.clearDissents();
    this.board.addDecision(`Pick @${bot.handle}`);
    this.emitBoard();
    this.state = {
      ...this.state,
      splitOpen: false,
      debateRunning: true,
      phase: 'implement',
    };
    this.pushState();
    await this.maybeStartImplementer(bot, COPY.pickDirection(bot.name));
    this.loopActive = false;
  }

  stop(): void {
    this.cts?.cancel();
    if (this.state.debateRunning) {
      this.emit({ type: 'chat/notice', text: COPY.interrupted });
      this.enterSplit(COPY.splitPaused, COPY.splitPausedReason, true);
      return;
    }
    if (this.state.splitOpen) {
      this.emit({ type: 'chat/notice', text: COPY.stoppedNoImpl });
      this.exitToIdle();
    }
  }

  private async runDebateRounds(fromRound: number, toRound: number): Promise<void> {
    for (let round = fromRound; round <= toRound; round++) {
      if (this.cancelled()) {
        return;
      }
      this.state.round = round;
      this.pushState();
      for (const bot of this.freeze) {
        const result = await this.runTurn(bot, 'propose', round, turnInstruction('propose', round, this.userText));
        if (!isTurnOk(result)) {
          return;
        }
      }
      for (const bot of this.freeze) {
        const result = await this.runTurn(bot, 'critique', round, turnInstruction('critique', round, this.userText));
        if (!isTurnOk(result)) {
          return;
        }
      }
      const votes = new Map<string, 'AGREE' | 'DISSENT'>();
      for (const bot of this.freeze) {
        const result = await this.runTurn(bot, 'consensus', round, turnInstruction('consensus', round, this.userText));
        if (!isTurnOk(result)) {
          return;
        }
        votes.set(bot.id, result.vote ?? parseVote(result.text));
      }
      const allAgree = this.freeze.every((b) => votes.get(b.id) === 'AGREE');
      if (allAgree) {
        this.board.clearDissents();
        this.board.addDecision('Consensus');
        this.emitBoard();
        const implementer = this.freeze[0];
        if (implementer) {
          await this.maybeStartImplementer(implementer);
        }
        return;
      }
    }
    if (!this.cancelled()) {
      this.enterSplit(COPY.splitNoConsensus, 'The swarm did not reach AGREE. Continue for another round or pick a bot to decide.', false);
    }
  }

  private async runDirect(bot: BotRecord): Promise<void> {
    const notice = bot.active ? undefined : COPY.inactiveTurn(bot.name);
    const result = await this.runTurn(
      bot,
      'direct',
      1,
      turnInstruction('direct', 1, this.userText),
      { inactiveNotice: notice, solo: true },
    );
    if (!isTurnOk(result)) {
      return;
    }
    const trailer = result.trailer ?? 'NO_EDIT';
    if (trailer === 'NEED_EDIT') {
      await this.maybeStartImplementer(bot);
      return;
    }
    this.exitToIdle();
  }

  private async maybeStartImplementer(bot: BotRecord, notice?: string): Promise<void> {
    if (this.cancelled()) {
      return;
    }
    if (this.state.splitOpen) {
      return;
    }
    const detected = detectFormat(this.detectCorpus(), this.board.snapshot());
    if (detected.intent && (!detected.formats.length || !detected.hasOutline)) {
      await this.askDeliverable(bot, detected);
      return;
    }
    await this.runImplementer(bot, notice, detected.intent ? detected : undefined);
  }

  private async runImplementer(bot: BotRecord, notice?: string, detected?: FormatSpec): Promise<void> {
    if (this.cancelled()) {
      return;
    }
    const deliverable = !!(detected && detected.intent && detected.formats.length && detected.hasOutline);
    this.state.phase = 'implement';
    this.state.turn = 'implement';
    this.state.currentBotId = bot.id;
    this.state.debateRunning = true;
    this.state.deliverableAsk = false;
    this.pushState();
    const extra = deliverable ? COPY.deliverableImplementerExtra : undefined;
    const result = await this.runTurn(
      bot,
      'implement',
      this.state.round || 1,
      turnInstruction('implement', this.state.round || 1, this.detectCorpus(), extra),
      { inactiveNotice: notice },
    );
    if (!isTurnOk(result)) {
      return;
    }
    const root = this.workspace.folderFsPath;
    if (!root) {
      this.fail('no-workspace', COPY.noWorkspace);
      return;
    }
    if (deliverable && detected) {
      this.finishDeliverable(bot, result.text, detected, root);
      return;
    }
    const parsed = this.parser.parseImplementer(result.text, root);
    if (!parsed.ok) {
      this.fail(parsed.code, parsed.code === 'parse-failed' ? COPY.parseFailed : COPY.validateFailed);
      return;
    }
    this.enterPendingReview(parsed.files);
  }

  private finishDeliverable(bot: BotRecord, implementerText: string, detected: FormatSpec, root: string): void {
    const fromImpl = extractDeliverableSpecs(implementerText, root);
    const specs = selectPrimarySpecs(detected.formats, fromImpl, detected);
    const facts = curateFacts(this.board.snapshot(), this.mcp.contextLines());
    const files: ChangeFile[] = specs.map((spec) =>
      DeliverableBuilder.build(
        { ...spec, facts: spec.facts?.length ? spec.facts : facts },
        templateForBot(bot, spec.format),
      ),
    );
    this.enterPendingReview(files);
  }

  private enterPendingReview(files: ChangeFile[]): void {
    this.changesets.setPending(files);
    this.syncFiles(files.map((f) => f.path));
    this.emitBoard();
    this.state = {
      phase: 'pendingReview',
      round: this.state.round,
      splitOpen: false,
      debateRunning: false,
      applyFailed: false,
      frozenBotIds: this.freeze.map((b) => b.id),
    };
    this.pushState();
  }

  private async askDeliverable(bot: BotRecord, detected: FormatSpec): Promise<void> {
    if (this.state.splitOpen) {
      return;
    }
    this.deliverableAskCount += 1;
    const question = deliverableAskCopy(detected);
    const turn: TurnKind = this.state.phase === 'direct' ? 'direct' : 'propose';
    this.emit({
      type: 'chat/turn-start',
      botId: bot.id,
      handle: bot.handle,
      name: bot.name,
      colorIndex: bot.colorIndex,
      turn,
      round: this.state.round || 1,
    });
    this.emit({ type: 'chat/token', botId: bot.id, delta: question });
    this.history.push({ handle: bot.handle, text: question });
    this.thread.append({ role: 'assistant', text: question, handle: bot.handle, botId: bot.id });
    this.emit({
      type: 'chat/turn-end',
      botId: bot.id,
      turn,
      text: question,
      handle: bot.handle,
    });
    this.state = {
      ...this.state,
      splitOpen: false,
      debateRunning: false,
      deliverableAsk: true,
      currentBotId: bot.id,
    };
    this.pushState();
  }

  private async answerDeliverableAsk(text: string): Promise<void> {
    if (this.state.splitOpen || this.loopActive || this.state.debateRunning) {
      return;
    }
    const bot = this.freeze[0];
    if (!bot) {
      this.exitToIdle();
      return;
    }
    this.deliverableAnswers.push(text);
    this.board.setGoal(this.detectCorpus());
    this.emitBoard();
    const detected = detectFormat(this.detectCorpus(), this.board.snapshot());
    if (detected.formats.length && detected.hasOutline) {
      const copilot = await this.gateway.ensureAvailable();
      if (copilot !== 'ready') {
        this.emitCopilot(copilot);
        return;
      }
      this.cts = new CancelSource();
      this.loopActive = true;
      this.state.deliverableAsk = false;
      this.state.debateRunning = true;
      this.pushState();
      await this.runImplementer(bot, undefined, detected);
      this.loopActive = false;
      return;
    }
    if (this.deliverableAskCount >= 2) {
      this.exitToIdle();
      return;
    }
    await this.askDeliverable(bot, detected);
  }

  private detectCorpus(): string {
    return [this.userText, ...this.deliverableAnswers].filter((part) => part && part.trim()).join('\n');
  }

  private async runTurn(
    bot: BotRecord,
    turn: TurnKind,
    round: number,
    instruction: string,
    extras?: { inactiveNotice?: string; solo?: boolean },
  ): Promise<{ ok: true; text: string; trailer?: 'NEED_EDIT' | 'NO_EDIT'; vote?: 'AGREE' | 'DISSENT' } | 'hung' | 'cancelled' | 'error'> {
    if (this.cancelled()) {
      return 'cancelled';
    }

    const kind = packKindFor(turn);
    if (kind === 'debate') {
      this.lspSlice = withSelectionFallback(await this.lsp.capture(this.workspace), this.workspace);
    }

    const packed = await this.prompts.pack({
      bot,
      kind,
      instruction,
      board: this.board.snapshot(),
      workspace: this.workspace,
      counter: this.gateway,
      lspSlice: kind === 'debate' ? this.lspSlice : undefined,
      implementerFiles: kind === 'implement' ? await this.implementerFiles() : undefined,
      mcpContext: kind === 'debate' ? this.mcp.contextLines() : undefined,
    });
    if (!packed.ok) {
      this.emit({ type: 'error', code: 'pack-overflow', message: COPY.packOverflow });
      this.state.debateRunning = false;
      this.state.phase = 'error';
      this.pushState();
      return 'error';
    }

    this.state.turn = turn;
    this.state.currentBotId = bot.id;
    this.state.round = round;
    this.pushState();
    this.emit({
      type: 'chat/turn-start',
      botId: bot.id,
      handle: bot.handle,
      name: bot.name,
      colorIndex: bot.colorIndex,
      turn,
      round,
      inactiveNotice: extras?.inactiveNotice,
      solo: extras?.solo,
    });

    this.prompts.governor.recordSent(packed.tokens);

    let full = '';
    try {
      const streamed = await this.gateway.send(
        packed.messages,
        this.cts!.token,
        (chunk) => {
          full += chunk;
          this.emit({ type: 'chat/token', botId: bot.id, delta: chunk });
        },
        { tools: this.toolsFor(turn), botId: bot.id, handle: bot.handle },
      );
      if (streamed === 'cancelled' || this.cancelled()) {
        return 'cancelled';
      }
    } catch (err) {
      if (this.cancelled()) {
        return 'cancelled';
      }
      if (err instanceof HungError || mapCopilotError(err) === 'hung') {
        this.emit({ type: 'copilot/status', status: 'hung', message: COPY.hung });
        this.state.debateRunning = true;
        this.pushState();
        await this.waitUntilCancelled();
        return 'hung';
      }
      const status = mapCopilotError(err);
      this.emitCopilot(status);
      if (!isAuthQuotaHung(status)) {
        this.emit({ type: 'error', code: 'copilot', message: err instanceof Error ? err.message : 'Copilot request failed.' });
      }
      this.state.debateRunning = false;
      this.state.phase = 'error';
      this.pushState();
      return 'error';
    }

    if (this.cancelled()) {
      return 'cancelled';
    }

    let visible = full;
    let trailer: 'NEED_EDIT' | 'NO_EDIT' | undefined;
    let vote: 'AGREE' | 'DISSENT' | undefined;
    if (turn !== 'implement') {
      visible = this.parser.sanitizeDebate(full);
    }
    if (turn === 'direct') {
      const stripped = stripNeedEditTrailer(visible);
      visible = stripped.body;
      trailer = stripped.token;
      visible = visible.replace(/\s*(NEED_EDIT|NO_EDIT)\.?$/i, '').replace(/\s+$/g, '');
    }
    if (turn === 'consensus') {
      vote = parseVote(visible);
      visible = stripLeadingVoteToken(visible);
    }
    if (turn === 'propose' || turn === 'critique' || turn === 'direct') {
      this.board.mergeParseableTodos(visible);
      this.emitBoard();
      visible = removeParseableTodoLines(visible);
    }
    if (turn !== 'implement') {
      visible = stripArticleChrome(visible, this.userText);
    }

    this.history.push({ handle: bot.handle, text: visible });
    this.thread.append({ role: 'assistant', text: visible, handle: bot.handle, botId: bot.id });
    this.emit({
      type: 'chat/turn-end',
      botId: bot.id,
      turn,
      text: visible,
      handle: bot.handle,
      vote,
      trailer,
    });
    return { ok: true, text: turn === 'implement' ? full : visible, trailer, vote };
  }

  private toolsFor(turn: TurnKind): 'mcp-debate' | 'none' {
    if (turn === 'propose' || turn === 'critique' || turn === 'direct') {
      return this.mcp.noneConfigured() ? 'none' : 'mcp-debate';
    }
    return 'none';
  }

  private enterSplit(title: string, reason: string, paused: boolean): void {
    this.state = {
      phase: 'split',
      round: this.state.round,
      splitOpen: true,
      debateRunning: false,
      applyFailed: this.changesets.applyFailed,
      frozenBotIds: this.freeze.map((b) => b.id),
    };
    this.pushState();
    const positions = this.splitPositions();
    this.board.setDissents(positions.map((p) => ({ handle: p.handle, text: p.text })));
    this.board.addDecision(title);
    this.emitBoard();
    this.emit({
      type: 'chat/split',
      positions,
      title,
      reason,
      paused,
    });
  }

  private splitPositions(): { botId: string; handle: string; text: string }[] {
    return this.freeze.map((bot) => ({
      botId: bot.id,
      handle: bot.handle,
      text: this.positionOneLiner(bot.handle),
    }));
  }

  private exitToIdle(): void {
    this.hideBoard();
    this.deliverableAskCount = 0;
    this.deliverableAnswers = [];
    this.state = {
      ...idleRunState(),
      applyFailed: this.changesets.applyFailed,
    };
    this.freeze = [];
    this.pushState();
  }

  private fail(code: ErrorCode, message: string): void {
    this.emit({ type: 'error', code, message });
    if (code !== 'pack-overflow') {
      this.hideBoard();
    }
    this.state = { ...idleRunState(), phase: 'error', applyFailed: this.changesets.applyFailed };
    this.state.debateRunning = false;
    this.pushState();
  }

  private emitCopilot(status: import('../protocol/messages').CopilotStatus): void {
    this.emit({ type: 'copilot/status', status, message: copilotStatusMessage(status) });
  }

  private positionOneLiner(handle: string): string {
    const key = handle.toLowerCase();
    const mine = this.history.filter((h) => h.handle.toLowerCase() === key);
    for (let i = mine.length - 1; i >= 0; i--) {
      const line = oneLine(mine[i]!.text);
      if (!line) {
        continue;
      }
      const voteOnly = /^(AGREE|DISSENT)\b/i.test(line) && line.split(/\s+/).length <= 3;
      if (!voteOnly) {
        return line;
      }
    }
    return oneLine(mine[mine.length - 1]?.text ?? '');
  }

  private cancelled(): boolean {
    return !!this.cts?.token.isCancellationRequested;
  }

  private async waitUntilCancelled(): Promise<void> {
    if (!this.cts || this.cts.token.isCancellationRequested) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.cts!.token.onCancellationRequested(() => resolve());
    });
  }

  private pushState(): void {
    this.emit({ type: 'run/state', state: this.getRunState() });
  }

  private emitBoard(): void {
    this.emit({ type: 'chat/board', board: this.board.snapshot() });
  }

  private hideBoard(): void {
    this.board.clear();
    this.emitBoard();
  }

  private syncFiles(changesetPaths: string[] = []): void {
    const pending = this.changesets.files?.map((f) => f.path) ?? [];
    const extra = changesetPaths.length ? changesetPaths : pending;
    this.board.setFiles(this.filesInPlayPaths(extra), extra);
  }

  /** Active editor + named/changeset paths. Not every open tab. */
  private filesInPlayPaths(extra: string[] = []): string[] {
    const paths: string[] = [];
    const add = (p?: string): void => {
      if (p && !paths.includes(p)) {
        paths.push(p);
      }
    };
    add(this.workspace.activeEditor?.path);
    for (const f of this.board.snapshot().files) {
      add(f.path);
    }
    for (const p of extra) {
      add(p);
    }
    for (const f of this.changesets.files ?? []) {
      add(f.path);
    }
    return paths;
  }

  private async implementerFiles(): Promise<{ path: string; content: string }[]> {
    const paths = this.filesInPlayPaths();
    const out: { path: string; content: string }[] = [];
    for (const path of paths) {
      out.push({ path, content: await this.readFileInPlay(path) });
    }
    return out;
  }

  private async readFileInPlay(path: string): Promise<string> {
    if (this.workspace.activeEditor?.path === path) {
      return this.workspace.activeEditor.content;
    }
    const pending = this.changesets.files?.find((f) => f.path === path);
    if (pending && pending.op !== 'delete' && pending.content !== undefined) {
      return pending.content;
    }
    return (await this.files.readText(path)) ?? '';
  }

  snapshotBoard(): RunBoardDto {
    return this.board.snapshot();
  }
}

function isAuthQuotaHung(status: import('../protocol/messages').CopilotStatus): boolean {
  return (
    status === 'missing' ||
    status === 'noPermissions' ||
    status === 'quota' ||
    status === 'hung' ||
    status === 'blocked' ||
    status === 'notFound'
  );
}

type TurnResult =
  | { ok: true; text: string; trailer?: 'NEED_EDIT' | 'NO_EDIT'; vote?: 'AGREE' | 'DISSENT' }
  | 'hung'
  | 'cancelled'
  | 'error';

function isTurnOk(result: TurnResult): result is { ok: true; text: string; trailer?: 'NEED_EDIT' | 'NO_EDIT'; vote?: 'AGREE' | 'DISSENT' } {
  return typeof result === 'object' && result.ok === true;
}

function deliverableAskCopy(detected: FormatSpec): string {
  if (!detected.formats.length && !detected.hasOutline) {
    return COPY.deliverableAskBoth;
  }
  if (!detected.formats.length) {
    return COPY.deliverableAskFormat;
  }
  return COPY.deliverableAskOutline;
}
