import type { BotDraft, BotRecord } from '../domain/bot';
import type { ApplyMode } from '../domain/changeset';
import type { HostToUi, UiToHost } from '../protocol/messages';
import { BotRegistry } from './bot-registry';
import { ChangesetStore } from './changeset-store';
import type { ICopilotGateway } from './copilot-gateway';
import { COPY, copilotStatusMessage } from './copy';
import { EmptyMcpPort, McpGateway } from './mcp-gateway';
import type { McpBatchApprovalOptions } from './mcp-action-store';
import {
  ONBOARDING_SAMPLE_TASK,
  OnboardingStore,
  WORKER_BOT_TEMPLATES,
  type WorkerTemplateId,
} from './onboarding';
import { Orchestrator } from './orchestrator';
import { PatchParser } from './patch-parser';
import { PromptBuilder } from './prompt-builder';
import { ThreadStore } from './thread-store';
import { EmptyLspSlicePort, type LspSlicePort } from './lsp-slice';
import { RunBoardStore } from './run-board';
import type {
  ApplyEditPort,
  DiffCloser,
  FileSystemPort,
  ProposedDocHost,
  StateStore,
  WorkspaceContextPort,
} from './ports';
import {
  ContextMapHost,
  EmptyContextMapNeighborhood,
  noopContextMapActions,
  type ContextMapActions,
  type ContextMapNeighborhood,
} from './context-map';
import {
  deserializeChangeFiles,
  serializeChangeFiles,
  WorkspaceRecoveryStore,
  type WorkspaceRecoverySnapshot,
} from './recovery';
import type { RepositoryContextService } from './repository-context';

export class Application {
  readonly registry: BotRegistry;
  readonly orchestrator: Orchestrator;
  readonly changesets: ChangesetStore;
  readonly thread: ThreadStore;
  readonly parser = new PatchParser();
  readonly prompts = new PromptBuilder();
  readonly board: RunBoardStore;
  readonly lsp: LspSlicePort;
  readonly mcp: McpGateway;
  readonly contextMap: ContextMapHost;
  readonly onboarding: OnboardingStore;
  readonly recovery: WorkspaceRecoveryStore;
  private readonly emitRaw: (msg: HostToUi) => void;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    store: StateStore,
    readonly gateway: ICopilotGateway,
    applyPort: ApplyEditPort,
    fs: FileSystemPort,
    private readonly workspace: WorkspaceContextPort,
    emit: (msg: HostToUi) => void,
    docs?: ProposedDocHost,
    diffs?: DiffCloser,
    mcp?: McpGateway,
    lsp?: LspSlicePort,
    map?: {
      neighborhood?: ContextMapNeighborhood;
      actions?: ContextMapActions;
      repository?: RepositoryContextService;
    },
    recoveryStore?: StateStore,
  ) {
    this.emitRaw = emit;
    this.thread = new ThreadStore();
    const emitRecorded = (message: HostToUi): void => this.emit(message);
    this.mcp = mcp ?? new McpGateway(new EmptyMcpPort(), emitRecorded, { settleMs: 0 });
    this.lsp = lsp ?? new EmptyLspSlicePort();
    this.board = new RunBoardStore();
    this.registry = new BotRegistry(store);
    this.onboarding = new OnboardingStore(store);
    this.recovery = new WorkspaceRecoveryStore(recoveryStore ?? store);
    this.changesets = new ChangesetStore(applyPort, fs, emitRecorded, docs, diffs);
    this.orchestrator = new Orchestrator(
      this.registry,
      gateway,
      this.prompts,
      this.parser,
      this.changesets,
      workspace,
      emitRecorded,
      this.mcp,
      this.board,
      this.lsp,
      fs,
      map?.repository,
    );
    this.contextMap = new ContextMapHost(
      emitRecorded,
      map?.neighborhood ?? new EmptyContextMapNeighborhood(),
      {
        bots: () => this.orchestrator.getFrozenBots(),
        published: () => this.orchestrator.sessions.listPublished(),
        proposedFiles: () => this.changesets.files ?? [],
      },
      map?.actions ?? noopContextMapActions,
    );
    this.orchestrator.bindContextMap(this.contextMap);
  }

  snapshotBots(): void {
    this.emit({ type: 'bots/snapshot', bots: this.registry.list() });
  }

  async ensureCoreBots(): Promise<void> {
    await this.registry.ensureCoreBots();
    this.snapshotBots();
  }

  snapshotOnboarding(): void {
    const state = this.onboarding.snapshot();
    this.emit({ type: 'onboarding/state', ...state, sampleTask: ONBOARDING_SAMPLE_TASK });
  }

  reopenOnboarding(): void {
    const state = this.onboarding.reopen();
    this.emit({ type: 'onboarding/state', ...state, sampleTask: ONBOARDING_SAMPLE_TASK });
  }

  dismissOnboarding(): void {
    const state = this.onboarding.dismiss();
    this.emit({ type: 'onboarding/state', ...state, sampleTask: ONBOARDING_SAMPLE_TASK });
  }

  async createWorkerTemplate(template: WorkerTemplateId): Promise<BotRecord> {
    const preset = WORKER_BOT_TEMPLATES[template];
    const bot = await this.createBot({ ...preset, handle: undefined });
    return bot;
  }

  private async completeOnboarding(): Promise<void> {
    const state = await this.onboarding.markComplete();
    this.emit({ type: 'onboarding/state', ...state, sampleTask: ONBOARDING_SAMPLE_TASK });
  }

  async createBot(draft: BotDraft): Promise<BotRecord> {
    const bot = await this.registry.create(draft);
    this.snapshotBots();
    return bot;
  }

  async updateBot(
    id: string,
    draft: BotDraft & { handle: string; active: boolean },
  ): Promise<BotRecord> {
    const bot = await this.registry.update(id, draft);
    this.snapshotBots();
    return bot;
  }

  async toggleBot(id: string, active?: boolean): Promise<BotRecord> {
    const bot = await this.registry.toggle(id, active);
    this.snapshotBots();
    return bot;
  }

  async deleteBot(id: string): Promise<void> {
    await this.registry.delete(id);
    this.snapshotBots();
  }

  async send(text: string, runType: 'work' | 'debate' = 'debate'): Promise<void> {
    this.thread.appendUser(text);
    await this.orchestrator.send(text, runType);
  }

  stop(): void {
    this.orchestrator.stop();
  }

  async continueDebate(): Promise<void> {
    await this.orchestrator.continueDebate();
  }

  async pick(botId: string): Promise<void> {
    await this.orchestrator.pick(botId);
  }

  async approve(mode: ApplyMode = 'initial'): Promise<boolean> {
    if (!this.changesets.hasPending()) {
      return false;
    }
    const files = this.changesets.files;
    if (!files?.length) {
      return false;
    }
    const ctx = await this.workspace.getContext();
    if (!ctx.folderFsPath) {
      this.emit({ type: 'error', code: 'no-workspace', message: COPY.applyNoFolder });
      return false;
    }
    const n = files.length;
    const ok = await this.changesets.approve(mode);
    if (ok) {
      this.orchestrator.noteRunCleared({ invalidateSlice: true });
      const text = COPY.approvedNotice(n);
      this.emit({ type: 'chat/notice', text });
      await this.completeOnboarding();
    } else {
      this.orchestrator.noteApplyFailed(this.changesets.hasPending());
    }
    return ok;
  }

  async retry(): Promise<boolean> {
    return this.approve('retry');
  }

  async reject(): Promise<void> {
    const had = this.changesets.hasPending();
    await this.changesets.reject();
    this.orchestrator.noteRunCleared({ invalidateSlice: false });
    if (had) {
      this.emit({ type: 'chat/notice', text: COPY.rejectedNotice });
    }
  }

  /** Grain B: invoke staged MCP only. Does not applyEdit or set applyFailed. Allowed while Split is open. */
  async approveMcp(options: McpBatchApprovalOptions = {}): Promise<boolean> {
    const ok = await this.mcp.approveStaged(options);
    if (ok) {
      await this.completeOnboarding();
    }
    return ok;
  }

  /** Grain B: drop the MCP batch only. File changeset untouched. */
  rejectMcp(): void {
    this.mcp.rejectStaged();
  }

  /** Session reload of pending MCP. Files stay. */
  reloadMcpActions(): void {
    this.mcp.rejectStaged();
  }

  offerRecovery(): void {
    const snapshot = this.recovery.offered();
    this.emit({
      type: 'recovery/state',
      recovery: {
        available: !!snapshot,
        savedAt: snapshot?.savedAt,
        phase: snapshot?.run.phase,
        fileCount: snapshot?.pendingFiles.length ?? 0,
        mcpCount: snapshot?.pendingMcpActions.length ?? 0,
        canResume: !!snapshot?.userText,
      },
    });
  }

  async reviewRecovered(): Promise<void> {
    const snapshot = this.recovery.offered();
    if (!snapshot) {
      return;
    }
    await this.recovery.resolve();
    this.thread.restore(snapshot.thread);
    if (snapshot.thread.board) {
      this.board.restore(snapshot.thread.board);
    }
    this.orchestrator.restoreRecovery(snapshot.runId, snapshot.run, snapshot.tasks);
    if (snapshot.pendingFiles.length > 0) {
      await this.changesets.setPendingPrepared(deserializeChangeFiles(snapshot.pendingFiles));
    }
    if (snapshot.pendingMcpActions.length > 0) {
      this.mcp.actions.restore(snapshot.pendingMcpActions);
    }
    this.emitRaw({ type: 'chat/transcript-snapshot', snapshot: this.thread.snapshot() });
    this.emit({
      type: 'recovery/state',
      recovery: { available: false, fileCount: 0, mcpCount: 0, canResume: false },
    });
    this.scheduleRecovery();
  }

  async resumeRecovered(): Promise<void> {
    const snapshot = this.recovery.offered();
    if (!snapshot) {
      return;
    }
    const text = snapshot.userText;
    const runType = snapshot.run.runType === 'work' ? 'work' : 'debate';
    await this.reviewRecovered();
    if (!this.changesets.hasPending() && !this.mcp.actions.hasPending() && text) {
      await this.send(text, runType);
    }
  }

  async discardRecovered(): Promise<void> {
    await this.recovery.discard();
    this.thread.clear();
    this.board.clear();
    await this.changesets.reject();
    this.mcp.actions.clear();
    this.emit({
      type: 'recovery/state',
      recovery: { available: false, fileCount: 0, mcpCount: 0, canResume: false },
    });
  }

  async persistRecoveryNow(): Promise<void> {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }
    if (this.recovery.offered()) {
      return;
    }
    const orchestrator = this.orchestrator.recoverySnapshot();
    const thread = this.thread.snapshot();
    const files = this.changesets.files ?? [];
    const mcpActions = this.mcp.actions.exportState();
    const meaningful =
      thread.entries.length > 0 ||
      files.length > 0 ||
      mcpActions.length > 0 ||
      orchestrator.run.phase !== 'idle';
    if (!meaningful) {
      await this.recovery.discard();
      return;
    }
    const snapshot: WorkspaceRecoverySnapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      runId: orchestrator.runId,
      userText: orchestrator.userText,
      run: orchestrator.run,
      thread,
      tasks: orchestrator.tasks,
      pendingFiles: serializeChangeFiles(files),
      pendingMcpActions: mcpActions,
    };
    await this.recovery.save(snapshot);
  }

  private scheduleRecovery(): void {
    if (this.recoveryTimer || this.recovery.offered()) {
      return;
    }
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined;
      void this.persistRecoveryNow();
    }, 250);
  }

  async recheck(): Promise<void> {
    const status = await this.gateway.ensureAvailable();
    this.emit({ type: 'copilot/status', status, message: copilotStatusMessage(status) });
  }

  async handleUi(msg: UiToHost): Promise<void> {
    switch (msg.type) {
      case 'bots/create':
        await this.createBot({
          name: msg.draft.name,
          handle: msg.draft.handle,
          persona: msg.draft.persona,
          role: msg.draft.role,
          instructions: msg.draft.instructions,
          active: msg.draft.active,
          attachments: msg.draft.attachments,
          modelId: msg.draft.modelId,
          dispatcher: msg.draft.dispatcher,
          spec: msg.draft.spec,
        });
        break;
      case 'bots/update': {
        const existing = this.registry.getById(msg.id);
        if (!existing) {
          break;
        }
        const patch = msg.patch ?? {};
        await this.updateBot(msg.id, {
          name: patch.name ?? msg.name ?? existing.name,
          handle: patch.handle ?? msg.handle ?? existing.handle,
          persona: patch.persona ?? msg.persona ?? existing.persona,
          role: patch.role ?? msg.role ?? existing.role,
          instructions: patch.instructions ?? msg.instructions ?? existing.instructions,
          active: msg.active ?? existing.active,
          attachments: patch.attachments ?? existing.attachments,
          modelId: patch.modelId !== undefined ? patch.modelId : existing.modelId,
          dispatcher: patch.dispatcher !== undefined ? patch.dispatcher : existing.dispatcher,
          spec: patch.spec !== undefined ? patch.spec : existing.spec,
        });
        break;
      }
      case 'bots/toggle':
        await this.toggleBot(msg.id, msg.active);
        break;
      case 'bots/delete':
        await this.deleteBot(msg.id);
        break;
      case 'chat/send':
        await this.send(msg.text, msg.runType === 'work' ? 'work' : 'debate');
        break;
      case 'chat/stop':
        this.stop();
        break;
      case 'split/continue':
        await this.continueDebate();
        break;
      case 'split/pick':
        await this.pick(msg.botId);
        break;
      case 'changeset/approve':
        await this.approve();
        break;
      case 'changeset/retry':
        await this.retry();
        break;
      case 'changeset/reject':
        await this.reject();
        break;
      case 'changeset/toggle-file':
        this.changesets.setIncluded(msg.path, msg.included);
        break;
      case 'changeset/regenerate-stale':
        await this.orchestrator.regenerateStaleChanges();
        break;
      case 'recovery/resume':
        await this.resumeRecovered();
        break;
      case 'recovery/review':
        await this.reviewRecovered();
        break;
      case 'recovery/discard':
        await this.discardRecovered();
        break;
      case 'mcp/actions-approve':
        await this.approveMcp();
        break;
      case 'mcp/actions-reject':
        this.rejectMcp();
        break;
      case 'onboarding/dismiss':
        this.dismissOnboarding();
        break;
      case 'onboarding/reopen':
        this.reopenOnboarding();
        break;
      case 'onboarding/template':
        await this.createWorkerTemplate(msg.template);
        break;
      case 'copilot/recheck':
        await this.recheck();
        break;
      case 'review/open-diff':
      case 'bots/attach-pick':
      case 'bots/attach-remove':
      case 'bots/export-self':
        break;
      case 'contextMap/expand-file':
        await this.contextMap.expandFile(msg.uri);
        break;
      case 'contextMap/select':
        await this.contextMap.select(msg.nodeId);
        break;
      case 'contextMap/open':
        await this.contextMap.open(msg.nodeId);
        break;
    }
  }

  private emit(message: HostToUi): void {
    this.thread.recordHostMessage(message);
    this.emitRaw(message);
    if (message.type !== 'recovery/state') {
      this.scheduleRecovery();
    }
  }
}
