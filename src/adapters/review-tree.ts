import * as vscode from 'vscode';
import * as nodePath from 'node:path';
import type { Application } from '../app/application';
import type { ChangeFile, FileOp } from '../domain/changeset';
import type { McpActionDto } from '../protocol/messages';
import { ProposedContentProvider } from './proposed-content-provider';
import { mcpFailedViewMessage, reviewChromeMode } from './review-chrome';

export type { ReviewChromeMode } from './review-chrome';
export { mcpFailedViewMessage, reviewChromeMode };

export type ReviewKind = 'filesSection' | 'mcpSection' | 'file' | 'mcp';

class ReviewItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    public readonly kind: ReviewKind,
    public readonly file?: ChangeFile,
    public readonly action?: McpActionDto,
  ) {
    super(label, collapsible);
  }
}

export class ReviewTreeProvider implements vscode.TreeDataProvider<ReviewItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private view: vscode.TreeView<ReviewItem> | undefined;
  private mcpFailed = false;
  private mcpFocus: ReviewItem | undefined;

  constructor(private readonly app: Application) {}

  attach(view: vscode.TreeView<ReviewItem>): void {
    this.view = view;
    this.syncChrome();
  }

  noteMcpFailed(failed: boolean): void {
    this.mcpFailed = failed;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
    this.syncChrome();
  }

  async revealMcp(): Promise<void> {
    if (!this.view) {
      return;
    }
    await vscode.commands.executeCommand('botrider.review.focus');
    const target = this.mcpFocus ?? this.getChildren()[0];
    if (target) {
      await this.view.reveal(target, { expand: true, focus: true, select: true });
    }
  }

  getTreeItem(element: ReviewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewItem): ReviewItem[] {
    if (element?.kind === 'filesSection') {
      return this.fileItems();
    }
    if (element?.kind === 'mcpSection') {
      return this.mcpItems();
    }
    if (element) {
      return [];
    }

    const files = this.app.changesets.files ?? [];
    const actions = this.app.mcp.actions.snapshot();
    const mode = reviewChromeMode(files.length, actions.length);
    this.mcpFocus = undefined;

    if (mode === 'both') {
      const filesSection = sectionItem('Files', 'filesSection', 'reviewFilesSection');
      const mcpSection = sectionItem('MCP actions', 'mcpSection', 'reviewMcpSection');
      this.mcpFocus = mcpSection;
      return [filesSection, mcpSection];
    }
    if (mode === 'files') {
      return this.fileItems();
    }
    if (mode === 'mcp') {
      const items = this.mcpItems();
      this.mcpFocus = items[0];
      return items;
    }
    return [];
  }

  private fileItems(): ReviewItem[] {
    return (this.app.changesets.files ?? [])
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => fileItem(f));
  }

  private mcpItems(): ReviewItem[] {
    return this.app.mcp.actions.snapshot().map((action) => mcpItem(action));
  }

  private syncChrome(): void {
    if (!this.view) {
      return;
    }
    const fileCount = this.app.changesets.files?.length ?? 0;
    const mcpCount = this.app.mcp.actions.snapshot().length;
    const filesPending = fileCount > 0 && this.app.changesets.hasPending();
    const mcpPending = mcpCount > 0 && this.app.mcp.actions.hasPending();

    if (this.mcpFailed && mcpPending) {
      this.view.message = mcpFailedViewMessage();
      this.view.badge = { value: mcpCount, tooltip: 'MCP actions failed' };
      return;
    }

    if (!filesPending && !mcpPending) {
      this.view.badge = undefined;
      this.view.message = undefined;
      return;
    }

    const bits: string[] = [];
    if (filesPending) {
      bits.push(fileCount === 1 ? '1 file · pending review' : `${fileCount} files · pending review`);
    }
    if (mcpPending) {
      bits.push(mcpCount === 1 ? '1 MCP action · pending review' : `${mcpCount} MCP actions · pending review`);
    }
    const label = bits.join(' · ');
    this.view.badge = { value: fileCount + mcpCount, tooltip: label };
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

function sectionItem(label: string, kind: 'filesSection' | 'mcpSection', contextValue: string): ReviewItem {
  const item = new ReviewItem(label, vscode.TreeItemCollapsibleState.Expanded, kind);
  item.contextValue = contextValue;
  item.id = `section:${kind}`;
  if (kind === 'mcpSection') {
    item.iconPath = new vscode.ThemeIcon('tools');
  }
  return item;
}

function fileItem(file: ChangeFile): ReviewItem {
  const item = new ReviewItem(file.path, vscode.TreeItemCollapsibleState.None, 'file', file);
  item.id = `file:${file.path}`;
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

function mcpItem(action: McpActionDto): ReviewItem {
  const handle = `@${action.handle}`;
  const item = new ReviewItem(
    `${action.server} · ${action.tool}`,
    vscode.TreeItemCollapsibleState.None,
    'mcp',
    undefined,
    action,
  );
  item.id = `mcp:${action.id}`;
  item.contextValue = 'proposedMcpAction';
  item.description = action.argsLine ? `${action.argsLine}  ${handle}` : handle;
  item.tooltip = `${action.argsLine} ${handle}`.trim();
  item.iconPath = new vscode.ThemeIcon('tools');
  return item;
}
