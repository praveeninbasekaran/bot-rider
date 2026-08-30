import * as vscode from 'vscode';
import { Application } from '../app/application';
import {
  attachOpenDialogOptions,
  ingestPickedFiles,
  removeAttachment,
  resolveFormAttachments,
  shouldOpenAttachDialog,
  type AttachFileIo,
  type AttachFormFields,
} from '../app/bot-attach';
import { COPY } from '../app/copy';
import { attachmentsOf, type BotAttachment, type BotRecord } from '../domain/bot';
import { deriveHandle } from '../domain/bot';
import { webviewHtml } from './webview-html';
import type { HostToUi, UiToHost } from '../protocol/messages';

export class BotFormPanel {
  static readonly viewType = 'botrider.botForm';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly app: Application,
    private readonly io: AttachFileIo = vscodeAttachIo(),
    private readonly pickFiles: (folderFsPath: string) => Promise<string[] | undefined> = vscodePickFiles,
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
          void panel.webview.postMessage({
            type: 'form/load',
            bot,
            bots: this.app.registry.list(),
            suggestedHandle: bot?.handle ?? deriveHandle(''),
            defaults: newDraftDefaults(bot),
          });
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
          await this.attachPick(session, emit);
          return;
        }
        if (msg.type === 'bots/attach-remove') {
          session.attachments = removeAttachment(session.attachments, msg.path);
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
    void panel.webview.postMessage({
      type: 'form/load',
      bot,
      bots: this.app.registry.list(),
      suggestedHandle: bot?.handle ?? '',
      defaults: newDraftDefaults(bot),
    });
  }

  private async attachPick(
    session: FormAttachSession,
    emit: (msg: HostToUi) => void,
  ): Promise<void> {
    const folderFsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folderFsPath || !shouldOpenAttachDialog(folderFsPath)) {
      return;
    }
    const picked = await this.pickFiles(folderFsPath);
    if (!picked?.length) {
      return;
    }
    const result = await ingestPickedFiles({
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
      emit({ type: 'bots/attach-mapped', ...result.mapped });
    }
    if (result.added.length > 0) {
      emit({ type: 'bots/attach-added', files: result.added });
    }
    for (const skip of result.skipped) {
      emit({
        type: 'bots/attach-skipped',
        name: skip.name,
        reason: skip.reason,
        message: skip.message,
      });
    }
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
      persona: bot?.persona ?? COPY.defaultNewBotPersona,
    },
  };
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

async function vscodePickFiles(folderFsPath: string): Promise<string[] | undefined> {
  const options = attachOpenDialogOptions(folderFsPath);
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: options.canSelectMany,
    canSelectFiles: options.canSelectFiles,
    canSelectFolders: options.canSelectFolders,
    defaultUri: vscode.Uri.file(folderFsPath),
    title: options.title,
  });
  return uris?.map((uri) => uri.fsPath);
}

