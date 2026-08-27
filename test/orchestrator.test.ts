import { describe, expect, it, vi } from 'vitest';
import { Application } from '../src/app/application';
import { COPY } from '../src/app/copy';
import { MAX_MCP_TOOL_ROUNDS } from '../src/app/copilot-gateway';
import { EmptyLspSlicePort, type LspSlicePort } from '../src/app/lsp-slice';
import { isBoardEmpty } from '../src/app/run-board';
import type { HostToUi } from '../src/protocol/messages';
import { changesetFence, configuredMcp, defaultWorkspace, FakeGateway, FakeMcpPort, FixedWorkspace, MemoryFs, MemoryStore } from './fakes';
import { McpGateway } from '../src/app/mcp-gateway';

function harness(mcp?: import('../src/app/mcp-gateway').McpGateway, lsp?: LspSlicePort) {
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
    lsp,
  );
  return { app, gw, fs, msgs };
}

async function twoBots(app: Application) {
  await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
  await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
}

describe('Orchestrator positive', () => {
  it('two-round AGREE then implementer', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT not yet' : 'AGREE ship it';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'src/out.ts', op: 'create', content: 'ok' }]);
      }
      return 'language only';
    };
    await app.send('build the feature');
    expect(gw.turns.filter((t) => t === 'implement')).toEqual(['implement']);
    expect(gw.turns.filter((t) => t === 'consensus')).toHaveLength(4);
    expect(app.orchestrator.getRunState().phase).toBe('pendingReview');
    expect(app.changesets.files?.[0]?.path).toBe('src/out.ts');
    expect(app.changesets.applyFailed).toBe(false);
    const starts = msgs.filter((m) => m.type === 'chat/turn-start');
    expect(starts.some((m) => m.type === 'chat/turn-start' && m.turn === 'propose' && m.round === 1)).toBe(true);
    expect(starts.some((m) => m.type === 'chat/turn-start' && m.turn === 'critique' && m.round === 1)).toBe(true);
    const tokens = msgs.filter((m) => m.type === 'chat/token');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every((m) => m.type === 'chat/token' && typeof m.botId === 'string' && typeof m.delta === 'string')).toBe(
      true,
    );
    expect(tokens.every((m) => m.type === 'chat/token' && !('text' in m))).toBe(true);
    const consensusEnds = msgs.filter((m) => m.type === 'chat/turn-end' && m.turn === 'consensus');
    expect(consensusEnds.length).toBe(4);
    expect(
      consensusEnds.every(
        (m) => m.type === 'chat/turn-end' && !/\bAGREE\b/i.test(m.text) && !/\bDISSENT\b/i.test(m.text),
      ),
    ).toBe(true);
  });

  it('@known solo then NEED_EDIT implementer for that bot', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn }) => {
      if (turn === 'direct') {
        return 'I would change the file.\nNEED_EDIT';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'solo.ts', op: 'create', content: 's' }]);
      }
      return 'nope';
    };
    await app.send('@alpha please edit');
    expect(gw.turns[0]).toBe('direct');
    expect(gw.turns.filter((t) => t === 'implement')).toHaveLength(1);
    const persona = gw.lastMessages[0]?.[0]?.content ?? '';
    expect(persona).toContain('@alpha');
    expect(persona).not.toContain('@beta');
    expect(app.registry.getByHandle('alpha')?.active).toBe(true);
  });

  it('Continue uses the same freeze', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round >= 3 ? 'AGREE' : 'DISSENT';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'c.ts', op: 'create', content: 'c' }]);
      }
      return 'talk';
    };
    await app.send('debate this');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const frozen = app.orchestrator.getFrozenBots().map((b) => b.id);
    await app.createBot({ name: 'Gamma', handle: 'gamma', persona: 'g', role: 'g', instructions: 'g' });
    await app.continueDebate();
    expect(app.orchestrator.getFrozenBots().map((b) => b.id)).toEqual(frozen);
    expect(gw.lastMessages.some((ms) => ms[0]?.content.includes('@gamma'))).toBe(false);
    expect(app.orchestrator.getRunState().phase).toBe('pendingReview');
  });

  it('@known inactive answers without flipping the checkbox', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    const alpha = app.registry.getByHandle('alpha')!;
    await app.toggleBot(alpha.id, false);
    gw.script = ({ turn }) => (turn === 'direct' ? 'hello\nNO_EDIT' : 'x');
    await app.send('@alpha ping');
    expect(app.registry.getByHandle('alpha')?.active).toBe(false);
    expect(gw.turns).toEqual(['direct']);
    expect(msgs.some((m) => m.type === 'chat/turn-start' && m.inactiveNotice === COPY.inactiveTurn('Alpha'))).toBe(
      true,
    );
  });
});

describe('Orchestrator negative', () => {
  it('unknown @ and multiple @ and invalid handle never call the model', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    await app.send('@nobody hi');
    expect(gw.ensureCalls).toBe(0);
    expect(gw.requestCount).toBe(0);
    expect(msgs.some((m) => m.type === 'error' && m.code === 'unknown-handle')).toBe(true);

    msgs.length = 0;
    await app.send('@alpha @beta both');
    expect(gw.requestCount).toBe(0);
    expect(msgs.some((m) => m.type === 'error' && m.message === COPY.multipleMentions)).toBe(true);

    msgs.length = 0;
    await app.send('@-nope please');
    expect(gw.requestCount).toBe(0);
    expect(msgs.some((m) => m.type === 'error' && m.code === 'unknown-handle')).toBe(true);
  });

  it('zero active default does not call the model', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    for (const bot of app.registry.list()) {
      await app.toggleBot(bot.id, false);
    }
    await app.send('hello swarm');
    expect(gw.ensureCalls).toBe(0);
    expect(gw.requestCount).toBe(0);
    expect(msgs.some((m) => m.type === 'error' && m.code === 'zero-active')).toBe(true);
  });

  it('drops debate file bodies and never implements on Stop', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    let started = 0;
    gw.script = ({ turn }) => {
      if (turn === 'propose') {
        started += 1;
        if (started === 1) {
          return 'see\n```ts\nSECRET_BODY\n```\n';
        }
      }
      return 'AGREE';
    };
    const original = gw.stream.bind(gw);
    gw.stream = async (messages, token, onText) => {
      if (gw.turns.length >= 1) {
        app.stop();
        return 'cancelled';
      }
      return original(messages, token, onText);
    };
    await app.send('go');
    const ended = msgs.find((m) => m.type === 'chat/turn-end');
    expect(ended && ended.type === 'chat/turn-end' && ended.text.includes('SECRET_BODY')).toBe(false);
    expect(gw.turns.includes('implement')).toBe(false);
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    expect(app.orchestrator.getRunState().phase).toBe('split');
    const split = msgs.find((m) => m.type === 'chat/split');
    const frozen = app.orchestrator.getFrozenBots();
    expect(split).toMatchObject({
      type: 'chat/split',
      title: COPY.splitPaused,
      reason: COPY.splitPausedReason,
      paused: true,
    });
    expect(split && split.type === 'chat/split' && split.reason).toBe('Debate paused. Positions so far:');
    expect(split && split.type === 'chat/split' && split.title).toBe('Debate paused');
    expect(split && split.type === 'chat/split' && split.reason).not.toBe(COPY.stoppedNoImpl);
    expect(split && split.type === 'chat/split' && split.reason).not.toBe(COPY.interrupted);
    expect(split && split.type === 'chat/split' && split.positions).toHaveLength(frozen.length);
    expect(split && split.type === 'chat/split' && split.positions).toHaveLength(2);
    expect(msgs.some((m) => m.type === 'chat/notice' && m.text === COPY.interrupted)).toBe(true);
    expect(msgs.some((m) => m.type === 'chat/notice' && m.text === COPY.stoppedNoImpl)).toBe(false);
  });

  it('Stop on an already-open split emits stopped notice and never implements', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT' : 'talk');
    await app.send('first');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    expect(app.orchestrator.getRunState().debateRunning).toBe(false);
    expect(gw.turns.includes('implement')).toBe(false);
    msgs.length = 0;
    app.stop();
    expect(msgs.some((m) => m.type === 'chat/notice' && m.text === COPY.stoppedNoImpl)).toBe(true);
    expect(msgs.some((m) => m.type === 'chat/notice' && m.text === COPY.interrupted)).toBe(false);
    expect(msgs.some((m) => m.type === 'chat/split')).toBe(false);
    expect(gw.turns.includes('implement')).toBe(false);
    expect(app.orchestrator.getRunState().splitOpen).toBe(false);
    expect(app.orchestrator.getRunState().debateRunning).toBe(false);
    expect(app.orchestrator.getRunState().phase).toBe('idle');
  });

  it('send is ignored while splitOpen', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT' : 'talk');
    await app.send('first');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const count = gw.requestCount;
    await app.send('second should ignore');
    expect(gw.requestCount).toBe(count);
  });

  it('two-round no AGREE splits with no implementer and no round 3', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT we differ' : 'talk');
    await app.send('no consensus please');
    const state = app.orchestrator.getRunState();
    expect(state.splitOpen).toBe(true);
    expect(state.phase).toBe('split');
    expect(state.round).toBe(2);
    expect(state.debateRunning).toBe(false);
    expect(gw.turns.filter((t) => t === 'implement')).toEqual([]);
    expect(gw.turns.filter((t) => t === 'consensus')).toHaveLength(4);
    const instructions = gw.lastMessages.map((ms) => ms[ms.length - 1]?.content ?? '');
    expect(instructions.some((text) => text.includes('Round 3'))).toBe(false);
    expect(app.changesets.hasPending()).toBe(false);
    const split = msgs.find((m) => m.type === 'chat/split');
    expect(split).toMatchObject({ type: 'chat/split', title: COPY.splitNoConsensus, paused: false });
    expect(split && split.type === 'chat/split' && split.positions).toHaveLength(2);
    expect(split && split.type === 'chat/split' && split.positions.every((p) => p.botId && p.handle && 'text' in p)).toBe(
      true,
    );
    const frozen = app.orchestrator.getFrozenBots();
    expect(split && split.type === 'chat/split' && split.positions.map((p) => p.handle).sort()).toEqual(
      frozen.map((b) => b.handle).sort(),
    );
  });

  it('invalid implementer op is validate-failed', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Solo', handle: 'solo', persona: 'p', role: 'r', instructions: 'i' });
    gw.script = ({ turn }) => {
      if (turn === 'direct') {
        return 'need it\nNEED_EDIT';
      }
      return changesetFence([{ path: 'a.ts', op: 'merge', content: 'z' }]);
    };
    await app.send('@solo edit');
    expect(msgs.some((m) => m.type === 'error' && m.code === 'validate-failed')).toBe(true);
    expect(app.changesets.hasPending()).toBe(false);
  });

  it('hung 60s surfaces status, keeps Stop, and does not retry', async () => {
    vi.useFakeTimers();
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.hang = true;
    const done = app.send('hang please');
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.resolve();
    expect(msgs.some((m) => m.type === 'copilot/status' && m.status === 'hung')).toBe(true);
    expect(app.orchestrator.getRunState().debateRunning).toBe(true);
    expect(gw.requestCount).toBe(1);
    app.stop();
    await done;
    expect(gw.requestCount).toBe(1);
    expect(gw.turns.includes('implement')).toBe(false);
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    vi.useRealTimers();
  });

  it('send is ignored while debateRunning', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = gw.stream.bind(gw);
    gw.stream = async (messages, token, onText) => {
      await gate;
      return original(messages, token, onText);
    };
    const first = app.send('one');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().debateRunning).toBe(true);
    });
    const count = gw.requestCount;
    await app.send('two during debate');
    expect(gw.requestCount).toBe(count);
    release();
    await first;
  });

  it('recheck ensureAvailable emits copilot/status without streaming', async () => {
    const { app, gw, msgs } = harness();
    gw.status = 'noPermissions';
    await app.handleUi({ type: 'copilot/recheck' });
    expect(gw.ensureCalls).toBe(1);
    expect(gw.requestCount).toBe(0);
    expect(msgs.some((m) => m.type === 'copilot/status' && m.status === 'noPermissions')).toBe(true);
  });

  it('copilot not ready emits copilot/status and does not stream', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.status = 'missing';
    await app.send('hello swarm');
    expect(gw.requestCount).toBe(0);
    expect(msgs.some((m) => m.type === 'copilot/status' && m.status === 'missing')).toBe(true);
    expect(app.orchestrator.getRunState().debateRunning).toBe(false);
  });

  it('display-name spaces are not a handle lock; plain @handle is', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({
      name: 'Alpha Bot',
      handle: 'alpha-bot',
      persona: 'a',
      role: 'lead',
      instructions: 'one',
    });
    gw.script = ({ turn }) => (turn === 'direct' ? 'ok\nNO_EDIT' : 'x');
    await app.send('@Alpha Bot please');
    expect(gw.requestCount).toBe(0);
    expect(msgs.some((m) => m.type === 'error' && m.code === 'unknown-handle')).toBe(true);

    msgs.length = 0;
    await app.send('@alpha-bot please');
    expect(gw.turns[0]).toBe('direct');
  });

  it('email-style @ is plain text not a mention token', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'e.ts', op: 'create', content: 'e' }]);
      }
      return 'talk';
    };
    await app.send('ping me@host.com about this');
    expect(gw.requestCount).toBeGreaterThan(0);
    expect(gw.turns.includes('direct')).toBe(false);
    expect(gw.turns.filter((t) => t === 'consensus').length).toBeGreaterThan(0);
    expect(msgs.some((m) => m.type === 'error' && m.code === 'unknown-handle')).toBe(false);
    expect(app.orchestrator.getRunState().phase).toBe('pendingReview');
  });

  it('mixed valid+unknown mention errors without Copilot', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    await app.send('@alpha @ghost both');
    expect(gw.requestCount).toBe(0);
    expect(gw.ensureCalls).toBe(0);
    expect(msgs.some((m) => m.type === 'error' && m.code === 'unknown-handle')).toBe(true);
  });

  it('split pick summaries are position one-liners from the freeze snapshot', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn }) => {
      if (turn === 'propose') {
        return 'Ship the cache layer now.';
      }
      if (turn === 'critique') {
        return 'Cache is the right cut.';
      }
      if (turn === 'consensus') {
        return 'DISSENT';
      }
      return 'talk';
    };
    await app.send('plan it');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const summaries = app.orchestrator.getPositionSummaries();
    expect(summaries.map((s) => s.name)).toEqual(['Alpha', 'Beta']);
    expect(summaries[0]?.summary).toBe('Cache is the right cut.');
    gw.script = ({ turn }) => {
      if (turn === 'implement') {
        return changesetFence([{ path: 'picked.ts', op: 'create', content: 'p' }]);
      }
      return 'talk';
    };
    await app.pick(summaries[0]!.botId);
    expect(gw.turns.includes('implement')).toBe(true);
    expect(app.orchestrator.getRunState().phase).toBe('pendingReview');
  });
});

describe('Orchestrator MCP turn flags', () => {
  it('WM-1 AC2: none configured emits no mcp events on send', async () => {
    const port = new FakeMcpPort();
    const mcp = new McpGateway(port, () => undefined, { settleMs: 0 });
    const { app, gw, msgs } = harness(mcp);
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'n.ts', op: 'create', content: 'n' }]);
      }
      return 'talk';
    };
    await app.send('build it');
    expect(msgs.filter((m) => m.type.startsWith('chat/mcp-'))).toEqual([]);
    expect(gw.lastSendOpts.every((opts) => (opts.tools ?? 'none') === 'none')).toBe(true);
    expect(app.mcp.noneConfigured()).toBe(true);
    expect(port.startCalls).toBe(0);
    expect(port.invokeCalls).toEqual([]);
  });

  it('implementer and consensus send with tools none; propose/direct can pass mcp-readonly', async () => {
    const msgs: HostToUi[] = [];
    const { mcp } = configuredMcp((m) => msgs.push(m));
    const { app, gw } = harness(mcp);
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'm.ts', op: 'create', content: 'm' }]);
      }
      return 'talk';
    };
    await app.send('debate then ship');
    const paired = gw.turns.map((turn, i) => ({ turn, tools: gw.lastSendOpts[i]?.tools }));
    expect(paired.filter((p) => p.turn === 'propose').every((p) => p.tools === 'mcp-readonly')).toBe(true);
    expect(paired.filter((p) => p.turn === 'critique').every((p) => p.tools === 'mcp-readonly')).toBe(true);
    expect(paired.filter((p) => p.turn === 'consensus').every((p) => p.tools === 'none')).toBe(true);
    expect(paired.filter((p) => p.turn === 'implement').every((p) => p.tools === 'none')).toBe(true);
  });

  it('direct @ turns can pass mcp-readonly when MCP is configured', async () => {
    const { mcp } = configuredMcp(() => undefined);
    const { app, gw } = harness(mcp);
    await twoBots(app);
    gw.script = ({ turn }) => (turn === 'direct' ? 'ok\nNO_EDIT' : 'x');
    await app.send('@alpha ping');
    expect(gw.turns[0]).toBe('direct');
    expect(gw.lastSendOpts[0]?.tools).toBe('mcp-readonly');
  });

  it('does not raise MAX_MCP_TOOL_ROUNDS', () => {
    expect(MAX_MCP_TOOL_ROUNDS).toBe(8);
  });
});

function lastBoard(msgs: HostToUi[]) {
  return [...msgs].reverse().find((m) => m.type === 'chat/board');
}

describe('Orchestrator TokenGovernor packs and RunBoard', () => {
  it('debate and @ packs omit full buffer and history restuff; implementer includes full files', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'propose') {
        return 'UNIQUE-SPEECH-ALPHA-ZZZ';
      }
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT not yet' : 'AGREE ship it';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'src/out.ts', op: 'create', content: 'ok' }]);
      }
      return 'language only';
    };
    await app.send('build the feature');
    expect(gw.lastMessages.every((ms) => ms.every((m) => m.role === 'user'))).toBe(true);
    for (let i = 0; i < gw.turns.length; i++) {
      const turn = gw.turns[i]!;
      const text = gw.lastMessages[i]!.map((m) => m.content).join('\n');
      expect(text).not.toContain('UNIQUE-SPEECH-ALPHA-ZZZ');
      expect(text).toContain('Run board:');
      if (turn === 'propose' || turn === 'critique' || turn === 'direct') {
        expect(text).toContain('LSP slice of active file');
        expect(text).not.toContain('Active editor contents:');
        expect(text).not.toContain('export const n = 1;');
        expect(text).not.toContain('Files in play (full contents):');
        expect(text).toContain('Open tabs (paths only):');
      }
      if (turn === 'consensus') {
        expect(text).toContain('Role: vote');
        expect(text).not.toContain('export const n = 1;');
        expect(text).not.toContain('LSP slice of active file');
        expect(text).not.toContain('Files in play (full contents):');
      }
      if (turn === 'implement') {
        expect(text).toContain('Files in play (full contents):');
        expect(text).toContain('export const n = 1;');
        expect(text).not.toContain('LSP slice of active file');
      }
    }
  });

  it('implementer pack includes full bodies of all files in play, not only the active editor', async () => {
    const { app, gw, fs } = harness();
    fs.files.set('src/other.ts', 'OTHER-TAB-FULL-BODY\n');
    fs.files.set('README.md', 'README-FULL-BODY\n');
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'src/out.ts', op: 'create', content: 'ok' }]);
      }
      return 'talk';
    };
    await app.send('build the feature');
    const impl = gw.turns.findIndex((t) => t === 'implement');
    expect(impl).toBeGreaterThanOrEqual(0);
    const implementText = gw.lastMessages[impl]!.map((m) => m.content).join('\n');
    expect(implementText).toContain('Files in play (full contents):');
    expect(implementText).toContain('--- src/app.ts ---');
    expect(implementText).toContain('export const n = 1;');
    expect(implementText).toContain('--- src/other.ts ---');
    expect(implementText).toContain('OTHER-TAB-FULL-BODY');
    expect(implementText).toContain('--- README.md ---');
    expect(implementText).toContain('README-FULL-BODY');
    expect(implementText).not.toContain('LSP slice of active file');
    const propose = gw.turns.findIndex((t) => t === 'propose');
    const proposeText = gw.lastMessages[propose]!.map((m) => m.content).join('\n');
    expect(proposeText).toContain('src/other.ts');
    expect(proposeText).toContain('README.md');
    expect(proposeText).not.toContain('OTHER-TAB-FULL-BODY');
    expect(proposeText).not.toContain('README-FULL-BODY');
    expect(proposeText).not.toContain('export const n = 1;');
    expect(gw.lastSendOpts[impl]?.tools ?? 'none').toBe('none');
  });

  it('pack-overflow emits exact copy and does not sendRequest', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.maxInputTokens = 40;
    await app.send('build the feature');
    expect(gw.requestCount).toBe(0);
    expect(gw.turns).toEqual([]);
    const err = msgs.find((m) => m.type === 'error' && m.code === 'pack-overflow');
    expect(err && err.type === 'error' && err.message).toBe(COPY.packOverflow);
    expect(COPY.packOverflow).toBe(
      "Prompt doesn't fit Copilot\nThe minimum context for this turn is larger than Copilot's window.\nShorten the prompt or shrink the active editor. Required context was not dropped.",
    );
    expect(msgs.some((m) => m.type === 'chat/turn-start')).toBe(false);
  });

  it('writes dissents only when Split opens and clears them on Continue and consensus', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT we differ' : 'talk');
    await app.send('no consensus please');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const splitBoard = lastBoard(msgs);
    expect(splitBoard && splitBoard.type === 'chat/board' && splitBoard.board.dissents).toHaveLength(2);
    expect(
      splitBoard &&
        splitBoard.type === 'chat/board' &&
        splitBoard.board.dissents.every((d) => d.handle && d.text && !/^DISSENT\b/i.test(d.text)),
    ).toBe(true);
    const voteEnds = msgs.filter((m) => m.type === 'chat/turn-end' && m.turn === 'consensus');
    expect(voteEnds.some((m) => m.type === 'chat/turn-end' && m.vote === 'DISSENT')).toBe(true);

    msgs.length = 0;
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'c.ts', op: 'create', content: 'c' }]);
      }
      return 'talk';
    };
    await app.continueDebate();
    const continued = msgs.filter((m) => m.type === 'chat/board');
    expect(continued[0] && continued[0].type === 'chat/board' && continued[0].board.dissents).toEqual([]);
    const after = lastBoard(msgs);
    expect(after && after.type === 'chat/board' && after.board.dissents).toEqual([]);
    expect(app.orchestrator.getRunState().phase).toBe('pendingReview');
  });

  it('agree-without-Split leaves dissents empty; vote DISSENT remainder is not dissents[]', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT not yet' : 'AGREE ship it';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'src/out.ts', op: 'create', content: 'ok' }]);
      }
      return 'language only';
    };
    await app.send('build the feature');
    const boards = msgs.filter((m) => m.type === 'chat/board');
    expect(boards.every((m) => m.type === 'chat/board' && m.board.dissents.length === 0)).toBe(true);
    expect(msgs.some((m) => m.type === 'chat/split')).toBe(false);
    expect(msgs.some((m) => m.type === 'chat/turn-end' && m.turn === 'consensus' && m.vote === 'DISSENT')).toBe(true);
  });

  it('Approve invalidates the LSP slice and emits an empty board; Reject does not invalidate', async () => {
    const lsp = new EmptyLspSlicePort();
    const { app, gw, msgs } = harness(undefined, lsp);
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'a.ts', op: 'create', content: 'n' }]);
      }
      return 'talk';
    };
    await app.send('build');
    expect(app.changesets.hasPending()).toBe(true);
    expect(lsp.invalidated).toBe(false);
    const before = lastBoard(msgs);
    expect(before && before.type === 'chat/board' && !isBoardEmpty(before.board)).toBe(true);

    await app.reject();
    expect(lsp.invalidated).toBe(false);
    const rejected = lastBoard(msgs);
    expect(rejected && rejected.type === 'chat/board' && isBoardEmpty(rejected.board)).toBe(true);

    await app.send('build again');
    expect(app.changesets.hasPending()).toBe(true);
    lsp.invalidated = false;
    await app.approve();
    expect(lsp.invalidated).toBe(true);
    const approved = lastBoard(msgs);
    expect(approved && approved.type === 'chat/board' && isBoardEmpty(approved.board)).toBe(true);
    expect(gw.ensureCalls).toBeGreaterThan(0);
    const afterApproveTurns = gw.requestCount;
    await app.approve();
    expect(gw.requestCount).toBe(afterApproveTurns);
  });

  it('interrupt Split writes dissents from Split-card positions', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    let started = 0;
    gw.script = ({ turn }) => {
      if (turn === 'propose') {
        started += 1;
        if (started === 1) {
          return 'Ship the cache layer now.';
        }
      }
      return 'talk';
    };
    const original = gw.stream.bind(gw);
    gw.stream = async (messages, token, onText) => {
      if (gw.turns.length >= 1) {
        app.stop();
        return 'cancelled';
      }
      return original(messages, token, onText);
    };
    await app.send('go');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const board = lastBoard(msgs);
    expect(board && board.type === 'chat/board' && board.board.dissents).toHaveLength(2);
    expect(board && board.type === 'chat/board' && board.board.dissents[0]?.handle).toBe('alpha');
    expect(board && board.type === 'chat/board' && board.board.dissents[0]?.text).toBe('Ship the cache layer now.');
  });
});
