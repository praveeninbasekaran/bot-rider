import * as vscode from 'vscode';
import type { Application } from '../app/application';
import { COPY } from '../app/copy';
import type { BotRecord } from '../domain/bot';
import { deriveHandle } from '../domain/bot';
import { webviewHtml } from './webview-html';
import type { UiToHost } from '../protocol/messages';

export class BotFormPanel {
  static readonly viewType = 'botrider.botForm';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly app: Application,
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
        try {
          if (msg.type === 'bots/create' || msg.type === 'bots/update') {
            await this.app.handleUi(msg);
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
