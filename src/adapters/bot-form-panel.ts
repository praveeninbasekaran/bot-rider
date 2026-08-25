import * as vscode from 'vscode';
import type { Application } from '../app/application';
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
      scriptFile: 'form.js',
      styleFile: 'form.css',
      bodyClass: 'form',
      extra: `<form id="bot-form"></form>`,
    });
    const sub = panel.webview.onDidReceiveMessage(async (msg: UiToHost | { type: 'form/ready' }) => {
      if (msg.type === 'form/ready') {
        void panel.webview.postMessage({
          type: 'form/load',
          bot,
          suggestedHandle: bot?.handle ?? deriveHandle(''),
        });
        return;
      }
      try {
        if (msg.type === 'bots/create' || msg.type === 'bots/update') {
          await this.app.handleUi(msg);
          panel.dispose();
        }
      } catch (err) {
        void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
      }
    });
    panel.onDidDispose(() => sub.dispose());
    void panel.webview.postMessage({ type: 'form/load', bot, suggestedHandle: bot?.handle ?? '' });
  }
}
