import * as vscode from 'vscode';

export const PROPOSED_SCHEME = 'botrider-proposed';
export const EMPTY_PATH = '/__empty__';

export class ProposedContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  setProposed(path: string, content: string): void {
    const key = normalize(path);
    this.contents.set(key, content);
    this._onDidChange.fire(this.uriFor(path));
  }

  clearProposed(): void {
    const keys = [...this.contents.keys()];
    this.contents.clear();
    for (const key of keys) {
      this._onDidChange.fire(uriFromKey(key));
    }
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    if (uri.path === EMPTY_PATH) {
      return '';
    }
    return this.contents.get(normalize(uri.path)) ?? '';
  }

  uriFor(path: string): vscode.Uri {
    return vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: '/' + normalize(path) });
  }

  emptyUri(): vscode.Uri {
    return vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: EMPTY_PATH });
  }
}

export async function closeProposedDiffs(): Promise<void> {
  const doomed: vscode.Tab[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputTextDiff) {
        if (
          input.original.scheme === PROPOSED_SCHEME ||
          input.modified.scheme === PROPOSED_SCHEME
        ) {
          doomed.push(tab);
        }
      } else if (input instanceof vscode.TabInputText && input.uri.scheme === PROPOSED_SCHEME) {
        doomed.push(tab);
      }
    }
  }
  if (doomed.length) {
    await vscode.window.tabGroups.close(doomed);
  }
}

function normalize(path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/');
}

function uriFromKey(key: string): vscode.Uri {
  return vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: '/' + key });
}
