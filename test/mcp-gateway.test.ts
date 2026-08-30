import { describe, expect, it } from 'vitest';
import { COPY } from '../src/app/copy';
import {
  listReadOnlyTools,
  listStageableTools,
  McpGateway,
  looksWriteIsh,
} from '../src/app/mcp-gateway';
import type { HostToUi } from '../src/protocol/messages';
import { FakeMcpPort, readOnlyMcpTool, stageableMcpTool } from './fakes';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

describe('McpGateway listReadOnly', () => {
  it('drops missing readOnlyHint and destructive tools, not by keyword (WM-Q2)', () => {
    const tools = [
      readOnlyMcpTool({ name: 'list_issues' }),
      readOnlyMcpTool({ name: 'create_issue', annotations: { readOnlyHint: true } }),
      readOnlyMcpTool({ name: 'add_comment', annotations: { readOnlyHint: true } }),
      readOnlyMcpTool({
        name: 'search',
        annotations: undefined,
      }),
      readOnlyMcpTool({
        name: 'get_file',
        annotations: { readOnlyHint: true, destructiveHint: true },
      }),
      {
        name: 'workspace_search',
        description: 'not mcp',
        tags: ['other'],
        annotations: { readOnlyHint: true },
      },
    ];
    const names = listReadOnlyTools(tools).map((t) => t.name);
    expect(names).toEqual(['list_issues', 'create_issue', 'add_comment']);
    expect(looksWriteIsh('create_issue')).toBe(true);
    expect(looksWriteIsh('list_issues')).toBe(false);
  });
});

describe('McpGateway allow/invoke', () => {
  it('mutating-blocked skip copy is exact and invokeTool is not called', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [
      readOnlyMcpTool(),
      readOnlyMcpTool({
        name: 'create_issue',
        description: 'Create an issue',
        annotations: { readOnlyHint: true },
        source: { name: 'github' },
      }),
    ];
    const msgs: HostToUi[] = [];
    const gw = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    await gw.ensureStartedFromSend();
    expect(gw.listReadOnly().map((t) => t.name)).toContain('create_issue');
    const result = await gw.invoke(
      { callId: '1', name: 'create_issue', input: { title: 'x' } },
      token,
      'bot-1',
      'alpha',
    );
    expect(port.invokeCalls).toEqual([]);
    expect(result.skipped).toBe(true);
    expect(msgs).toContainEqual({
      type: 'chat/mcp-skip',
      botId: 'bot-1',
      handle: 'alpha',
      server: 'github',
      tool: 'create_issue',
      reason: 'mutating-blocked',
      message: COPY.mcpSkipMutating('github'),
    });
    expect(COPY.mcpSkipMutating('github')).toBe("Writes through github aren't available in Bot Rider.");
  });

  it('listStageable is mcp-tagged without readOnlyHint; decide stages those and blocks cannot-stage writes', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [
      readOnlyMcpTool({ name: 'list_issues' }),
      stageableMcpTool({ name: 'create_issue', source: { name: 'github' } }),
      {
        name: 'workspace_search',
        description: 'not mcp',
        tags: ['other'],
      },
    ];
    const gw = new McpGateway(port, () => undefined, { settleMs: 0 });
    expect(listStageableTools(port.tools).map((t) => t.name)).toEqual(['create_issue']);
    expect(gw.listStageable().map((t) => t.name)).toEqual(['create_issue']);
    expect(gw.decide({ name: 'list_issues' }).action).toBe('invoke');
    expect(gw.decide({ name: 'create_issue' })).toMatchObject({
      action: 'stage',
      server: 'github',
      tool: 'create_issue',
    });
    expect(gw.decide({ name: 'delete_file' })).toMatchObject({
      action: 'skip',
      reason: 'mutating-blocked',
      message: COPY.mcpSkipMutating('MCP'),
    });
  });

  it('McpGateway source has no Figma/Azure vendor match except fail copy living in COPY', () => {
    const src = readFileSync(join(__dirname, '../src/app/mcp-gateway.ts'), 'utf8');
    expect(src).not.toMatch(/Figma/);
    expect(src).not.toMatch(/Azure/);
    expect(COPY.mcpActionsFailed).toContain('Figma');
    expect(COPY.mcpActionsFailed).toContain('Azure Boards');
    expect(COPY.mcpActionsFailed.split('\n')).toHaveLength(2);
    expect(COPY.mcpActionsFailed).not.toContain('\n\n');
  });

  it('unused servers and failed starts emit nothing until a tool is called this turn', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [readOnlyMcpTool()];
    port.startServers = async () => {
      throw new Error('github MCP failed to start');
    };
    const msgs: HostToUi[] = [];
    const gw = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    await gw.ensureStartedFromSend();
    expect(msgs.filter((m) => m.type.startsWith('chat/mcp-'))).toEqual([]);
    expect(port.invokeCalls).toEqual([]);
  });
});
