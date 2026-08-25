import type { BotDraft, BotRecord } from '../domain/bot';
import type { HostToUi, UiToHost } from '../protocol/messages';
import { BotRegistry } from './bot-registry';
import { ChangesetStore } from './changeset-store';
import type { ICopilotGateway } from './copilot-gateway';
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

  constructor(
    store: StateStore,
    readonly gateway: ICopilotGateway,
    applyPort: ApplyEditPort,
    fs: FileSystemPort,
    workspace: WorkspaceContextPort,
    private readonly emit: (msg: HostToUi) => void,
    docs?: ProposedDocHost,
    diffs?: DiffCloser,
  ) {
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

  async approve(): Promise<boolean> {
    const ok = await this.changesets.approve('initial');
    this.orchestrator.noteApplyFailed(!ok && this.changesets.hasPending());
    return ok;
  }

  async retry(): Promise<boolean> {
    const ok = await this.changesets.approve('retry');
    this.orchestrator.noteApplyFailed(!ok && this.changesets.hasPending());
    return ok;
  }

  async reject(): Promise<void> {
    await this.changesets.reject();
    this.orchestrator.noteApplyFailed(false);
  }

  async recheck(): Promise<void> {
    const status = await this.gateway.ensureAvailable();
    this.emit({ type: 'copilot/status', status });
  }

  async handleUi(msg: UiToHost): Promise<void> {
    switch (msg.type) {
      case 'bots/create':
        await this.createBot(msg);
        break;
      case 'bots/update':
        await this.updateBot(msg.id, msg);
        break;
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
        if (msg.botId) {
          await this.pick(msg.botId);
        }
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
