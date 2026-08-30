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
import { VsCodeMcpPort } from './adapters/vscode-mcp';
import { VsCodeWorkspacePort } from './adapters/vscode-workspace';
import { VsCodeLspSlicePort } from './adapters/vscode-lsp';
import type { HostToUi, UiToHost } from './protocol/messages';
import { COPY, copilotStatusMessage } from './app/copy';
import { MCP_SETTLE_MS, McpGateway } from './app/mcp-gateway';

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
      msg.type === 'changeset/apply-failed' ||
      msg.type === 'mcp/actions-preview' ||
      msg.type === 'mcp/actions-cleared' ||
      msg.type === 'mcp/actions-failed'
    ) {
      reviewTree?.refresh();
    }
    if (msg.type === 'error' && msg.code === 'no-workspace' && msg.message === COPY.applyNoFolder) {
      void vscode.window.showErrorMessage(msg.message);
    }
    void syncKeys();
  };

  const mcp = new McpGateway(new VsCodeMcpPort(), emit, { settleMs: MCP_SETTLE_MS });
  const gateway = createCopilotGateway(context, (status) => {
    gatewayStatus = status;
    emit({ type: 'copilot/status', status, message: copilotStatusMessage(status) });
  }, mcp);
  const lsp = new VsCodeLspSlicePort();

  const app = new Application(
    new MementoStore(context.globalState),
    gateway,
    workspace,
    workspace,
    workspace,
    emit,
    proposed,
    { closeProposedDiffs },
    mcp,
    lsp,
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
    canSelectMany: false,
  });
  reviewTree.attach(reviewView);

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
    vscode.commands.registerCommand('botrider.changeset.approve', () => approveChanges()),
    vscode.commands.registerCommand('botrider.changeset.reject', () => app.reject()),
    vscode.commands.registerCommand('botrider.changeset.retry', () => approveChanges('retry')),
    vscode.commands.registerCommand('botrider.mcp.approve', () => app.approveMcp()),
    vscode.commands.registerCommand('botrider.mcp.reject', () => app.rejectMcp()),
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

  async function approveChanges(mode: 'initial' | 'retry' = 'initial'): Promise<void> {
    const n = app.changesets.files?.length ?? 0;
    const ok = await app.approve(mode);
    if (ok) {
      void vscode.window.showInformationMessage(COPY.appliedToast(n));
    }
  }

  async function pickBot(): Promise<void> {
    const items = app.orchestrator.getPositionSummaries();
    if (!items.length) {
      return;
    }
    const picked = await vscode.window.showQuickPick(
      items.map((b) => ({ label: b.name, description: b.summary, id: b.botId })),
      { title: COPY.pickTitle, placeHolder: COPY.pickTitle },
    );
    if (picked) {
      await app.pick(picked.id);
    }
  }

  async function handleUi(
    msg: UiToHost | { type: 'ui/pick' } | { type: 'ui/focus-expanded' },
  ): Promise<void> {
    try {
      if (msg.type === 'ui/pick') {
        await pickBot();
        return;
      }
      if (msg.type === 'ui/focus-expanded') {
        expand.reveal();
        return;
      }
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
      hasPendingMcp: current.mcp.actions.hasPending(),
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
  // Session-only transcript, pending changeset, and pending MCP batch die with the host.
}
