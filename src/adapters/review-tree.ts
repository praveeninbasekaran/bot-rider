import * as vscode from 'vscode';
import * as nodePath from 'node:path';
import type { Application } from '../app/application';
import type { ChangeFile, FileOp } from '../domain/changeset';
import { ProposedContentProvider } from './proposed-content-provider';

class ReviewItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    public readonly kind: 'group' | 'file',
    public readonly file?: ChangeFile,
  ) {
    super(label, collapsible);
  }
}

export class ReviewTreeProvider implements vscode.TreeDataProvider<ReviewItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly app: Application) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ReviewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewItem): ReviewItem[] {
    const files = this.app.changesets.files ?? [];
    if (!element) {
      const modified = files.filter((f) => f.op === 'update');
      const added = files.filter((f) => f.op === 'create');
      const deleted = files.filter((f) => f.op === 'delete');
      const groups: ReviewItem[] = [];
      if (modified.length) {
        groups.push(group('Modified', modified.length));
      }
      if (added.length) {
        groups.push(group('Added', added.length));
      }
      if (deleted.length) {
        groups.push(group('Deleted', deleted.length));
      }
      return groups;
    }
    if (element.kind === 'group') {
      const op = groupOp(element.label as string);
      return files.filter((f) => f.op === op).map((f) => fileItem(f));
    }
    return [];
  }
}

export async function openProposedDiff(
  file: { path: string; op: FileOp },
  proposed: ProposedContentProvider,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const basename = nodePath.posix.basename(file.path);
  const right = proposed.uriFor(file.path);
  if (file.op === 'create') {
    const title = `${basename} (Empty ↔ Proposed)`;
    await vscode.commands.executeCommand('vscode.diff', proposed.emptyUri(), right, title);
    return;
  }
  if (!folder) {
    return;
  }
  const left = vscode.Uri.joinPath(folder.uri, ...file.path.split('/'));
  if (file.op === 'delete') {
    const title = `${basename} (Workspace ↔ Deleted)`;
    await vscode.commands.executeCommand('vscode.diff', left, proposed.emptyUri(), title);
    return;
  }
  const title = `${basename} (Workspace ↔ Proposed)`;
  await vscode.commands.executeCommand('vscode.diff', left, right, title);
}

function group(name: string, count: number): ReviewItem {
  const item = new ReviewItem(`${name} (${count})`, vscode.TreeItemCollapsibleState.Expanded, 'group');
  item.contextValue = 'proposedGroup';
  return item;
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
    item.description = 'A';
  } else if (file.op === 'delete') {
    item.description = 'D';
  } else {
    item.description = 'M';
  }
  return item;
}

function groupOp(label: string): FileOp {
  if (label.startsWith('Added')) {
    return 'create';
  }
  if (label.startsWith('Deleted')) {
    return 'delete';
  }
  return 'update';
}
