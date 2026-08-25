import * as vscode from 'vscode';
import type { HostToUi, UiToHost } from '../protocol/messages';
import { TOKEN_FLUSH_MS } from '../app/copy';
import { webviewHtml } from './webview-html';

export class ChatHub {
  private readonly views = new Set<vscode.Webview>();
  private tokenBuf = '';
  private tokenTimer: ReturnType<typeof setTimeout> | undefined;
  private lastRun: HostToUi | undefined;
  private lastCopilot: HostToUi | undefined;
  private lastSnapshot: HostToUi | undefined;

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
    if (msg.type === 'chat/token') {
      this.tokenBuf += msg.text;
      if (!this.tokenTimer) {
        this.tokenTimer = setTimeout(() => this.flushTokens(), TOKEN_FLUSH_MS);
      }
      return;
    }
    if (msg.type === 'chat/turn-end' || msg.type === 'chat/turn-start' || msg.type === 'error') {
      this.flushTokens();
    }
    this.broadcast(msg);
  }

  private flushTokens(): void {
    if (this.tokenTimer) {
      clearTimeout(this.tokenTimer);
      this.tokenTimer = undefined;
    }
    if (!this.tokenBuf) {
      return;
    }
    const text = this.tokenBuf;
    this.tokenBuf = '';
    this.broadcast({ type: 'chat/token', text });
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
