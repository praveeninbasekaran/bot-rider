import * as vscode from 'vscode';
import type { ContextMapActions, ContextMapChild, ContextMapFile, ContextMapFolder, ContextMapNeighborhood, ContextMapSymbol } from '../app/context-map';
import type { HostToUi, UiToHost } from '../protocol/messages';
import { webviewHtml } from './webview-html';

const SYMBOL_KIND: Record<number, string> = {
  0: 'File',
  1: 'Module',
  2: 'Namespace',
  3: 'Package',
  4: 'Class',
  5: 'Method',
  6: 'Property',
  7: 'Field',
  8: 'Constructor',
  9: 'Enum',
  10: 'Interface',
  11: 'Function',
  12: 'Variable',
  13: 'Constant',
  14: 'String',
  15: 'Number',
  16: 'Boolean',
  17: 'Array',
  18: 'Object',
  19: 'Key',
  20: 'Null',
  21: 'EnumMember',
  22: 'Struct',
  23: 'Event',
  24: 'Operator',
  25: 'TypeParameter',
};

export class VsCodeContextMapNeighborhood implements ContextMapNeighborhood {
  folder(): ContextMapFolder | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    return { uri: folder.uri.toString(), path: folder.uri.fsPath, name: folder.name };
  }

  activeFile(): ContextMapFile | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      return undefined;
    }
    const uri = editor.document.uri;
    return {
      uri: uri.toString(),
      path: vscode.workspace.asRelativePath(uri),
      name: uri.path.split('/').filter(Boolean).pop() ?? uri.path,
    };
  }

  async listChildren(folderUri: string): Promise<ContextMapChild[]> {
    try {
      const uri = vscode.Uri.parse(folderUri);
      const entries = await vscode.workspace.fs.readDirectory(uri);
      return entries.map(([name, type]) => {
        const child = vscode.Uri.joinPath(uri, name);
        return {
          uri: child.toString(),
          path: vscode.workspace.asRelativePath(child),
          name,
          directory: type === vscode.FileType.Directory,
        };
      });
    } catch {
      return [];
    }
  }

  async fileSymbols(fileUri: string): Promise<ContextMapSymbol[]> {
    try {
      const raw = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        vscode.Uri.parse(fileUri),
      );
      if (!Array.isArray(raw) || raw.length === 0) {
        return [];
      }
      return raw.map((item) => toSymbol(item)).filter((s): s is ContextMapSymbol => !!s);
    } catch {
      return [];
    }
  }
}

function toSymbol(item: unknown): ContextMapSymbol | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  const rec = item as {
    name?: string;
    kind?: number;
    range?: vscode.Range;
    selectionRange?: vscode.Range;
    location?: { range?: vscode.Range };
    children?: unknown[];
  };
  const range = rec.range ?? rec.selectionRange ?? rec.location?.range;
  if (!rec.name || !range) {
    return undefined;
  }
  const children = Array.isArray(rec.children)
    ? rec.children.map((c) => toSymbol(c)).filter((s): s is ContextMapSymbol => !!s)
    : undefined;
  return {
    name: rec.name,
    kind: SYMBOL_KIND[rec.kind ?? -1] ?? 'Symbol',
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
    children,
  };
}

export function vscodeContextMapActions(
  revealProposedFile: (path: string) => Promise<void>,
): ContextMapActions {
  return {
    async openUri(uri, range) {
      const parsed = vscode.Uri.parse(uri);
      if (range) {
        const vscodeRange = new vscode.Range(
          range.start.line,
          range.start.character,
          range.end?.line ?? range.start.line,
          range.end?.character ?? range.start.character,
        );
        await vscode.commands.executeCommand('vscode.open', parsed, { selection: vscodeRange });
        return;
      }
      await vscode.commands.executeCommand('vscode.open', parsed);
    },
    revealProposedFile,
  };
}

/**
 * Context Map webview host. Posts protocol so §25 chrome can attach.
 * Does not take retainContextWhenHidden. Replays last payloads when visible.
 */
export class ContextMapViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'botrider.contextMap';

  private view: vscode.WebviewView | undefined;
  private lastWorkspace: HostToUi | undefined;
  private lastRun: HostToUi | undefined;
  visible = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onUi: (msg: UiToHost) => Promise<void>,
    private readonly onVisible: () => Promise<void>,
  ) {}

  post(msg: HostToUi): void {
    if (msg.type === 'contextMap/workspace') {
      this.lastWorkspace = msg;
    }
    if (msg.type === 'contextMap/run') {
      this.lastRun = msg;
    }
    if (msg.type !== 'contextMap/workspace' && msg.type !== 'contextMap/run') {
      return;
    }
    if (this.view) {
      void this.view.webview.postMessage(msg);
    }
  }

  replay(): void {
    if (!this.view) {
      return;
    }
    if (this.lastWorkspace) {
      void this.view.webview.postMessage(this.lastWorkspace);
    }
    if (this.lastRun) {
      void this.view.webview.postMessage(this.lastRun);
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webviewView.webview.html = webviewHtml({
      webview: webviewView.webview,
      extensionUri: this.extensionUri,
      scriptFile: 'context-map.js',
      styleFile: 'context-map.css',
      extraStyles: ['vscode-webview.css'],
      bodyClass: 'context-map',
    });
    const sub = webviewView.webview.onDidReceiveMessage(
      (msg: UiToHost | { type: 'ui/ready' }) => {
        if (msg && msg.type === 'ui/ready') {
          this.replay();
          return;
        }
        void this.onUi(msg);
      },
    );
    webviewView.onDidDispose(() => {
      sub.dispose();
      this.view = undefined;
      this.visible = false;
    });
    webviewView.onDidChangeVisibility(() => {
      this.visible = webviewView.visible;
      if (webviewView.visible) {
        void this.onVisible();
      }
    });
    this.visible = webviewView.visible;
    if (webviewView.visible) {
      void this.onVisible();
    }
  }
}
