import * as vscode from 'vscode';
import type { ApplyEditPort, FileSystemPort, WorkspaceContextPort } from '../app/ports';
import type { FileEditOp } from '../domain/changeset';
import type { WorkspaceContext } from '../protocol/messages';

export class VsCodeWorkspacePort implements ApplyEditPort, FileSystemPort, WorkspaceContextPort {
  async applyEdit(ops: FileEditOp[]): Promise<boolean> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return false;
    }
    const edit = new vscode.WorkspaceEdit();
    for (const op of ops) {
      const uri = vscode.Uri.joinPath(folder.uri, ...op.relativePath.split('/'));
      if (op.type === 'create') {
        const contents = new TextEncoder().encode(op.content);
        edit.createFile(uri, { overwrite: op.overwrite, contents });
      } else if (op.type === 'replace') {
        try {
          const data = await vscode.workspace.fs.readFile(uri);
          const text = new TextDecoder().decode(data);
          const lines = text.split('\n');
          const last = lines[lines.length - 1] ?? '';
          const range = new vscode.Range(0, 0, Math.max(0, lines.length - 1), last.length);
          edit.replace(uri, range, op.content);
        } catch {
          edit.createFile(uri, { overwrite: true, contents: new TextEncoder().encode(op.content) });
        }
      } else if (op.type === 'delete') {
        edit.deleteFile(uri, { ignoreIfNotExists: op.ignoreIfNotExists });
      }
    }
    return vscode.workspace.applyEdit(edit);
  }

  async exists(relativePath: string): Promise<boolean> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return false;
    }
    const uri = vscode.Uri.joinPath(folder.uri, ...relativePath.split('/'));
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  async readText(relativePath: string): Promise<string | undefined> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    const uri = vscode.Uri.joinPath(folder.uri, ...relativePath.split('/'));
    const open = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
    if (open) {
      return open.getText();
    }
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      return new TextDecoder().decode(data);
    } catch {
      return undefined;
    }
  }

  getContext(): WorkspaceContext {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const editor = vscode.window.activeTextEditor;
    const otherTabPaths: string[] = [];
    const activePath = editor?.document.uri;
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (input instanceof vscode.TabInputText && input.uri.scheme === 'file') {
          if (activePath && input.uri.toString() === activePath.toString()) {
            continue;
          }
          otherTabPaths.push(vscode.workspace.asRelativePath(input.uri));
        }
      }
    }
    const activeEditor = editor
      ? {
          path: vscode.workspace.asRelativePath(editor.document.uri),
          content: editor.document.getText(),
          selection: editor.selection.isEmpty ? undefined : editor.document.getText(editor.selection),
        }
      : undefined;
    return {
      folderFsPath: folder?.uri.fsPath,
      activeEditor,
      otherTabPaths,
    };
  }
}
