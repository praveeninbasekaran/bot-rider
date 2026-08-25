import * as vscode from 'vscode';
import type { BotRecord } from '../domain/bot';
import { avatarSvg } from '../domain/bot';
import type { Application } from '../app/application';

export class BotTreeItem extends vscode.TreeItem {
  constructor(public readonly bot: BotRecord) {
    super(bot.name, vscode.TreeItemCollapsibleState.None);
    this.id = bot.id;
    this.description = bot.active ? bot.role : `${bot.role} · Inactive`;
    this.contextValue = 'bot';
    this.tooltip = `${bot.name} (@${bot.handle})\n${bot.role}`;
    this.accessibilityInformation = {
      label: `${bot.name}, ${bot.role}, ${bot.active ? 'active' : 'inactive'}`,
    };
    this.command = {
      command: 'botrider.bots.edit',
      title: 'Edit Bot',
      arguments: [this],
    };
    this.checkboxState = {
      state: bot.active ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked,
      tooltip: bot.active ? 'Active in swarm' : 'Inactive',
    };
    const svg = avatarSvg(bot.name, bot.colorIndex);
    this.iconPath = vscode.Uri.from({
      scheme: 'data',
      path: `image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    });
  }
}

export class BotsTreeProvider implements vscode.TreeDataProvider<BotTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly app: Application) {}

  attach(view: vscode.TreeView<BotTreeItem>): void {
    view.onDidChangeCheckboxState((e) => {
      for (const [item, state] of e.items) {
        void this.app.toggleBot(item.bot.id, state === vscode.TreeItemCheckboxState.Checked);
      }
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BotTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): BotTreeItem[] {
    return this.app.registry.list().map((bot) => new BotTreeItem(bot));
  }
}
