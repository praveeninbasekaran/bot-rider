import * as vscode from 'vscode';
import type { RepositoryContextPort } from '../app/repository-context';

export class VsCodeRepositoryContextPort implements RepositoryContextPort {
  async listFiles(): Promise<string[]> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return [];
    }
    const uris = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,java,cs,md,mdx}',
      '**/{node_modules,.git,dist,out,coverage,*-out}/**',
      5000,
    );
    return uris
      .map((uri) => vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/'))
      .sort();
  }

  async readText(path: string): Promise<string | undefined> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, path));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return undefined;
    }
  }
}
