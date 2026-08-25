import * as vscode from 'vscode';
import * as nodePath from 'node:path';
import type { Application } from '../app/application';
import type { ChangeFile, FileOp } from '../domain/changeset';
import { ProposedContentProvider } from './proposed-content-provider';

class ReviewItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    public readonly kind: 'file',
    public readonly file?: ChangeFile,
  ) {
    super(label, collapsible);
  }
}

export class ReviewTreeProvider implements vscode.TreeDataProvider<ReviewItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private view: vscode.TreeView<ReviewItem> | undefined;

  constructor(private readonly app: Application) {}

  attach(view: vscode.TreeView<ReviewItem>): void {
    this.view = view;
    this.syncChrome();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
    this.syncChrome();
  }

  getTreeItem(element: ReviewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewItem): ReviewItem[] {
    if (element) {
      return [];
    }
    return (this.app.changesets.files ?? [])
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => fileItem(f));
  }

  private syncChrome(): void {
    if (!this.view) {
      return;
    }
    const n = this.app.changesets.files?.length ?? 0;
    if (!n || !this.app.changesets.hasPending()) {
      this.view.badge = undefined;
      this.view.message = undefined;
      return;
    }
    const label = n === 1 ? '1 file · pending review' : `${n} files · pending review`;
    this.view.badge = { value: n, tooltip: label };
    this.view.message = label;
  }
}

export async function openProposedDiff(
  file: { path: string; op: FileOp },
  proposed: ProposedContentProvider,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const basename = nodePath.posix.basename(file.path);
  const right = proposed.uriFor(file.path);
  const preview = { preview: true };
  if (file.op === 'create') {
    const title = `${basename} (Empty ↔ Proposed)`;
    await vscode.commands.executeCommand('vscode.diff', proposed.emptyUri(), right, title, preview);
    return;
  }
  if (!folder) {
    return;
  }
  const left = vscode.Uri.joinPath(folder.uri, ...file.path.split('/'));
  if (file.op === 'delete') {
    const title = `${basename} (Workspace ↔ Deleted)`;
    await vscode.commands.executeCommand('vscode.diff', left, proposed.emptyUri(), title, preview);
    return;
  }
  const title = `${basename} (Workspace ↔ Proposed)`;
  await vscode.commands.executeCommand('vscode.diff', left, right, title, preview);
}

function fileItem(file: ChangeFile): ReviewItem {
  const item = new ReviewItem(file.path, vscode.TreeItemCollapsibleState.None, 'file', file);
  item.contextValue = 'proposedFile';
  item.command = {
    command: 'botrider.review.openDiff',
    title: 'Open Diff',
    arguments: [item],
  };
  item.resourceUri = vscode.Uri.parse(`file:${file.path}`);
  if (file.op === 'create') {
    item.description = 'Added';
  } else if (file.op === 'delete') {
    item.description = 'Deleted';
  } else {
    item.description = 'Modified';
  }
  return item;
}
