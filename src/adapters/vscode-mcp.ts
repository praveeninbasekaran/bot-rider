import * as vscode from 'vscode';
import type { CancelToken } from '../app/ports';
import type { McpPort, McpToolInfo } from '../app/mcp-gateway';

/**
 * VS Code only supplies a valid token to ChatParticipant request handlers.
 * Bot Rider invokes staged tools from its custom Swarm webview, so the public
 * API requires undefined here; extensions cannot mint or reuse this token.
 */
export const MCP_TOOL_INVOCATION_TOKEN: vscode.ChatParticipantToolToken | undefined = undefined;

export class VsCodeMcpPort implements McpPort {
  listTools(): McpToolInfo[] {
    const tools = vscode.lm.tools ?? [];
    return tools.map((tool) => {
      const extra = tool as McpToolInfo;
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        tags: tool.tags,
        title: extra.title,
        toolReferenceName: extra.toolReferenceName,
        annotations: extra.annotations,
        source: extra.source,
      };
    });
  }

  async invokeTool(name: string, input: unknown, token: CancelToken): Promise<unknown> {
    const cts = new vscode.CancellationTokenSource();
    if (token.isCancellationRequested) {
      cts.cancel();
    }
    const subscription = token.onCancellationRequested(() => cts.cancel());
    try {
      return await vscode.lm.invokeTool(
        name,
        { input: asInput(input), toolInvocationToken: MCP_TOOL_INVOCATION_TOKEN },
        cts.token,
      );
    } finally {
      subscription.dispose();
      cts.dispose();
    }
  }

  async hasConfig(): Promise<boolean> {
    if (hasConfiguredServers(vscode.workspace.getConfiguration('mcp').get('servers'))) {
      return true;
    }
    if (hasConfiguredServers(vscode.workspace.getConfiguration('chat.mcp').get('servers'))) {
      return true;
    }
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const rel of ['.vscode/mcp.json', 'mcp.json']) {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, ...rel.split('/')));
          return true;
        } catch {
          // keep looking
        }
      }
    }
    return false;
  }

  async startServers(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.mcp.startServer');
    } catch {
      // Command missing or start failed; consume whatever tools are already listed.
    }
  }
}

function hasConfiguredServers(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function asInput(input: unknown): object {
  return input && typeof input === 'object' ? input : {};
}
