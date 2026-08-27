import type { BotDraft, BotRecord } from '../domain/bot';
import type { ApplyMode } from '../domain/changeset';
import type { HostToUi, UiToHost } from '../protocol/messages';
import { BotRegistry } from './bot-registry';
import { ChangesetStore } from './changeset-store';
import type { ICopilotGateway } from './copilot-gateway';
import { COPY, copilotStatusMessage } from './copy';
import { EmptyMcpPort, McpGateway } from './mcp-gateway';
import { Orchestrator } from './orchestrator';
import { PatchParser } from './patch-parser';
import { PromptBuilder } from './prompt-builder';
import { ThreadStore } from './thread-store';
import type {
  ApplyEditPort,
  DiffCloser,
  FileSystemPort,
  ProposedDocHost,
  StateStore,
  WorkspaceContextPort,
} from './ports';

export class Application {
  readonly registry: BotRegistry;
  readonly orchestrator: Orchestrator;
  readonly changesets: ChangesetStore;
  readonly thread: ThreadStore;
  readonly parser = new PatchParser();
  readonly prompts = new PromptBuilder();
  readonly mcp: McpGateway;

  constructor(
    store: StateStore,
    readonly gateway: ICopilotGateway,
    applyPort: ApplyEditPort,
    fs: FileSystemPort,
    private readonly workspace: WorkspaceContextPort,
    private readonly emit: (msg: HostToUi) => void,
    docs?: ProposedDocHost,
    diffs?: DiffCloser,
    mcp?: McpGateway,
  ) {
    this.mcp = mcp ?? new McpGateway(new EmptyMcpPort(), emit, { settleMs: 0 });
    this.registry = new BotRegistry(store);
    this.thread = new ThreadStore();
    this.changesets = new ChangesetStore(applyPort, fs, emit, docs, diffs);
    this.orchestrator = new Orchestrator(
      this.registry,
      gateway,
      this.prompts,
      this.parser,
      this.changesets,
      this.thread,
      workspace,
      emit,
      this.mcp,
    );
  }

  snapshotBots(): void {
    this.emit({ type: 'bots/snapshot', bots: this.registry.list() });
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

  async send(text: string): Promise<void> {
    await this.orchestrator.send(text);
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
    this.orchestrator.noteApplyFailed(!ok && this.changesets.hasPending());
    if (ok) {
      const text = COPY.approvedNotice(n);
      this.thread.append({ role: 'notice', text });
      this.emit({ type: 'chat/notice', text });
    }
    return ok;
  }

  async retry(): Promise<boolean> {
    return this.approve('retry');
  }

  async reject(): Promise<void> {
    const had = this.changesets.hasPending();
    await this.changesets.reject();
    this.orchestrator.noteApplyFailed(false);
    if (had) {
      this.thread.append({ role: 'notice', text: COPY.rejectedNotice });
      this.emit({ type: 'chat/notice', text: COPY.rejectedNotice });
    }
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
        await this.send(msg.text);
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
      case 'copilot/recheck':
        await this.recheck();
        break;
      case 'review/open-diff':
        break;
    }
  }
}
