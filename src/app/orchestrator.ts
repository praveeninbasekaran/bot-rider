import type { BotRecord } from '../domain/bot';
import type { ChangeFile } from '../domain/changeset';
import type { FormatSpec } from '../domain/deliverable';
import type { RunStateDto, TurnKind } from '../domain/run-state';
import { idleRunState } from '../domain/run-state';
import type { ErrorCode, HostToUi, PromptMessage, RunBoardDto, WorkspaceContext } from '../protocol/messages';
import { COPY, copilotStatusMessage } from './copy';
import { CancelSource } from './cancel';
import type { BotRegistry } from './bot-registry';
import type { ICopilotGateway } from './copilot-gateway';
import { HungError, mapCopilotError } from './copilot-gateway';
import { usesPerBotModel } from './bot-models';
import { EmptyMcpPort, McpGateway } from './mcp-gateway';
import { PromptBuilder, turnInstruction, type HistoryTurn } from './prompt-builder';
import { PatchParser } from './patch-parser';
import type { ChangesetStore } from './changeset-store';
import type { ThreadStore } from './thread-store';
import { oneLine, parseMentions, parseVote, parseAgreeWriter, stripNeedEditTrailer } from './mentions';
import { removeParseableTodoLines, stripArticleChrome, stripLeadingVoteToken } from './article-strip';
import type { WorkspaceContextPort, FileSystemPort } from './ports';
import { EmptyLspSlicePort, withSelectionFallback, type LspSlicePort, type LspSliceSnapshot } from './lsp-slice';
import { RunBoardStore } from './run-board';
import { packKindFor } from './token-governor';
import {
  BotSessionStore,
  buildIsolationPacket,
  packetToMessage,
  type IsolationPacket,
} from './bot-session-store';
import { HostEventBus } from './event-bus';
import {
  isTesterAssignment,
  parseDispatcherSplit,
  remainingWorkBots,
  workPathClaims,
  validateDispatcherSplit,
  type CollisionClaim,
  type SplitValidate,
  type ValidatedAssignment,
} from './work-split';
import {
  OpenSpecCatalog,
  attachFileCites,
  citedIdsFromFiles,
  matchSpecBodies,
} from './openspec-catalog';
import type { ContextMapHost } from './context-map';
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
  readonly sessions = new BotSessionStore();
  readonly bus = new HostEventBus();
  readonly catalog: OpenSpecCatalog;
  private remainingSlots: { botId: string; turn: TurnKind }[] = [];
  private contextMap: ContextMapHost | undefined;
  private debateBatchActive = false;
  private workRunActive = false;
  private workBatchActive = false;
  private argueActive = false;
  private argueClaimantHandles: string[] = [];
  private baPackets: IsolationPacket[] = [];
  private workAssignments: ValidatedAssignment[] = [];
  private workerFiles = new Map<string, ChangeFile[]>();
  private inflightBotIds = new Set<string>();
  private inflightWaiters = new Map<string, Array<() => void>>();

  private get parallelBatchActive(): boolean {
    return this.debateBatchActive || this.workBatchActive;
  }

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
  ) {
    this.catalog = new OpenSpecCatalog(files);
  }

  getRunState(): RunStateDto {
    return { ...this.state };
  }

  getFrozenBots(): BotRecord[] {
    return this.freeze.map((b) => ({ ...b }));
  }

  bindContextMap(host: ContextMapHost): void {
    this.contextMap = host;
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
    this.clearSessions();
    this.hideBoard();
    this.noteApplyFailed(false);
  }

  async send(text: string, runType: 'work' | 'debate' = 'debate'): Promise<void> {
    if (this.state.splitOpen) {
      return;
    }
    if (this.state.deliverableAsk) {
      await this.answerDeliverableAsk(text);
      return;
    }
    if (this.workBatchActive || this.argueActive) {
      await this.sendDuringWorkBatch(text);
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
    await this.catalog.load();

    if (runType === 'work' && !solo && !this.workDesignationOk()) {
      this.fail('work-gate', COPY.workNeedsRoles);
      return;
    }

    this.userText = text;
    this.history = [];
    this.clearSessions();
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
      this.contextMap?.syncRun();
      await this.runDirect(solo);
    } else if (runType === 'work') {
      this.freeze = this.registry.snapshotActive();
      this.state = {
        phase: 'work',
        round: 1,
        splitOpen: false,
        debateRunning: true,
        applyFailed: this.changesets.applyFailed,
        frozenBotIds: this.freeze.map((b) => b.id),
        runType: 'work',
      };
      this.pushState();
      this.contextMap?.syncRun();
      await this.runWork();
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
      this.contextMap?.syncRun();
      await this.runDebateRounds(1, 2);
    }

    this.loopActive = false;
  }

  async continueDebate(): Promise<void> {
    if (!this.state.splitOpen || this.loopActive || this.isWorkRun()) {
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
    if (!this.state.splitOpen || this.loopActive || this.isWorkRun()) {
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
    this.remainingSlots = [{ botId: bot.id, turn: 'implement' }];
    this.publishPacket(buildIsolationPacket({ at: 'pick', board: this.board.snapshot() }));
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
    if (this.state.debateRunning && this.isWorkRun()) {
      this.emit({ type: 'chat/notice', text: COPY.interrupted });
      if (this.argueActive) {
        return;
      }
      this.abortWorkRun();
      return;
    }
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

  /** Work in flight (BA / dispatch / Work-batch / Argue). Not pendingReview. Not F7 Debate. */
  private isWorkRun(): boolean {
    return (
      this.workRunActive ||
      this.workBatchActive ||
      this.argueActive ||
      this.state.runType === 'work' ||
      this.state.phase === 'work'
    );
  }

  /** Abort in-flight Work sendRequest. Snapshot HV already painted. Never implement. No Debate Split. */
  private abortWorkRun(): void {
    this.workBatchActive = false;
    this.workRunActive = false;
    this.argueActive = false;
    this.argueClaimantHandles = [];
    this.workAssignments = [];
    this.workerFiles.clear();
    this.exitToIdle();
  }

  private async runDebateRounds(fromRound: number, toRound: number): Promise<void> {
    this.planDebateSlots(fromRound, toRound);
    for (let round = fromRound; round <= toRound; round++) {
      if (this.cancelled()) {
        return;
      }
      this.state.round = round;
      this.pushState();
      const proposed = await this.runDebateBatch('propose', round);
      if (!isTurnOk(proposed)) {
        return;
      }
      const critiqued = await this.runDebateBatch('critique', round);
      if (!isTurnOk(critiqued)) {
        return;
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
        this.publishPacket(buildIsolationPacket({ at: 'consensus', board: this.board.snapshot() }));
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
    this.remainingSlots = [{ botId: bot.id, turn: 'direct' }];
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
    const parsed = this.parser.parseImplementer(result.text, root, this.catalog.snapshot());
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
    const catalog = this.catalog.snapshot();
    this.changesets.setPending(files.map((file) => attachFileCites(file, catalog)));
    this.syncFiles(files.map((f) => f.path));
    this.contextMap?.syncRun();
    this.emitBoard();
    this.workBatchActive = false;
    this.workRunActive = false;
    this.argueActive = false;
    this.argueClaimantHandles = [];
    this.state = {
      phase: 'pendingReview',
      round: this.state.round,
      splitOpen: false,
      debateRunning: false,
      applyFailed: false,
      frozenBotIds: this.freeze.map((b) => b.id),
      runType: this.state.runType,
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
    extras?: { inactiveNotice?: string; solo?: boolean; skipInbox?: boolean; assignedPaths?: string[] },
  ): Promise<TurnResult> {
    const prepared = await this.prepareSpeaker(bot, turn, round, instruction, extras);
    if (prepared === 'cancelled' || prepared === 'error') {
      return prepared;
    }
    if (prepared === 'overflow') {
      if (!this.parallelBatchActive && !this.argueActive) {
        this.state.debateRunning = false;
        this.state.phase = 'error';
        this.pushState();
      }
      return 'error';
    }
    const result = await this.streamPrepared(prepared);
    if (result === 'hung' && !this.parallelBatchActive) {
      await this.waitUntilCancelled();
    }
    return result;
  }

  private speakersFor(turn: TurnKind): BotRecord[] {
    return this.freeze.filter((bot) => this.remainingSlots.some((slot) => slot.botId === bot.id && slot.turn === turn));
  }

  private async runDebateBatch(turn: 'propose' | 'critique', round: number): Promise<TurnResult> {
    if (this.cancelled()) {
      return 'cancelled';
    }
    const speakers = this.speakersFor(turn);
    const instruction = turnInstruction(turn, round, this.userText);
    this.debateBatchActive = true;
    this.state.turn = turn;
    this.state.round = round;
    this.state.debateRunning = true;
    this.pushState();
    this.lspSlice = withSelectionFallback(await this.lsp.capture(this.workspace), this.workspace);

    const prepared: PreparedSpeaker[] = [];
    let overflowed = 0;
    for (const bot of speakers) {
      const next = await this.prepareSpeaker(bot, turn, round, instruction);
      if (next === 'cancelled') {
        this.debateBatchActive = false;
        this.ingestSettledBatch();
        return 'cancelled';
      }
      if (next === 'error') {
        this.debateBatchActive = false;
        this.ingestSettledBatch();
        return 'error';
      }
      if (next === 'overflow') {
        overflowed += 1;
        this.completeSlot(bot.id, turn);
        continue;
      }
      prepared.push(next);
    }

    if (prepared.length === 0) {
      this.ingestSettledBatch();
      this.debateBatchActive = false;
      if (overflowed > 0) {
        this.state.debateRunning = false;
        this.state.phase = 'error';
        this.pushState();
        return 'error';
      }
      return { ok: true, text: '' };
    }

    const results = await Promise.all(prepared.map((item) => this.streamPrepared(item)));
    this.ingestSettledBatch();
    this.debateBatchActive = false;

    if (results.some((item) => item === 'cancelled') || this.cancelled()) {
      return 'cancelled';
    }
    if (results.some((item) => item === 'hung')) {
      await this.waitUntilCancelled();
      return 'hung';
    }
    if (results.some((item) => item === 'error')) {
      return 'error';
    }
    return { ok: true, text: '' };
  }

  private async prepareSpeaker(
    bot: BotRecord,
    turn: TurnKind,
    round: number,
    instruction: string,
    extras?: SpeakerExtras,
  ): Promise<PreparedSpeaker | 'overflow' | 'cancelled' | 'error'> {
    if (this.cancelled()) {
      return 'cancelled';
    }

    const perBot = usesPerBotModel(turn);
    const live = perBot ? this.registry.getById(bot.id) : undefined;
    const turnModelId = perBot ? (live ? live.modelId : bot.modelId) : undefined;
    if (perBot) {
      const prepared = await this.gateway.prepareTurn(turnModelId);
      if (prepared.usedFallback) {
        this.emit({ type: 'chat/notice', text: COPY.savedModelUnavailable });
      }
    }

    const kind = packKindFor(turn);
    if (kind === 'debate' && !this.debateBatchActive) {
      this.lspSlice = withSelectionFallback(await this.lsp.capture(this.workspace), this.workspace);
    }

    const inbox = extras?.skipInbox ? [] : this.sessions.takeInbox(bot.id);
    const assignedPaths = extras?.assignedPaths;
    const isolationPackets = extras?.isolationPackets ?? inbox;
    const packed = await this.prompts.pack({
      bot,
      kind,
      instruction,
      board: this.board.snapshot(),
      workspace: this.workspace,
      counter: this.gateway,
      lspSlice: kind === 'debate' ? this.lspSlice : undefined,
      implementerFiles:
        kind === 'implement'
          ? assignedPaths
            ? await this.readAssignedFiles(assignedPaths)
            : await this.implementerFiles()
          : undefined,
      mcpContext: kind === 'debate' ? this.mcp.contextLines() : undefined,
      sessionMessages: this.sessions.messagesOf(bot.id),
      isolationPackets,
    });
    if (!packed.ok) {
      if (!extras?.skipInbox) {
        for (const packet of inbox) {
          this.sessions.enqueue(bot.id, packet);
        }
      }
      this.emit({ type: 'error', code: 'pack-overflow', message: COPY.packOverflow });
      if (!this.parallelBatchActive && !this.argueActive) {
        this.state.debateRunning = false;
        this.state.phase = 'error';
        this.pushState();
      }
      return 'overflow';
    }

    return {
      bot,
      turn,
      round,
      instruction,
      inbox,
      packed,
      turnModelId: perBot ? turnModelId : undefined,
      extras,
    };
  }

  private async streamPrepared(prepared: PreparedSpeaker): Promise<TurnResult> {
    const { bot, turn, round, instruction, inbox, packed, turnModelId, extras } = prepared;
    if (this.cancelled()) {
      return 'cancelled';
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

    this.markInflight(bot.id, true);
    let full = '';
    try {
      try {
        const streamed = await this.gateway.send(
          packed.messages,
          this.cts!.token,
          (chunk) => {
            full += chunk;
            this.emit({ type: 'chat/token', botId: bot.id, delta: chunk });
          },
          {
            tools: this.toolsFor(turn),
            botId: bot.id,
            handle: bot.handle,
            modelId: turnModelId,
          },
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
          return 'hung';
        }
        const status = mapCopilotError(err);
        this.emitCopilot(status);
        if (!isAuthQuotaHung(status)) {
          this.emit({ type: 'error', code: 'copilot', message: err instanceof Error ? err.message : 'Copilot request failed.' });
        }
        if (!this.parallelBatchActive && !this.argueActive) {
          this.state.debateRunning = false;
          this.state.phase = 'error';
          this.pushState();
        }
        return 'error';
      }

      if (this.cancelled()) {
        return 'cancelled';
      }

      const keepRaw = turn === 'implement' || turn === 'work' || turn === 'dispatch';
      let visible = full;
      let trailer: 'NEED_EDIT' | 'NO_EDIT' | undefined;
      let vote: 'AGREE' | 'DISSENT' | undefined;
      if (!keepRaw || turn === 'dispatch') {
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
      let agreeWriter: string | undefined;
      if (turn === 'argue') {
        vote = parseVote(visible);
        agreeWriter = parseAgreeWriter(full, this.argueClaimantHandles);
      }
      if (turn === 'propose' || turn === 'critique' || turn === 'direct' || turn === 'spec') {
        this.board.mergeParseableTodos(visible);
        this.emitBoard();
        visible = removeParseableTodoLines(visible);
      }
      if (turn !== 'implement' && turn !== 'work') {
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
      this.completeSlot(bot.id, turn);
      if (turn === 'direct' && trailer === 'NEED_EDIT' && !this.workBatchActive && !this.workRunActive) {
        this.remainingSlots.push({ botId: bot.id, turn: 'implement' });
      }
      if (
        turn === 'propose' ||
        turn === 'critique' ||
        turn === 'direct' ||
        turn === 'spec' ||
        turn === 'dispatch' ||
        turn === 'work' ||
        turn === 'argue'
      ) {
        this.publishPacket(
          buildIsolationPacket({
            at: 'turn-end',
            fromBotId: bot.id,
            board: this.board.snapshot(),
            trailer,
            agreeWriter,
          }),
        );
      }
      const stored = keepRaw ? full : visible;
      this.sessions.append(bot.id, [
        ...inbox.map(packetToMessage),
        { role: 'user', content: instruction },
        { role: 'assistant', content: stored },
      ]);
      return { ok: true, text: stored, trailer, vote };
    } finally {
      this.markInflight(bot.id, false);
    }
  }

  private ingestSettledBatch(ids?: string[]): void {
    const botIds = ids ?? this.downstreamIds();
    for (const botId of botIds) {
      const packets = this.sessions.takeInbox(botId);
      if (packets.length === 0) {
        continue;
      }
      this.sessions.append(botId, packets.map(packetToMessage));
    }
  }

  private toolsFor(turn: TurnKind): 'mcp-debate' | 'none' {
    if (turn === 'propose' || turn === 'critique' || turn === 'direct' || turn === 'spec') {
      return this.mcp.noneConfigured() ? 'none' : 'mcp-debate';
    }
    return 'none';
  }

  private enterSplit(title: string, reason: string, paused: boolean): void {
    this.workBatchActive = false;
    this.workRunActive = false;
    this.argueActive = false;
    this.argueClaimantHandles = [];
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
    this.clearSessions();
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
      this.clearSessions();
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

  private clearSessions(): void {
    this.sessions.clear();
    this.bus.clear();
    this.remainingSlots = [];
    this.debateBatchActive = false;
    this.workRunActive = false;
    this.workBatchActive = false;
    this.argueActive = false;
    this.argueClaimantHandles = [];
    this.baPackets = [];
    this.workAssignments = [];
    this.workerFiles.clear();
    this.inflightBotIds.clear();
    this.inflightWaiters.clear();
    this.contextMap?.clearRun();
  }

  private planDebateSlots(fromRound: number, toRound: number): void {
    this.remainingSlots = [];
    for (let round = fromRound; round <= toRound; round++) {
      for (const turn of ['propose', 'critique', 'consensus'] as const) {
        for (const bot of this.freeze) {
          this.remainingSlots.push({ botId: bot.id, turn });
        }
      }
    }
    const implementer = this.freeze[0];
    if (implementer) {
      this.remainingSlots.push({ botId: implementer.id, turn: 'implement' });
    }
  }

  private completeSlot(botId: string, turn: TurnKind): void {
    const index = this.remainingSlots.findIndex((slot) => slot.botId === botId && slot.turn === turn);
    if (index >= 0) {
      this.remainingSlots.splice(index, 1);
    }
    this.notifyIdle(botId);
  }

  private downstreamIds(): string[] {
    const ids: string[] = [];
    for (const slot of this.remainingSlots) {
      if (!ids.includes(slot.botId)) {
        ids.push(slot.botId);
      }
    }
    return ids;
  }

  private workFreezeIds(): string[] {
    return this.freeze.map((bot) => bot.id);
  }

  private workDesignationOk(): boolean {
    const active = this.registry.snapshotActive();
    return (
      active.filter((bot) => bot.dispatcher).length === 1 &&
      active.filter((bot) => bot.spec).length === 1
    );
  }

  private workRoles(): { spec: BotRecord; dispatcher: BotRecord } | undefined {
    const active = this.freeze.filter((bot) => bot.active);
    const specs = active.filter((bot) => bot.spec);
    const dispatchers = active.filter((bot) => bot.dispatcher);
    if (specs.length !== 1 || dispatchers.length !== 1) {
      return undefined;
    }
    return { spec: specs[0]!, dispatcher: dispatchers[0]! };
  }

  private async runWork(): Promise<void> {
    this.workRunActive = true;
    const roles = this.workRoles();
    if (!roles) {
      this.fail('work-gate', COPY.workNeedsRoles);
      return;
    }
    const { spec, dispatcher } = roles;
    this.remainingSlots = [
      { botId: spec.id, turn: 'spec' },
      { botId: dispatcher.id, turn: 'dispatch' },
    ];

    const specResult = await this.runTurn(
      spec,
      'spec',
      1,
      turnInstruction('spec', 1, this.userText),
    );
    if (!isTurnOk(specResult)) {
      return;
    }
    this.baPackets = this.sessions.listPublished().filter((packet) => packet.fromBotId === spec.id);
    this.ingestSettledBatch(this.workFreezeIds());

    const remaining = remainingWorkBots(this.freeze, spec, dispatcher);
    const handles = remaining.map((bot) => `@${bot.handle}`).join(', ') || '(none)';
    const dispatchExtra = `Remaining worker handles: ${handles}`;
    let split = await this.runDispatch(dispatcher, dispatchExtra);
    if (!split.ok && split.reason !== 'cancelled' && !this.cancelled()) {
      split = await this.runDispatch(
        dispatcher,
        `${dispatchExtra}\nPrevious assignment was invalid (${split.reason}). Assign disjoint path sets again.`,
      );
    }
    if (!split.ok) {
      if (this.cancelled() || split.reason === 'cancelled') {
        return;
      }
      this.emit({ type: 'chat/notice', text: COPY.invalidSplit });
      this.exitToIdle();
      return;
    }
    this.workAssignments = split.assignments;
    this.ingestSettledBatch(this.workFreezeIds());

    for (const assignment of this.workAssignments) {
      this.remainingSlots.push({ botId: assignment.botId, turn: 'work' });
    }
    const batch = await this.runWorkBatch();
    if (!isTurnOk(batch) && batch !== 'cancelled' && batch !== 'hung') {
      return;
    }
    if (this.cancelled()) {
      return;
    }
    this.ingestSettledBatch(this.workFreezeIds());
    await this.finishWorkUnion();
  }

  private async runDispatch(
    dispatcher: BotRecord,
    extra: string,
  ): Promise<SplitValidate> {
    if (this.cancelled()) {
      return { ok: false, reason: 'cancelled' };
    }
    const result = await this.runTurn(
      dispatcher,
      'dispatch',
      1,
      turnInstruction('dispatch', 1, this.userText, extra),
    );
    if (!isTurnOk(result)) {
      return { ok: false, reason: result === 'cancelled' ? 'cancelled' : 'dispatch failed' };
    }
    const parsed = parseDispatcherSplit(result.text);
    if (!parsed.ok) {
      return { ok: false, reason: parsed.reason };
    }
    const roles = this.workRoles();
    if (!roles) {
      return { ok: false, reason: 'unknown handle' };
    }
    const remaining = remainingWorkBots(this.freeze, roles.spec, roles.dispatcher);
    const root = this.workspace.folderFsPath;
    if (!root) {
      return { ok: false, reason: 'no-workspace' };
    }
    return validateDispatcherSplit({
      assignments: parsed.assignments,
      declaredPaths: parsed.declaredPaths,
      remaining,
      workspaceRoot: root,
    });
  }

  private async runWorkBatch(): Promise<TurnResult> {
    if (this.cancelled()) {
      return 'cancelled';
    }
    const assignments = this.workAssignments;
    if (assignments.length === 0) {
      return { ok: true, text: '' };
    }
    this.workBatchActive = true;
    this.state.turn = 'work';
    this.state.workBatch = true;
    this.state.debateRunning = true;
    this.pushState();
    this.workerFiles.clear();

    const prepared: PreparedSpeaker[] = [];
    for (const assignment of assignments) {
      const bot = this.freeze.find((item) => item.id === assignment.botId);
      if (!bot) {
        continue;
      }
      const pathLines = assignment.paths.map((path) => `- ${path}`).join('\n');
      const extra = `Assigned paths:\n${pathLines}`;
      const isolationPackets = isTesterAssignment(assignment.paths) ? this.baPackets : undefined;
      const next = await this.prepareSpeaker(
        bot,
        'work',
        1,
        turnInstruction('work', 1, this.userText, extra),
        { assignedPaths: assignment.paths, isolationPackets },
      );
      if (next === 'cancelled') {
        this.workBatchActive = false;
        this.state.workBatch = false;
        this.ingestSettledBatch(this.workFreezeIds());
        return 'cancelled';
      }
      if (next === 'error') {
        this.workBatchActive = false;
        this.state.workBatch = false;
        this.ingestSettledBatch(this.workFreezeIds());
        return 'error';
      }
      if (next === 'overflow') {
        this.completeSlot(bot.id, 'work');
        continue;
      }
      prepared.push(next);
    }

    if (prepared.length === 0) {
      this.ingestSettledBatch(this.workFreezeIds());
      this.workBatchActive = false;
      this.state.workBatch = false;
      this.pushState();
      return { ok: true, text: '' };
    }

    const results = await Promise.all(prepared.map((item) => this.streamPrepared(item)));
    const root = this.workspace.folderFsPath;
    if (root) {
      const catalog = this.catalog.snapshot();
      for (let i = 0; i < prepared.length; i++) {
        const result = results[i]!;
        const bot = prepared[i]!.bot;
        if (!isTurnOk(result)) {
          continue;
        }
        const parsed = this.parser.parseImplementer(result.text, root, catalog);
        if (parsed.ok) {
          this.workerFiles.set(bot.id, parsed.files);
        }
      }
    }
    this.ingestSettledBatch(this.workFreezeIds());
    this.workBatchActive = false;
    this.state.workBatch = false;
    this.pushState();

    if (results.some((item) => item === 'cancelled') || this.cancelled()) {
      return 'cancelled';
    }
    if (results.some((item) => item === 'hung')) {
      await this.waitUntilCancelled();
      return 'hung';
    }
    if (results.some((item) => item === 'error')) {
      return 'error';
    }
    return { ok: true, text: '' };
  }

  private async finishWorkUnion(): Promise<void> {
    const byWorker = [...this.workerFiles.entries()].map(([botId, files]) => ({ botId, files }));
    const claims = workPathClaims(byWorker);
    if (claims.collisions.length === 0) {
      if (claims.remainder.length === 0) {
        this.exitToIdle();
        return;
      }
      this.enterPendingReview(claims.remainder);
      return;
    }
    await this.runArgue(claims.remainder, claims.collisions);
  }

  private claimantsOf(collision: CollisionClaim): { bot: BotRecord; file: ChangeFile }[] {
    const out: { bot: BotRecord; file: ChangeFile }[] = [];
    for (const claim of collision.claimants) {
      const bot = this.freeze.find((item) => item.id === claim.botId);
      if (!bot) {
        continue;
      }
      if ((bot.dispatcher || bot.spec) && !this.assignedPath(bot.id, collision.path)) {
        continue;
      }
      out.push({ bot, file: claim.file });
    }
    return out.sort((a, b) => a.bot.handle.localeCompare(b.bot.handle));
  }

  private assignedPath(botId: string, path: string): boolean {
    return this.workAssignments.some((item) => item.botId === botId && item.paths.includes(path));
  }

  private showHeldUnion(remainder: ChangeFile[], winners: Map<string, ChangeFile>): void {
    const catalog = this.catalog.snapshot();
    const files = [...remainder, ...winners.values()]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => attachFileCites(file, catalog));
    this.changesets.setPending(files, { holdApprove: true });
    this.syncFiles(files.map((file) => file.path));
    this.contextMap?.syncRun();
    this.emitBoard();
  }

  private noteSkippedCollision(path: string): void {
    this.emit({ type: 'chat/notice', text: COPY.skippedCollision(path) });
  }

  private pushArgueState(path: string | undefined, round: 1 | 2 | undefined): void {
    this.state.argue = this.argueActive;
    this.state.arguePath = path;
    this.state.argueRound = round;
    this.state.workBatch = false;
    this.state.debateRunning = true;
    this.state.runType = 'work';
    this.state.phase = 'work';
    this.state.turn = 'argue';
    this.pushState();
  }

  private writerFromLatest(
    latest: Map<string, IsolationPacket>,
    claimants: { bot: BotRecord; file: ChangeFile }[],
  ): { bot: BotRecord; file: ChangeFile } | undefined {
    if (claimants.length === 0) {
      return undefined;
    }
    const handles = claimants.map((item) => item.bot.handle);
    const writers = new Set<string>();
    for (const item of claimants) {
      const packet = latest.get(item.bot.id);
      if (!packet) {
        return undefined;
      }
      const fromDecisions = [...packet.decisions]
        .reverse()
        .map((line) => parseAgreeWriter(line, handles))
        .find((handle) => handle !== undefined);
      if (!fromDecisions) {
        return undefined;
      }
      writers.add(fromDecisions.toLowerCase());
    }
    if (writers.size !== 1) {
      return undefined;
    }
    const key = [...writers][0]!;
    return claimants.find((item) => item.bot.handle.toLowerCase() === key);
  }

  private async runArgue(remainder: ChangeFile[], collisions: CollisionClaim[]): Promise<void> {
    this.argueActive = true;
    this.workBatchActive = false;
    const ordered = [...collisions].sort((a, b) => a.path.localeCompare(b.path));
    const winners = new Map<string, ChangeFile>();
    this.showHeldUnion(remainder, winners);

    for (const collision of ordered) {
      if (this.cancelled()) {
        this.noteSkippedCollision(collision.path);
        continue;
      }
      const outcome = await this.arguePath(collision);
      if (outcome === 'cancelled' || this.cancelled()) {
        this.noteSkippedCollision(collision.path);
        continue;
      }
      if (outcome.winnerFile) {
        winners.set(collision.path, outcome.winnerFile);
        this.showHeldUnion(remainder, winners);
      } else {
        this.noteSkippedCollision(collision.path);
        this.showHeldUnion(remainder, winners);
      }
    }

    this.argueActive = false;
    this.argueClaimantHandles = [];
    this.state.argue = false;
    this.state.arguePath = undefined;
    this.state.argueRound = undefined;

    const union = [...remainder, ...winners.values()].sort((a, b) => a.path.localeCompare(b.path));
    if (union.length === 0) {
      this.exitToIdle();
      return;
    }
    this.enterPendingReview(union);
  }

  private async arguePath(
    collision: CollisionClaim,
  ): Promise<{ winnerFile?: ChangeFile } | 'cancelled'> {
    const claimants = this.claimantsOf(collision);
    this.argueClaimantHandles = claimants.map((item) => item.bot.handle);
    this.pushArgueState(collision.path, 1);
    this.emit({ type: 'chat/notice', text: COPY.argueHeader(collision.path) });

    if (claimants.length === 0) {
      return {};
    }

    const latest = new Map<string, IsolationPacket>();
    const handlesLine = this.argueClaimantHandles.map((handle) => `@${handle}`).join(', ');

    for (let round = 1; round <= 2; round++) {
      if (this.cancelled()) {
        return 'cancelled';
      }
      const argueRound = round === 2 ? 2 : 1;
      this.pushArgueState(collision.path, argueRound);
      this.emit({ type: 'chat/notice', text: COPY.argueRound(argueRound) });

      for (const claimant of claimants) {
        if (this.cancelled()) {
          return 'cancelled';
        }
        this.remainingSlots.push({ botId: claimant.bot.id, turn: 'argue' });
        const extra = `Path: ${collision.path}\nClaimants: ${handlesLine}`;
        const result = await this.runTurn(
          claimant.bot,
          'argue',
          argueRound,
          turnInstruction('argue', argueRound, this.userText, extra),
        );
        this.ingestSettledBatch(this.workFreezeIds());
        if (result === 'cancelled' || this.cancelled()) {
          return 'cancelled';
        }
        if (!isTurnOk(result)) {
          continue;
        }
        const published = this.sessions.listPublished();
        const mine = [...published].reverse().find((packet) => packet.fromBotId === claimant.bot.id);
        if (mine) {
          latest.set(claimant.bot.id, mine);
        }
      }

      const winner = this.writerFromLatest(latest, claimants);
      if (winner) {
        return { winnerFile: winner.file };
      }
    }
    return {};
  }

  private async sendDuringWorkBatch(text: string): Promise<void> {
    const parsed = parseMentions(text);
    const resolved: BotRecord[] = [];
    const unresolved: string[] = [];
    for (const handle of parsed.handles) {
      const bot = this.registry.getByHandle(handle);
      if (bot) {
        if (!resolved.some((item) => item.id === bot.id)) {
          resolved.push(bot);
        }
      } else {
        unresolved.push(handle);
      }
    }
    if (unresolved.length > 0) {
      this.emit({ type: 'error', code: 'unknown-handle', message: COPY.unknownHandle(unresolved[0]!) });
      return;
    }
    if (resolved.length > 1) {
      this.emit({ type: 'error', code: 'multiple-mentions', message: COPY.multipleMentions });
      return;
    }
    const solo = resolved[0];
    if (!solo) {
      this.emit({ type: 'error', code: 'work-running', message: COPY.workBatchRunning });
      return;
    }
    if (this.isWorkInflight(solo.id)) {
      await this.waitForBotIdle(solo.id);
      if (this.cancelled() || this.state.splitOpen) {
        return;
      }
    }
    const notice = solo.active ? undefined : COPY.inactiveTurn(solo.name);
    await this.runTurn(solo, 'direct', this.state.round || 1, turnInstruction('direct', 1, text), {
      inactiveNotice: notice,
      solo: true,
      skipInbox: true,
    });
  }

  private isWorkInflight(botId: string): boolean {
    if (this.inflightBotIds.has(botId)) {
      return true;
    }
    return (
      (this.workBatchActive && this.remainingSlots.some((slot) => slot.botId === botId && slot.turn === 'work')) ||
      (this.argueActive && this.remainingSlots.some((slot) => slot.botId === botId && slot.turn === 'argue'))
    );
  }

  private markInflight(botId: string, on: boolean): void {
    if (on) {
      this.inflightBotIds.add(botId);
      return;
    }
    this.inflightBotIds.delete(botId);
    this.notifyIdle(botId);
  }

  private notifyIdle(botId: string): void {
    if (this.isWorkInflight(botId)) {
      return;
    }
    const waiters = this.inflightWaiters.get(botId) ?? [];
    this.inflightWaiters.delete(botId);
    for (const waiter of waiters) {
      waiter();
    }
  }

  private waitForBotIdle(botId: string): Promise<void> {
    if (!this.isWorkInflight(botId)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const list = this.inflightWaiters.get(botId) ?? [];
      list.push(resolve);
      this.inflightWaiters.set(botId, list);
    });
  }

  private async readAssignedFiles(paths: string[]): Promise<{ path: string; content: string }[]> {
    const out: { path: string; content: string }[] = [];
    for (const path of paths) {
      out.push({ path, content: await this.readFileInPlay(path) });
    }
    return out;
  }

  private publishPacket(packet: IsolationPacket): void {
    const specs = matchSpecBodies(
      this.catalog.snapshot(),
      citedIdsFromFiles(this.changesets.files),
      this.userText,
    );
    let next: IsolationPacket = specs.length > 0 ? { ...packet, specs } : packet;
    const nodeIds = this.contextMap?.nodeIdsFor(next);
    if (nodeIds && nodeIds.length > 0) {
      next = { ...next, nodeIds };
    }
    this.bus.publish(next);
    this.sessions.recordPublished(next);
    const targets = this.workRunActive ? this.freeze.map((bot) => bot.id) : this.downstreamIds();
    for (const botId of targets) {
      this.sessions.enqueue(botId, next);
    }
    this.contextMap?.syncRun();
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

type SpeakerExtras = {
  inactiveNotice?: string;
  solo?: boolean;
  skipInbox?: boolean;
  assignedPaths?: string[];
  isolationPackets?: IsolationPacket[];
};

type PreparedSpeaker = {
  bot: BotRecord;
  turn: TurnKind;
  round: number;
  instruction: string;
  inbox: IsolationPacket[];
  packed: { ok: true; messages: PromptMessage[]; tokens: number };
  turnModelId?: string | null;
  extras?: SpeakerExtras;
};

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
