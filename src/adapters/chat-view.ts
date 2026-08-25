import * as vscode from 'vscode';
import type { HostToUi, UiToHost } from '../protocol/messages';
import { TOKEN_FLUSH_MS } from '../app/copy';
import { webviewHtml } from './webview-html';

export class ChatHub {
  private readonly views = new Set<vscode.Webview>();
  private tokenBuf = '';
  private tokenBotId = '';
  private tokenTimer: ReturnType<typeof setTimeout> | undefined;
  private lastRun: HostToUi | undefined;
  private lastCopilot: HostToUi | undefined;
  private lastSnapshot: HostToUi | undefined;
  private lastExpanded: HostToUi | undefined;

  constructor(private readonly onUi: (msg: UiToHost | { type: 'ui/pick' } | { type: 'ui/focus-expanded' }) => Promise<void>) {}

  attach(webview: vscode.Webview): vscode.Disposable {
    this.views.add(webview);
    this.replayTo(webview);
    const sub = webview.onDidReceiveMessage(
      (msg: UiToHost | { type: 'ui/pick' } | { type: 'ui/focus-expanded' } | { type: 'ui/ready' }) => {
        if (msg && msg.type === 'ui/ready') {
          this.replayTo(webview);
          return;
        }
        void this.onUi(msg);
      },
    );
    return new vscode.Disposable(() => {
      this.views.delete(webview);
      sub.dispose();
    });
  }

  /** Opening Swarm is a user gesture; Recheck uses selectChatModels, not getSession. */
  requestRecheck(): void {
    void this.onUi({ type: 'copilot/recheck' });
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
    if (msg.type === 'ui/expanded') {
      this.lastExpanded = msg;
    }
    if (msg.type === 'chat/turn-start') {
      this.flushTokens();
      this.broadcast(msg);
      return;
    }
    if (msg.type === 'chat/token') {
      if (this.tokenBotId && msg.botId !== this.tokenBotId) {
        this.flushTokens();
      }
      this.tokenBotId = msg.botId;
      this.tokenBuf += msg.delta;
      if (!this.tokenTimer) {
        this.tokenTimer = setTimeout(() => this.flushTokens(), TOKEN_FLUSH_MS);
      }
      return;
    }
    if (msg.type === 'chat/turn-end' || msg.type === 'error' || msg.type === 'chat/split' || msg.type === 'chat/notice') {
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

  private replayTo(webview: vscode.Webview): void {
    if (this.lastSnapshot) {
      void webview.postMessage(this.lastSnapshot);
    }
    if (this.lastCopilot) {
      void webview.postMessage(this.lastCopilot);
    }
    if (this.lastRun) {
      void webview.postMessage(this.lastRun);
    }
    if (this.lastExpanded) {
      void webview.postMessage(this.lastExpanded);
    }
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
      enableCommandUris: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webviewView.webview.html = webviewHtml({
      webview: webviewView.webview,
      extensionUri: this.extensionUri,
      scriptFile: 'chat.js',
      styleFile: 'chat.css',
      extraStyles: ['vscode-webview.css'],
      bodyClass: 'swarm',
    });
    const d = this.hub.attach(webviewView.webview);
    webviewView.onDidDispose(() => d.dispose());
    this.hub.requestRecheck();
  }
}
