import { describe, expect, it } from 'vitest';
import { COPY } from '../src/app/copy';
import {
  listReadOnlyTools,
  McpGateway,
  looksWriteIsh,
} from '../src/app/mcp-gateway';
import type { HostToUi } from '../src/protocol/messages';
import { FakeMcpPort, readOnlyMcpTool } from './fakes';

const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

describe('McpGateway listReadOnly', () => {
  it('drops write-ish names and missing readOnlyHint', () => {
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
    expect(names).toEqual(['list_issues']);
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
        annotations: { readOnlyHint: false },
        source: { name: 'github' },
      }),
    ];
    const msgs: HostToUi[] = [];
    const gw = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    await gw.ensureStartedFromSend();
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
});
