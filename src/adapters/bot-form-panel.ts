import * as vscode from 'vscode';
import { Application } from '../app/application';
import {
  attachOpenDialogOptions,
  emitAttachResult,
  ingestPickedFiles,
  removeAttachment,
  resolveFormAttachments,
  shouldOpenAttachDialog,
  type AttachFileIo,
  type AttachFormFields,
} from '../app/bot-attach';
import { COPY } from '../app/copy';
import { attachmentsOf, isAttachmentKind, type AttachmentKind, type BotAttachment, type BotRecord } from '../domain/bot';
import { deriveHandle } from '../domain/bot';
import { webviewHtml } from './webview-html';
import type { HostToUi, UiToHost } from '../protocol/messages';

export class BotFormPanel {
  static readonly viewType = 'botrider.botForm';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly app: Application,
    private readonly io: AttachFileIo = vscodeAttachIo(),
    private readonly pickFiles: (
      folderFsPath: string,
      slot: AttachmentKind,
    ) => Promise<string[] | undefined> = vscodePickFiles,
  ) {}

  open(bot?: BotRecord): void {
    const panel = vscode.window.createWebviewPanel(
      BotFormPanel.viewType,
      bot ? `Edit ${bot.name}` : 'New Bot',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      },
    );
    panel.webview.html = webviewHtml({
      webview: panel.webview,
      extensionUri: this.extensionUri,
      scriptFile: 'bot-form.js',
      styleFile: 'bot-form.css',
      extraStyles: ['vscode-webview.css'],
      bodyClass: 'form',
      extra: `<form id="bot-form"></form>`,
    });
    const session = newFormSession(bot);
    const emit = (msg: HostToUi): void => {
      void panel.webview.postMessage(msg);
    };
    const sub = panel.webview.onDidReceiveMessage(
      async (
        msg: UiToHost | { type: 'form/ready' } | { type: 'form/cancel' },
      ) => {
        if (msg.type === 'form/ready') {
          postFormLoad(panel, bot, this.app.registry.list(), deriveHandle(''));
          return;
        }
        if (msg.type === 'form/cancel') {
          panel.dispose();
          return;
        }
        if (msg.type === 'bots/delete' && bot) {
          const pick = await vscode.window.showWarningMessage(
            `Delete bot "${bot.name}"?`,
            { modal: true },
            'Delete',
          );
          if (pick === 'Delete') {
            await this.app.deleteBot(bot.id);
            panel.dispose();
          }
          return;
        }
        if (msg.type === 'bots/attach-pick') {
          if (!isAttachmentKind(msg.slot)) {
            return;
          }
          await this.attachPick(session, emit, msg.slot);
          return;
        }
        if (msg.type === 'bots/attach-remove') {
          if (!isAttachmentKind(msg.slot)) {
            return;
          }
          session.attachments = removeAttachment(session.attachments, msg.slot, msg.path);
          return;
        }
        try {
          if (msg.type === 'bots/create') {
            await this.app.handleUi({
              ...msg,
              draft: {
                ...msg.draft,
                attachments: resolveFormAttachments(msg.draft.attachments, session.attachments),
              },
            });
            panel.dispose();
          } else if (msg.type === 'bots/update') {
            const patch = msg.patch ?? {};
            await this.app.handleUi({
              ...msg,
              patch: {
                ...patch,
                attachments: resolveFormAttachments(patch.attachments, session.attachments),
              },
            });
            panel.dispose();
          }
        } catch (err) {
          void panel.webview.postMessage({
            type: 'form/error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );
    panel.onDidDispose(() => sub.dispose());
    postFormLoad(panel, bot, this.app.registry.list(), bot?.handle ?? '');
  }

  private async attachPick(
    session: FormAttachSession,
    emit: (msg: HostToUi) => void,
    slot: AttachmentKind,
  ): Promise<void> {
    const folderFsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folderFsPath || !shouldOpenAttachDialog(folderFsPath)) {
      return;
    }
    const picked = await this.pickFiles(folderFsPath, slot);
    if (!picked?.length) {
      return;
    }
    const result = await ingestPickedFiles({
      slot,
      folderFsPath,
      picked: picked.map((absPath) => ({ absPath })),
      existing: session.attachments,
      fields: session.fields,
      io: this.io,
    });
    session.attachments = result.attachments;
    if (result.mapped) {
      session.fields = {
        name: result.mapped.name ?? session.fields.name,
        handle: result.mapped.handle ?? session.fields.handle,
        persona: result.mapped.persona ?? session.fields.persona,
      };
    }
    emitAttachResult(slot, result, emit);
  }
}

interface FormAttachSession {
  attachments: BotAttachment[];
  fields: AttachFormFields;
}

function newFormSession(bot?: BotRecord): FormAttachSession {
  return {
    attachments: attachmentsOf(bot),
    fields: {
      name: bot?.name ?? '',
      handle: bot?.handle ?? '',
      persona: bot?.persona ?? '',
    },
  };
}

function postFormLoad(
  panel: vscode.WebviewPanel,
  bot: BotRecord | undefined,
  bots: BotRecord[],
  suggestedHandle: string,
): void {
  const folderFsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const workspaceEmpty = !folderFsPath;
  void panel.webview.postMessage({
    type: 'form/load',
    bot,
    bots,
    suggestedHandle,
    defaults: newDraftDefaults(bot),
    workspaceEmpty,
  });
  if (workspaceEmpty) {
    void panel.webview.postMessage({ type: 'workspace-empty' });
  }
}

function newDraftDefaults(bot?: BotRecord): { persona: string; instructions: string } | undefined {
  if (bot) {
    return undefined;
  }
  return {
    persona: COPY.defaultNewBotPersona,
    instructions: COPY.defaultNewBotInstructions,
  };
}

function vscodeAttachIo(): AttachFileIo {
  return {
    async statSize(absPath: string): Promise<number> {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(absPath));
      return stat.size;
    },
    async readBytes(absPath: string): Promise<Uint8Array> {
      return vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
    },
  };
}

async function vscodePickFiles(folderFsPath: string, slot: AttachmentKind): Promise<string[] | undefined> {
  const options = attachOpenDialogOptions(folderFsPath, slot);
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: options.canSelectMany,
    canSelectFiles: options.canSelectFiles,
    canSelectFolders: options.canSelectFolders,
    defaultUri: vscode.Uri.file(folderFsPath),
    title: options.title,
    filters: options.filters,
  });
  return uris?.map((uri) => uri.fsPath);
}
