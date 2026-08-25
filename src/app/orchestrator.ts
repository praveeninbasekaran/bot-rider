import type { BotRecord } from '../domain/bot';
import type { RunStateDto, TurnKind } from '../domain/run-state';
import { idleRunState } from '../domain/run-state';
import type { HostToUi, WorkspaceContext } from '../protocol/messages';
import { COPY, copilotStatusMessage } from './copy';
import { CancelSource } from './cancel';
import type { BotRegistry } from './bot-registry';
import type { ICopilotGateway } from './copilot-gateway';
import { HungError, mapCopilotError } from './copilot-gateway';
import { PromptBuilder, turnInstruction, type HistoryTurn } from './prompt-builder';
import { PatchParser } from './patch-parser';
import type { ChangesetStore } from './changeset-store';
import type { ThreadStore } from './thread-store';
import { oneLine, parseMentions, parseVote, stripNeedEditTrailer } from './mentions';
import type { WorkspaceContextPort } from './ports';

export class Orchestrator {
  private state: RunStateDto = idleRunState();
  private cts: CancelSource | undefined;
  private freeze: BotRecord[] = [];
  private history: HistoryTurn[] = [];
  private userText = '';
  private workspace: WorkspaceContext = { otherTabPaths: [] };
  private loopActive = false;

  constructor(
    private readonly registry: BotRegistry,
    private readonly gateway: ICopilotGateway,
    private readonly prompts: PromptBuilder,
    private readonly parser: PatchParser,
    private readonly changesets: ChangesetStore,
    private readonly thread: ThreadStore,
    private readonly workspacePort: WorkspaceContextPort,
    private readonly emit: (msg: HostToUi) => void,
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

  async send(text: string): Promise<void> {
    if (this.state.splitOpen) {
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

    this.userText = text;
    this.history = [];
    this.cts = new CancelSource();
    this.loopActive = true;

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
    this.cts = new CancelSource();
    this.loopActive = true;
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
    this.state = {
      ...this.state,
      splitOpen: false,
      debateRunning: true,
      phase: 'implement',
    };
    this.pushState();
    await this.runImplementer(bot, COPY.pickDirection(bot.name));
    this.loopActive = false;
  }

  stop(): void {
    this.cts?.cancel();
    if (this.state.debateRunning) {
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
        votes.set(bot.id, parseVote(result.text));
      }
      const allAgree = this.freeze.every((b) => votes.get(b.id) === 'AGREE');
      if (allAgree) {
        const implementer = this.freeze[0];
        if (implementer) {
          await this.runImplementer(implementer);
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
      await this.runImplementer(bot);
      return;
    }
    this.exitToIdle();
  }

  private async runImplementer(bot: BotRecord, notice?: string): Promise<void> {
    if (this.cancelled()) {
      return;
    }
    this.state.phase = 'implement';
    this.state.turn = 'implement';
    this.state.currentBotId = bot.id;
    this.state.debateRunning = true;
    this.pushState();
    const result = await this.runTurn(
      bot,
      'implement',
      this.state.round || 1,
      turnInstruction('implement', this.state.round || 1, this.userText),
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
    const parsed = this.parser.parseImplementer(result.text, root);
    if (!parsed.ok) {
      this.fail(parsed.code, parsed.code === 'parse-failed' ? COPY.parseFailed : COPY.validateFailed);
      return;
    }
    this.changesets.setPending(parsed.files);
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

    const messages = await this.prompts.build({
      bot,
      workspace: this.workspace,
      history: this.history,
      instruction,
      counter: this.gateway,
    });

    let full = '';
    try {
      const streamed = await this.gateway.stream(messages, this.cts!.token, (chunk) => {
        full += chunk;
        this.emit({ type: 'chat/token', botId: bot.id, delta: chunk });
      });
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
    }
    if (turn === 'consensus') {
      vote = parseVote(visible);
    }

    this.history.push({ handle: bot.handle, text: visible });
    this.thread.append({ role: 'assistant', text: visible, handle: bot.handle, botId: bot.id });
    this.emit({
      type: 'chat/turn-end',
      botId: bot.id,
      turn,
      text: visibleBody(visible, vote, trailer),
      handle: bot.handle,
      vote,
      trailer,
    });
    return { ok: true, text: turn === 'implement' ? full : visible, trailer, vote };
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
    this.emit({
      type: 'chat/split',
      positions: this.splitPositions(),
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
    this.state = {
      ...idleRunState(),
      applyFailed: this.changesets.applyFailed,
    };
    this.freeze = [];
    this.pushState();
  }

  private fail(code: 'unknown-handle' | 'multiple-mentions' | 'zero-active' | 'no-workspace' | 'parse-failed' | 'validate-failed' | 'copilot', message: string): void {
    this.emit({ type: 'error', code, message });
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

function visibleBody(
  text: string,
  vote?: 'AGREE' | 'DISSENT',
  trailer?: 'NEED_EDIT' | 'NO_EDIT',
): string {
  let out = text;
  if (trailer) {
    out = out.replace(/\s*(NEED_EDIT|NO_EDIT)\.?$/i, '').replace(/\s+$/g, '');
  }
  if (vote) {
    out = out.replace(/^\s*(AGREE|DISSENT)\b[^\n]*/i, '').trimStart();
  }
  return out;
}
