import { describe, expect, it } from 'vitest';
import { CopilotGateway, mapCopilotError } from '../src/app/copilot-gateway';
import type { LanguageModelPort, LmModel, CancelToken, LmSendOptions } from '../src/app/ports';
import type { PromptMessage } from '../src/protocol/messages';
import { COPILOT_JUSTIFICATION, COPY } from '../src/app/copy';
import { McpGateway } from '../src/app/mcp-gateway';
import { FakeMcpPort, readOnlyMcpTool } from './fakes';

class FakeLm implements LanguageModelPort {
  selectCalls = 0;
  models: LmModel[] = [];
  can: boolean | undefined = true;
  private readonly modelLs = new Set<() => void>();
  private readonly accessLs = new Set<() => void>();
  lastOptions: LmSendOptions | undefined;

  async selectChatModels(selector: { vendor: 'copilot' }): Promise<LmModel[]> {
    this.selectCalls += 1;
    expect(selector).toEqual({ vendor: 'copilot' });
    return this.models.filter((m) => m.vendor === 'copilot');
  }

  canSendRequest(_model: LmModel): boolean | undefined {
    return this.can;
  }

  onDidChangeChatModels(listener: () => void) {
    this.modelLs.add(listener);
    return { dispose: () => this.modelLs.delete(listener) };
  }

  onDidChangeAccess(listener: () => void) {
    this.accessLs.add(listener);
    return { dispose: () => this.accessLs.delete(listener) };
  }

  fireModels(): void {
    for (const l of this.modelLs) {
      l();
    }
  }

  fireAccess(): void {
    for (const l of this.accessLs) {
      l();
    }
  }
}

function model(overrides: Partial<LmModel> = {}): LmModel {
  return {
    vendor: 'copilot',
    maxInputTokens: 1000,
    countTokens: async () => 1,
    sendRequest: async (messages: PromptMessage[], options: LmSendOptions, _token: CancelToken) => {
      void messages;
      void _token;
      return { text: (async function* () { yield 'ok'; })() };
    },
    ...overrides,
  };
}

describe('CopilotGateway status', () => {
  it('does not treat startup empty list as missing until both events settle', async () => {
    const lm = new FakeLm();
    const statuses: string[] = [];
    const gw = new CopilotGateway(lm, (s) => statuses.push(s));
    expect(gw.status).toBe('settling');
    expect(lm.selectCalls).toBe(0);
    lm.fireModels();
    expect(gw.status).toBe('settling');
    lm.fireAccess();
    await Promise.resolve();
    expect(gw.settled).toBe(true);
    expect(gw.status).toBe('missing');
    expect(statuses).toEqual(['missing']);
    expect(lm.selectCalls).toBe(0);
  });

  it('recheck selectChatModels uses vendor copilot only and maps noPermissions', async () => {
    const lm = new FakeLm();
    const captured: LmSendOptions[] = [];
    lm.models = [
      model({
        sendRequest: async (_m, options) => {
          captured.push(options);
          return { text: (async function* () { yield 'x'; })() };
        },
      }),
    ];
    lm.can = false;
    const gw = new CopilotGateway(lm);
    const status = await gw.ensureAvailable();
    expect(status).toBe('noPermissions');
    expect(lm.selectCalls).toBe(1);
    lm.can = true;
    expect(await gw.ensureAvailable()).toBe('ready');
    await gw.stream(
      [{ role: 'user', content: 'hi' }],
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) },
      () => undefined,
    );
    expect(captured[0]).toEqual({ justification: COPILOT_JUSTIFICATION });
    expect('tools' in captured[0]!).toBe(false);
  });

  it('maps language-model errors onto CopilotStatus', () => {
    expect(mapCopilotError({ code: 'NoPermissions' })).toBe('noPermissions');
    expect(mapCopilotError({ code: 'NotFound' })).toBe('notFound');
    expect(mapCopilotError({ code: 'Blocked' })).toBe('blocked');
    expect(mapCopilotError({ message: 'off_topic' })).toBe('offTopic');
    expect(mapCopilotError({ message: 'quota exceeded' })).toBe('quota');
    expect(mapCopilotError({ message: 'rate limit' })).toBe('quota');
    expect(mapCopilotError({ message: 'boom' })).toBe('streamFailed');
  });
});

describe('CopilotGateway MCP tools', () => {
  const idle = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

  it('propose/direct can pass the mcp-readonly tool list on sendRequest', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [readOnlyMcpTool({ name: 'list_issues', description: 'List issues' })];
    const mcp = new McpGateway(port, () => undefined, { settleMs: 0 });
    await mcp.ensureStartedFromSend();
    const captured: LmSendOptions[] = [];
    const lm = new FakeLm();
    lm.models = [
      model({
        sendRequest: async (_m, options) => {
          captured.push(options);
          return { text: (async function* () { yield 'ok'; })() };
        },
      }),
    ];
    const gw = new CopilotGateway(lm, () => undefined, 60_000, mcp);
    await gw.ensureAvailable();
    await gw.send([{ role: 'user', content: 'hi' }], idle, () => undefined, {
      tools: 'mcp-readonly',
      botId: 'b1',
      handle: 'alpha',
    });
    expect(captured[0]?.tools).toEqual([
      { name: 'list_issues', description: 'List issues', inputSchema: undefined },
    ]);
  });

  it('mutating-blocked skip copy is exact and invokeTool is not called from the tool loop', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [
      readOnlyMcpTool({ name: 'list_issues' }),
      readOnlyMcpTool({
        name: 'create_issue',
        description: 'Create',
        annotations: { readOnlyHint: true },
        source: { name: 'github' },
      }),
    ];
    const msgs: import('../src/protocol/messages').HostToUi[] = [];
    const mcp = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    await mcp.ensureStartedFromSend();
    let round = 0;
    const lm = new FakeLm();
    lm.models = [
      model({
        sendRequest: async () => {
          round += 1;
          if (round === 1) {
            return {
              text: (async function* () {})(),
              stream: (async function* () {
                yield {
                  kind: 'tool-call' as const,
                  callId: 'c1',
                  name: 'create_issue',
                  input: { title: 'x' },
                };
              })(),
            };
          }
          return { text: (async function* () { yield 'done'; })() };
        },
      }),
    ];
    const gw = new CopilotGateway(lm, () => undefined, 60_000, mcp);
    await gw.ensureAvailable();
    const chunks: string[] = [];
    await gw.send([{ role: 'user', content: 'hi' }], idle, (c) => chunks.push(c), {
      tools: 'mcp-readonly',
      botId: 'b1',
      handle: 'alpha',
    });
    expect(port.invokeCalls).toEqual([]);
    expect(msgs).toContainEqual({
      type: 'chat/mcp-skip',
      botId: 'b1',
      handle: 'alpha',
      server: 'github',
      tool: 'create_issue',
      reason: 'mutating-blocked',
      message: COPY.mcpSkipMutating('github'),
    });
    expect(chunks.join('')).toBe('done');
  });

  it('emits no mcp start/end/skip when Copilot does not call a tool this turn', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [readOnlyMcpTool()];
    const msgs: import('../src/protocol/messages').HostToUi[] = [];
    const mcp = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    await mcp.ensureStartedFromSend();
    const lm = new FakeLm();
    lm.models = [model()];
    const gw = new CopilotGateway(lm, () => undefined, 60_000, mcp);
    await gw.ensureAvailable();
    await gw.send([{ role: 'user', content: 'hi' }], idle, () => undefined, {
      tools: 'mcp-readonly',
      botId: 'b1',
      handle: 'alpha',
    });
    expect(port.invokeCalls).toEqual([]);
    expect(msgs.filter((m) => m.type.startsWith('chat/mcp-'))).toEqual([]);
  });
});
