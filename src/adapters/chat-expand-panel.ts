import * as vscode from 'vscode';
import type { ChatHub } from './chat-view';
import { webviewHtml } from './webview-html';
import type { ContextKeys } from './context-keys';

export class ChatExpandPanel {
  static readonly viewType = 'botrider.chatPanel';
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly hub: ChatHub,
    private readonly keys: ContextKeys,
    private readonly onExpanded: (open: boolean) => void,
  ) {}

  reveal(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      this.hub.post({ type: 'ui/expanded', expanded: true });
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      ChatExpandPanel.viewType,
      'Swarm Chat',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        enableCommandUris: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      },
    );
    this.panel.webview.html = webviewHtml({
      webview: this.panel.webview,
      extensionUri: this.extensionUri,
      scriptFile: 'chat.js',
      styleFile: 'chat.css',
      extraStyles: ['vscode-webview.css'],
      bodyClass: 'swarm expanded',
    });
    const d = this.hub.attach(this.panel.webview);
    this.onExpanded(true);
    void this.keys.set('botrider.chatExpanded', true);
    this.hub.post({ type: 'ui/expanded', expanded: true });
    this.panel.onDidDispose(() => {
      d.dispose();
      this.panel = undefined;
      this.onExpanded(false);
      void this.keys.set('botrider.chatExpanded', false);
      this.hub.post({ type: 'ui/expanded', expanded: false });
    });
  }

  isOpen(): boolean {
    return !!this.panel;
  }
}
