import { describe, expect, it, vi } from 'vitest';
import { Application } from '../src/app/application';
import { COPY } from '../src/app/copy';
import type { HostToUi } from '../src/protocol/messages';
import { changesetFence, defaultWorkspace, FakeGateway, FixedWorkspace, MemoryFs, MemoryStore } from './fakes';

function harness() {
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
    expect(msgs.some((m) => m.type === 'chat/turn-start' && m.turn === 'implement')).toBe(false);
    expect(msgs.filter((m) => m.type === 'chat/token').every((m) => m.type === 'chat/token' && 'delta' in m && !('text' in m))).toBe(true);
    expect(msgs.some((m) => m.type === 'changeset/preview' && m.files.length === 1)).toBe(true);
  });

  it('@known solo then NEED_EDIT implementer for that bot', async () => {
    const { app, gw, msgs } = harness();
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
    const { app, gw, msgs } = harness();
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
    const split = msgs.find((m) => m.type === 'chat/split');
    expect(split && split.type === 'chat/split' && split.cause).toBe('cap');
    if (split && split.type === 'chat/split') {
      expect(split.positions).toHaveLength(2);
      expect(split.positions.every((p) => p.botId && p.handle && typeof p.text === 'string')).toBe(true);
    }
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
    expect(msgs.some((m) => m.type === 'chat/turn-start' && m.turn === 'direct' && m.handle === 'alpha')).toBe(true);
    expect(msgs.some((m) => m.type === 'chat/turn-start' && 'inactiveNotice' in m)).toBe(false);
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
    expect(app.thread.list().some((t) => t.text.includes('SECRET_BODY'))).toBe(false);
    const ended = msgs.find((m) => m.type === 'chat/turn-end');
    expect(ended && ended.type === 'chat/turn-end' && 'text' in ended).toBe(false);
    expect(gw.turns.includes('implement')).toBe(false);
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    expect(app.orchestrator.getRunState().phase).toBe('split');
    expect(msgs.some((m) => m.type === 'chat/split' && m.cause === 'interrupt')).toBe(true);
  });

  it('send is ignored while splitOpen', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT' : 'talk');
    await app.send('first');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const count = gw.requestCount;
    await app.send('second should ignore');
    expect(gw.requestCount).toBe(count);
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
});
