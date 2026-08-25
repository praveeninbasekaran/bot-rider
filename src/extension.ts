import * as vscode from 'vscode';
import { Application } from './app/application';
import { BotsTreeProvider, BotTreeItem } from './adapters/bots-tree';
import { ChatExpandPanel } from './adapters/chat-expand-panel';
import { ChatHub, ChatViewProvider } from './adapters/chat-view';
import { BotFormPanel } from './adapters/bot-form-panel';
import { ContextKeys } from './adapters/context-keys';
import {
  ProposedContentProvider,
  closeProposedDiffs,
  PROPOSED_SCHEME,
} from './adapters/proposed-content-provider';
import { openProposedDiff, ReviewTreeProvider } from './adapters/review-tree';
import { createCopilotGateway } from './adapters/vscode-lm-gateway';
import { VsCodeWorkspacePort } from './adapters/vscode-workspace';
import { COPY } from './app/copy';
import type { HostToUi, UiToHost } from './protocol/messages';

class MementoStore {
  constructor(private readonly memento: vscode.Memento) {}
  get<T>(key: string): T | undefined {
    return this.memento.get<T>(key);
  }
  update<T>(key: string, value: T): Thenable<void> {
    return this.memento.update(key, value);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const keys = new ContextKeys();
  const workspace = new VsCodeWorkspacePort();
  const proposed = new ProposedContentProvider();
  let appRef: Application | undefined;
  let chatExpanded = false;
  let botsTree: BotsTreeProvider;
  let reviewTree: ReviewTreeProvider;
  let gatewayStatus: string = 'settling';

  const hub = new ChatHub(async (msg) => {
    await handleUi(msg);
  });

  const emit = (msg: HostToUi): void => {
    hub.post(msg);
    if (msg.type === 'bots/snapshot') {
      botsTree?.refresh();
    }
    if (
      msg.type === 'changeset/preview' ||
      msg.type === 'changeset/cleared' ||
      msg.type === 'changeset/apply-failed'
    ) {
      reviewTree?.refresh();
    }
    if (msg.type === 'changeset/cleared' && msg.reason === 'approve') {
      void vscode.window.showInformationMessage(COPY.appliedToast(msg.fileCount));
    }
    void syncKeys();
  };

  const gateway = createCopilotGateway(context, (status) => {
    gatewayStatus = status;
    emit({ type: 'copilot/status', status });
  });

  const app = new Application(
    new MementoStore(context.globalState),
    gateway,
    workspace,
    workspace,
    workspace,
    emit,
    proposed,
    { closeProposedDiffs },
  );
  appRef = app;

  botsTree = new BotsTreeProvider(app);
  reviewTree = new ReviewTreeProvider(app);
  const form = new BotFormPanel(context.extensionUri, app);
  const expand = new ChatExpandPanel(context.extensionUri, hub, keys, (open) => {
    chatExpanded = open;
    void syncKeys();
  });

  const botsView = vscode.window.createTreeView('botrider.bots', {
    treeDataProvider: botsTree,
    manageCheckboxStateManually: true,
  });
  botsTree.attach(botsView);

  const reviewView = vscode.window.createTreeView('botrider.review', {
    treeDataProvider: reviewTree,
  });

  context.subscriptions.push(
    botsView,
    reviewView,
    vscode.workspace.registerTextDocumentContentProvider(PROPOSED_SCHEME, proposed),
    vscode.window.registerWebviewViewProvider(
      'botrider.chat',
      new ChatViewProvider(context.extensionUri, hub),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand('botrider.bots.create', () => form.open()),
    vscode.commands.registerCommand('botrider.bots.edit', (item?: BotTreeItem) => {
      const id = item?.bot.id;
      if (!id) {
        return;
      }
      const record = app.registry.getById(id);
      if (record) {
        form.open(record);
      }
    }),
    vscode.commands.registerCommand('botrider.bots.delete', async (item?: BotTreeItem) => {
      const id = item?.bot.id;
      if (!id) {
        return;
      }
      const bot = app.registry.getById(id);
      const pick = await vscode.window.showWarningMessage(
        `Delete ${bot?.name ?? 'this bot'}?`,
        { modal: true },
        'Delete',
      );
      if (pick === 'Delete') {
        await app.deleteBot(id);
      }
    }),
    vscode.commands.registerCommand('botrider.bots.toggle', async (item?: BotTreeItem) => {
      if (item?.bot.id) {
        await app.toggleBot(item.bot.id);
      }
    }),
    vscode.commands.registerCommand('botrider.chat.expand', () => expand.reveal()),
    vscode.commands.registerCommand('botrider.chat.stop', () => app.stop()),
    vscode.commands.registerCommand('botrider.changeset.approve', () => app.approve()),
    vscode.commands.registerCommand('botrider.changeset.reject', () => app.reject()),
    vscode.commands.registerCommand('botrider.changeset.retry', () => app.retry()),
    vscode.commands.registerCommand(
      'botrider.review.openDiff',
      async (item?: { file?: { path: string; op: 'create' | 'update' | 'delete' } }) => {
        if (item?.file) {
          await openProposedDiff(item.file, proposed);
        }
      },
    ),
    vscode.commands.registerCommand('botrider.split.continue', () => app.continueDebate()),
    vscode.commands.registerCommand('botrider.split.pick', () => pickBot()),
    vscode.commands.registerCommand('botrider.copilot.recheck', () => app.recheck()),
  );

  async function pickBot(): Promise<void> {
    const bots = app.orchestrator.getFrozenBots();
    if (!bots.length) {
      return;
    }
    const picked = await vscode.window.showQuickPick(
      bots.map((b) => ({ label: b.name, description: `@${b.handle}`, id: b.id })),
      { title: 'Pick a Bot to Decide', placeHolder: 'Choose whose position becomes the direction' },
    );
    if (picked) {
      await app.pick(picked.id);
    }
  }

  async function handleUi(msg: UiToHost): Promise<void> {
    try {
      if (msg.type === 'review/open-diff') {
        await openProposedDiff({ path: msg.path, op: msg.op ?? 'update' }, proposed);
        return;
      }
      await app.handleUi(msg);
    } catch (err) {
      void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function syncKeys(): Promise<void> {
    const current = appRef;
    if (!current) {
      return;
    }
    const bots = current.registry.list();
    const run = current.orchestrator.getRunState();
    await keys.sync({
      hasBots: bots.length > 0,
      hasActiveBots: bots.some((b) => b.active),
      hasPendingChanges: current.changesets.hasPending(),
      debateRunning: run.debateRunning,
      splitOpen: run.splitOpen,
      copilotReady: gatewayStatus === 'ready',
      chatExpanded,
      applyFailed: current.changesets.applyFailed,
    });
  }

  app.snapshotBots();
  void syncKeys();
}

export function deactivate(): void {
  // Session-only transcript and pending changeset die with the host.
}
