import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import { CopilotGateway } from '../src/app/copilot-gateway';
import { COPY } from '../src/app/copy';
import { McpGateway } from '../src/app/mcp-gateway';
import type { LmModel, CancelToken, LmSendOptions } from '../src/app/ports';
import type { HostToUi, PromptMessage } from '../src/protocol/messages';
import {
  defaultWorkspace,
  FakeGateway,
  FakeLm,
  FakeMcpPort,
  FixedWorkspace,
  MemoryFs,
  MemoryStore,
  readOnlyMcpTool,
  stageableMcpTool,
} from './fakes';

const idle = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

function model(overrides: Partial<LmModel> = {}): LmModel {
  return {
    vendor: 'copilot',
    maxInputTokens: 1000,
    countTokens: async () => 1,
    sendRequest: async (_messages: PromptMessage[], _options: LmSendOptions, _token: CancelToken) => {
      return { text: (async function* () { yield 'ok'; })() };
    },
    ...overrides,
  };
}

function toolCallResponse(name: string, input: object) {
  return {
    text: (async function* () {})(),
    stream: (async function* () {
      yield { kind: 'tool-call' as const, callId: 'c1', name, input };
    })(),
  };
}

function textResponse(text: string) {
  return { text: (async function* () { yield text; })() };
}

async function twoBots(app: Application) {
  await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
  await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
}

describe('MA staged MCP actions host', () => {
  it('debate send advertises a mutating mcp-tagged tool, stages the write, and does not invokeTool during send', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [readOnlyMcpTool(), stageableMcpTool({ source: { name: 'github' } })];
    const msgs: HostToUi[] = [];
    const mcp = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    await mcp.ensureStartedFromSend();
    let round = 0;
    const captured: LmSendOptions[] = [];
    const lm = new FakeLm();
    lm.models = [
      model({
        sendRequest: async (_m, options) => {
          captured.push(options);
          round += 1;
          if (round === 1) {
            return toolCallResponse('create_issue', { title: 'Ship login', id: '42' });
          }
          return textResponse('staged plan');
        },
      }),
    ];
    const gw = new CopilotGateway(lm, () => undefined, 60_000, mcp);
    await gw.ensureAvailable();
    await gw.send([{ role: 'user', content: 'hi' }], idle, () => undefined, {
      tools: 'mcp-debate',
      botId: 'bot-1',
      handle: 'alpha',
    });
    expect(captured[0]?.tools?.some((t) => t.name === 'create_issue')).toBe(true);
    expect(port.invokeCalls).toEqual([]);
    expect(mcp.decide({ name: 'create_issue' }).action).toBe('stage');
    const preview = msgs.find((m) => m.type === 'mcp/actions-preview');
    expect(preview).toMatchObject({
      type: 'mcp/actions-preview',
      actions: [
        {
          server: 'github',
          tool: 'create_issue',
          handle: 'alpha',
          botId: 'bot-1',
        },
      ],
    });
    if (preview && preview.type === 'mcp/actions-preview') {
      expect(preview.actions[0]?.argsLine).toContain('title Ship login');
      expect(preview.actions[0]?.argsLine).toContain('id 42');
      expect(preview.actions[0]?.argsLine.length).toBeLessThanOrEqual(80);
      expect(preview.actions[0]).not.toHaveProperty('args');
    }
    expect(msgs.some((m) => m.type === 'chat/mcp-read-start' && m.tool === 'create_issue')).toBe(false);
    expect(msgs.some((m) => m.type === 'chat/mcp-skip' && m.reason === 'mutating-blocked')).toBe(false);
    const threadish = msgs.filter((m) => m.type.startsWith('chat/'));
    expect(JSON.stringify(threadish)).not.toContain('"title":"Ship login"');
  });

  it('cannot-stage mutating call is still mutating-blocked; stageable call is not', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [
      readOnlyMcpTool({
        name: 'create_issue',
        annotations: { readOnlyHint: true },
        source: { name: 'github' },
      }),
      stageableMcpTool({ name: 'post_comment', source: { name: 'github' } }),
    ];
    const msgs: HostToUi[] = [];
    const mcp = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    let round = 0;
    const lm = new FakeLm();
    lm.models = [
      model({
        sendRequest: async () => {
          round += 1;
          if (round === 1) {
            return toolCallResponse('create_issue', { title: 'blocked' });
          }
          if (round === 2) {
            return toolCallResponse('post_comment', { id: '9' });
          }
          return textResponse('done');
        },
      }),
    ];
    const gw = new CopilotGateway(lm, () => undefined, 60_000, mcp);
    await gw.ensureAvailable();
    await gw.send([{ role: 'user', content: 'hi' }], idle, () => undefined, {
      tools: 'mcp-debate',
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
    expect(msgs.some((m) => m.type === 'chat/mcp-skip' && m.tool === 'post_comment')).toBe(false);
    expect(mcp.actions.snapshot().some((a) => a.tool === 'post_comment')).toBe(true);
  });

  it('vote and implementer send tools none; Split and Stop do not stage', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [readOnlyMcpTool(), stageableMcpTool()];
    const mcp = new McpGateway(port, () => undefined, { settleMs: 0 });
    const gw = new FakeGateway();
    const fs = new MemoryFs();
    const msgs: HostToUi[] = [];
    const app = new Application(
      new MemoryStore(),
      gw,
      fs,
      fs,
      new FixedWorkspace(defaultWorkspace),
      (m) => msgs.push(m),
      undefined,
      undefined,
      mcp,
    );
    await twoBots(app);
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'DISSENT not yet';
      }
      return 'talk';
    };
    await app.send('debate this');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const paired = gw.turns.map((turn, i) => ({ turn, tools: gw.lastSendOpts[i]?.tools }));
    expect(paired.filter((p) => p.turn === 'consensus').every((p) => p.tools === 'none')).toBe(true);
    expect(paired.some((p) => p.turn === 'implement')).toBe(false);
    expect(mcp.actions.hasPending()).toBe(false);
    expect(msgs.some((m) => m.type === 'mcp/actions-preview')).toBe(false);

    msgs.length = 0;
    app.stop();
    expect(port.invokeCalls).toEqual([]);
    expect(msgs.some((m) => m.type === 'mcp/actions-preview')).toBe(false);
    expect(mcp.actions.hasPending()).toBe(false);
  });

  it('changeset/approve does not invoke staged MCP; mcp/actions-approve does not applyEdit', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [stageableMcpTool({ source: { name: 'github' } })];
    const msgs: HostToUi[] = [];
    const mcp = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    const gw = new FakeGateway();
    const fs = new MemoryFs();
    const app = new Application(
      new MemoryStore(),
      gw,
      fs,
      fs,
      new FixedWorkspace(defaultWorkspace),
      (m) => msgs.push(m),
      undefined,
      undefined,
      mcp,
    );
    mcp.stage(
      { callId: '1', name: 'create_issue', input: { title: 'Ship' } },
      'bot-1',
      'alpha',
      { server: 'github', tool: 'create_issue' },
    );
    app.changesets.setPending([{ path: 'a.ts', op: 'create', content: 'n' }]);
    expect(mcp.actions.hasPending()).toBe(true);

    await app.handleUi({ type: 'changeset/approve' });
    expect(fs.files.get('a.ts')).toBe('n');
    expect(port.invokeCalls).toEqual([]);
    expect(mcp.actions.hasPending()).toBe(true);
    expect(app.changesets.applyFailed).toBe(false);

    app.changesets.setPending([{ path: 'b.ts', op: 'create', content: 'm' }]);
    const applyBefore = fs.applyCalls;
    await app.handleUi({ type: 'mcp/actions-approve' });
    expect(port.invokeCalls).toEqual([{ name: 'create_issue', input: { title: 'Ship' } }]);
    expect(fs.applyCalls).toBe(applyBefore);
    expect(fs.files.has('b.ts')).toBe(false);
    expect(app.changesets.hasPending()).toBe(true);
    expect(app.changesets.applyFailed).toBe(false);
    expect(mcp.actions.hasPending()).toBe(false);
  });

  it('failed MCP Approve keeps leftoverIds, locked copy, no success; retry is still allowed', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [stageableMcpTool({ name: 'create_issue' }), stageableMcpTool({ name: 'post_comment' })];
    const msgs: HostToUi[] = [];
    const mcp = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    const gw = new FakeGateway();
    const fs = new MemoryFs();
    const app = new Application(
      new MemoryStore(),
      gw,
      fs,
      fs,
      new FixedWorkspace(defaultWorkspace),
      (m) => msgs.push(m),
      undefined,
      undefined,
      mcp,
    );
    mcp.stage(
      { callId: '1', name: 'create_issue', input: { title: 'One' } },
      'bot-1',
      'alpha',
      { server: 'github', tool: 'create_issue' },
    );
    mcp.stage(
      { callId: '2', name: 'post_comment', input: { id: '9' } },
      'bot-1',
      'alpha',
      { server: 'github', tool: 'post_comment' },
    );
    const ids = mcp.actions.snapshot().map((a) => a.id);
    port.failNames.add('create_issue');
    const applyFailedBefore = app.changesets.applyFailed;
    const ok = await app.approveMcp();
    expect(ok).toBe(false);
    expect(app.changesets.applyFailed).toBe(applyFailedBefore);
    const failed = msgs.find((m) => m.type === 'mcp/actions-failed');
    expect(failed).toEqual({
      type: 'mcp/actions-failed',
      message: COPY.mcpActionsFailed,
      leftoverIds: ids,
    });
    expect(COPY.mcpActionsFailed).toBe(
      'MCP actions failed\nSome remote side effects (Figma, Azure Boards, or other servers) may already have happened and may not roll back.',
    );
    expect(COPY.mcpActionsFailed.split('\n')).toEqual([
      'MCP actions failed',
      'Some remote side effects (Figma, Azure Boards, or other servers) may already have happened and may not roll back.',
    ]);
    expect(COPY.mcpActionsFailed).not.toContain('\n\n');
    expect(msgs.some((m) => m.type === 'mcp/actions-cleared')).toBe(false);
    expect(mcp.actions.snapshot().map((a) => a.id)).toEqual(ids);
    expect(port.invokeCalls).toHaveLength(1);

    port.failNames.delete('create_issue');
    const retry = await app.approveMcp();
    expect(retry).toBe(true);
    expect(port.invokeCalls.map((c) => c.name)).toEqual(['create_issue', 'create_issue', 'post_comment']);
    expect(mcp.actions.hasPending()).toBe(false);
    expect(msgs.some((m) => m.type === 'mcp/actions-cleared')).toBe(true);
  });

  it('reload and mcp/actions-reject emit mcp/actions-cleared and do not clear the file changeset', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [stageableMcpTool()];
    const msgs: HostToUi[] = [];
    const mcp = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    const gw = new FakeGateway();
    const fs = new MemoryFs();
    const app = new Application(
      new MemoryStore(),
      gw,
      fs,
      fs,
      new FixedWorkspace(defaultWorkspace),
      (m) => msgs.push(m),
      undefined,
      undefined,
      mcp,
    );
    mcp.stage(
      { callId: '1', name: 'create_issue', input: { title: 'Ship' } },
      'bot-1',
      'alpha',
      { server: 'github', tool: 'create_issue' },
    );
    app.changesets.setPending([{ path: 'keep.ts', op: 'create', content: 'stay' }]);

    await app.handleUi({ type: 'mcp/actions-reject' });
    expect(msgs.some((m) => m.type === 'mcp/actions-cleared')).toBe(true);
    expect(mcp.actions.hasPending()).toBe(false);
    expect(app.changesets.hasPending()).toBe(true);
    expect(app.changesets.files?.[0]?.path).toBe('keep.ts');
    expect(port.invokeCalls).toEqual([]);

    mcp.stage(
      { callId: '2', name: 'create_issue', input: { title: 'Again' } },
      'bot-1',
      'alpha',
      { server: 'github', tool: 'create_issue' },
    );
    msgs.length = 0;
    app.reloadMcpActions();
    expect(msgs).toContainEqual({ type: 'mcp/actions-cleared' });
    expect(mcp.actions.hasPending()).toBe(false);
    expect(app.changesets.hasPending()).toBe(true);
    expect(app.changesets.files?.[0]?.path).toBe('keep.ts');
  });

  it('Stop does not execute staged MCP; pending stays until reject', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [stageableMcpTool({ source: { name: 'github' } })];
    const msgs: HostToUi[] = [];
    const mcp = new McpGateway(port, (m) => msgs.push(m), { settleMs: 0 });
    const gw = new FakeGateway();
    const fs = new MemoryFs();
    const app = new Application(
      new MemoryStore(),
      gw,
      fs,
      fs,
      new FixedWorkspace(defaultWorkspace),
      (m) => msgs.push(m),
      undefined,
      undefined,
      mcp,
    );
    await twoBots(app);
    mcp.stage(
      { callId: '1', name: 'create_issue', input: { title: 'Ship' } },
      'bot-1',
      'alpha',
      { server: 'github', tool: 'create_issue' },
    );
    gw.script = ({ turn }) => (turn === 'propose' ? 'talk' : 'DISSENT');
    await app.send('go');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    app.stop();
    expect(port.invokeCalls).toEqual([]);
    expect(mcp.actions.hasPending()).toBe(true);
    expect(app.orchestrator.getRunState().splitOpen).toBe(false);

    const ok = await app.approveMcp();
    expect(ok).toBe(true);
    expect(port.invokeCalls).toEqual([{ name: 'create_issue', input: { title: 'Ship' } }]);
  });

  it('MCP Approve is allowed while Split is open and does not start implementer', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    port.tools = [stageableMcpTool()];
    const mcp = new McpGateway(port, () => undefined, { settleMs: 0 });
    const gw = new FakeGateway();
    const fs = new MemoryFs();
    const app = new Application(
      new MemoryStore(),
      gw,
      fs,
      fs,
      new FixedWorkspace(defaultWorkspace),
      () => undefined,
      undefined,
      undefined,
      mcp,
    );
    await twoBots(app);
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT' : 'talk');
    await app.send('split please');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    mcp.stage(
      { callId: '1', name: 'create_issue', input: { title: 'Ship' } },
      'bot-1',
      'alpha',
      { server: 'github', tool: 'create_issue' },
    );
    const requests = gw.requestCount;
    await app.approveMcp();
    expect(port.invokeCalls).toHaveLength(1);
    expect(gw.requestCount).toBe(requests);
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    expect(gw.turns.includes('implement')).toBe(false);
  });
});
