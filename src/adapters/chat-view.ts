import * as vscode from 'vscode';
import type { HostToUi, UiToHost } from '../protocol/messages';
import { TOKEN_FLUSH_MS } from '../app/copy';
import { mapIncomingToken } from './ui-protocol';
import { webviewHtml } from './webview-html';

export class ChatHub {
  private readonly views = new Set<vscode.Webview>();
  private tokenBuf = '';
  private tokenBotId = '';
  private tokenTimer: ReturnType<typeof setTimeout> | undefined;
  private lastRun: HostToUi | undefined;
  private lastCopilot: HostToUi | undefined;
  private lastSnapshot: HostToUi | undefined;
  private lastBotId = '';

  constructor(private readonly onUi: (msg: UiToHost) => Promise<void>) {}

  attach(webview: vscode.Webview): vscode.Disposable {
    this.views.add(webview);
    if (this.lastSnapshot) {
      void webview.postMessage(this.lastSnapshot);
    }
    if (this.lastCopilot) {
      void webview.postMessage(this.lastCopilot);
    }
    if (this.lastRun) {
      void webview.postMessage(this.lastRun);
    }
    const sub = webview.onDidReceiveMessage((msg: UiToHost) => {
      void this.onUi(msg);
    });
    return new vscode.Disposable(() => {
      this.views.delete(webview);
      sub.dispose();
    });
  }

  post(msg: HostToUi): void {
    if (msg.type === 'bots/snapshot') {
      this.lastSnapshot = msg;
    }
    if (msg.type === 'run/state') {
      this.lastRun = msg;
    }
    if (msg.type === 'copilot/status') {
      this.lastCopilot = msg;
    }
    if (msg.type === 'chat/turn-start') {
      this.lastBotId = msg.botId;
      this.flushTokens();
      this.broadcast(msg);
      return;
    }
    if (msg.type === 'chat/token') {
      const raw = msg as { type: 'chat/token'; botId?: string; delta?: string; text?: string };
      const mapped = mapIncomingToken({
        type: 'chat/token',
        botId: raw.botId || this.lastBotId,
        delta: raw.delta,
        text: raw.text,
      });
      if (!mapped) {
        return;
      }
      if (this.tokenBotId && mapped.botId !== this.tokenBotId) {
        this.flushTokens();
      }
      this.tokenBotId = mapped.botId;
      this.lastBotId = mapped.botId;
      this.tokenBuf += mapped.delta;
      if (!this.tokenTimer) {
        this.tokenTimer = setTimeout(() => this.flushTokens(), TOKEN_FLUSH_MS);
      }
      return;
    }
    if (msg.type === 'chat/turn-end' || msg.type === 'error') {
      this.flushTokens();
    }
    this.broadcast(msg);
  }

  private flushTokens(): void {
    if (this.tokenTimer) {
      clearTimeout(this.tokenTimer);
      this.tokenTimer = undefined;
    }
    if (!this.tokenBuf || !this.tokenBotId) {
      this.tokenBuf = '';
      return;
    }
    const delta = this.tokenBuf;
    const botId = this.tokenBotId;
    this.tokenBuf = '';
    this.broadcast({ type: 'chat/token', botId, delta });
  }

  private broadcast(msg: HostToUi): void {
    for (const view of this.views) {
      void view.postMessage(msg);
    }
  }
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly hub: ChatHub,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webviewView.webview.html = webviewHtml({
      webview: webviewView.webview,
      extensionUri: this.extensionUri,
      scriptFile: 'chat.js',
      styleFile: 'chat.css',
      bodyClass: 'swarm',
    });
    const d = this.hub.attach(webviewView.webview);
    webviewView.onDidDispose(() => d.dispose());
  }
}
