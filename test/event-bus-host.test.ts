import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Application } from '../src/app/application';
import { HostEventBus } from '../src/app/event-bus';
import { COPY, BOTS_STATE_KEY } from '../src/app/copy';
import { buildIsolationPacket } from '../src/app/bot-session-store';
import { emptyBoard } from '../src/app/run-board';
import type { HostToUi, PromptMessage } from '../src/protocol/messages';
import {
  changesetFence,
  defaultWorkspace,
  FakeGateway,
  FixedWorkspace,
  MemoryFs,
  MemoryStore,
} from './fakes';

const root = join(__dirname, '..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function listSrcTs(dir: string, prefix = 'src'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...listSrcTs(join(dir, entry.name), rel));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(rel);
    }
  }
  return out;
}

function harness() {
  const gw = new FakeGateway();
  const fs = new MemoryFs();
  const store = new MemoryStore();
  const msgs: HostToUi[] = [];
  const app = new Application(
    store,
    gw,
    fs,
    fs,
    new FixedWorkspace(defaultWorkspace),
    (m) => msgs.push(m),
  );
  return { app, gw, fs, store, msgs };
}

async function twoBots(app: Application) {
  await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
  await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
}

function isolationText(pack: PromptMessage[]): string {
  return pack
    .filter((m) => m.content.startsWith('Isolation packet:'))
    .map((m) => m.content)
    .join('\n');
}

function joined(pack: PromptMessage[]): string {
  return pack.map((m) => m.content).join('\n');
}

function agreeThenImplement(gw: FakeGateway, path = 'a.ts'): void {
  gw.script = ({ turn, instruction }) => {
    const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
    if (turn === 'consensus') {
      return round === 1 ? 'DISSENT' : 'AGREE';
    }
    if (turn === 'implement') {
      return changesetFence([{ path, op: 'create', content: 'n' }]);
    }
    return 'talk';
  };
}

describe('EB-1 host-in-process bus', () => {
  it('is host-in-process; not vscode.EventBus; no Event Bus HostToUi', () => {
    const bus = new HostEventBus();
    const packet = buildIsolationPacket({ at: 'turn-end', board: { ...emptyBoard(), goal: 'g' } });
    bus.publish(packet);
    expect(bus.list()).toHaveLength(1);
    bus.clear();
    expect(bus.list()).toEqual([]);

    expect(src('src/app/event-bus.ts')).toContain('HostEventBus');
    expect(src('src/app/event-bus.ts')).not.toMatch(/import.*EventBus.*vscode|vscode\.EventBus/);
    expect(src('src/app/event-bus.ts')).not.toMatch(/\bWebSocket\b|\bpostMessage\b/);
    expect(src('src/app/orchestrator.ts')).toContain('HostEventBus');
    expect(src('src/app/orchestrator.ts')).not.toMatch(/import.*EventBus.*vscode|vscode\.EventBus/);
    const proto = src('src/protocol/messages.ts');
    const host = proto.slice(proto.indexOf('export type HostToUi'), proto.indexOf('export type UiToHost'));
    const ui = proto.slice(proto.indexOf('export type UiToHost'), proto.indexOf('export interface WorkspaceContext'));
    expect(host).not.toMatch(/HostToUi.*[Ee]ventBus|[Ee]ventBus.*HostToUi/);
    expect(host).not.toMatch(/type: 'event-bus|type: 'eventBus|type: 'bus\//);
    expect(ui).not.toMatch(/type: 'event-bus|type: 'eventBus|type: 'bus\//);
    expect(host).not.toMatch(/IsolationPacket/);
  });

  it('publishes at turn-end / consensus / Pick even while a sibling sendRequest is in flight', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    const betaId = app.registry.getByHandle('beta')!.id;
    let releaseBeta!: () => void;
    const holdBeta = new Promise<void>((resolve) => {
      releaseBeta = resolve;
    });
    let betaHolds = 0;
    gw.afterStart = async ({ botId }) => {
      if (botId === betaId) {
        betaHolds += 1;
        if (betaHolds === 1) {
          await holdBeta;
        }
      }
    };
    gw.script = ({ turn }) => {
      if (turn === 'propose') {
        return 'ALPHA-OR-BETA-PROPOSE';
      }
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'p.ts', op: 'create', content: 'p' }]);
      }
      return 'talk';
    };

    const done = app.send('build the feature');
    await vi.waitFor(() => {
      expect(gw.requestCount).toBeGreaterThanOrEqual(2);
      expect(app.orchestrator.sessions.listPublished().some((p) => p.at === 'turn-end' && p.fromBotId === alphaId)).toBe(
        true,
      );
    });
    expect(gw.lastSendOpts.filter((o) => o.botId === betaId).length).toBeGreaterThan(0);
    const betaPack = gw.lastMessages.find((_, i) => gw.lastSendOpts[i]?.botId === betaId)!;
    expect(isolationText(betaPack)).not.toContain(`From: ${alphaId}`);
    expect(app.orchestrator.bus.list().some((p) => p.fromBotId === alphaId)).toBe(true);
    releaseBeta();
    await done;

    await app.reject();
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT' : 'talk');
    await app.send('split please');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const beforePick = app.orchestrator.sessions.listPublished().length;
    gw.script = ({ turn }) => {
      if (turn === 'implement') {
        return changesetFence([{ path: 'picked.ts', op: 'create', content: 'p' }]);
      }
      return 'talk';
    };
    await app.pick(alphaId);
    expect(app.orchestrator.sessions.listPublished().some((p) => p.at === 'pick')).toBe(true);
    expect(app.orchestrator.sessions.listPublished().length).toBeGreaterThan(beforePick);
    expect(app.orchestrator.sessions.listPublished().some((p) => p.at === 'consensus' || p.at === 'pick')).toBe(true);
  });

  it('does not subscribe inactive or done bots; not fan-out', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const gamma = await app.createBot({
      name: 'Gamma',
      handle: 'gamma',
      persona: 'g',
      role: 'g',
      instructions: 'g',
    });
    await app.toggleBot(gamma.id, false);
    agreeThenImplement(gw);
    await app.send('build');
    expect(app.orchestrator.sessions.peek(gamma.id)).toBeUndefined();
    expect(gw.lastSendOpts.every((opts) => opts.botId !== gamma.id)).toBe(true);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    const betaId = app.registry.getByHandle('beta')!.id;
    expect(app.orchestrator.sessions.peek(alphaId)).toBeDefined();
    expect(app.orchestrator.sessions.peek(betaId)).toBeDefined();
  });
});

describe('EB-2 parallel debate batches', () => {
  it('remaining propose speakers share one batch; critique starts only after propose settled; no mixed batch', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('build the feature');
    const starts = msgs.filter((m) => m.type === 'chat/turn-start');
    const round1 = starts.filter((m) => m.type === 'chat/turn-start' && m.round === 1);
    const firstCritique = round1.findIndex((m) => m.type === 'chat/turn-start' && m.turn === 'critique');
    const lastPropose = [...round1].map((m, i) => ({ m, i })).filter((x) => x.m.type === 'chat/turn-start' && x.m.turn === 'propose').pop();
    expect(firstCritique).toBeGreaterThan(0);
    expect(lastPropose && lastPropose.i).toBeLessThan(firstCritique);
    const beforeCritique = round1.slice(0, firstCritique);
    expect(beforeCritique.every((m) => m.type === 'chat/turn-start' && m.turn === 'propose')).toBe(true);
    const proposeStarts = starts.filter((m) => m.type === 'chat/turn-start' && m.turn === 'propose' && m.round === 1);
    expect(proposeStarts).toHaveLength(2);
    expect(gw.maxInflight).toBeGreaterThan(1);
    expect(gw.turns.filter((t) => t === 'propose')).toHaveLength(4);
    expect(gw.turns.filter((t) => t === 'critique')).toHaveLength(4);
  });

  it('full simultaneous start: no speaker is packed after a sibling in that batch has already published', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    const betaId = app.registry.getByHandle('beta')!.id;
    let releaseBeta!: () => void;
    const holdBeta = new Promise<void>((resolve) => {
      releaseBeta = resolve;
    });
    const packedAfterPublish: string[] = [];
    let betaHolds = 0;
    gw.afterStart = async ({ botId }) => {
      const published = app.orchestrator.sessions.listPublished();
      if (published.length > 0 && gw.turns.length === 0) {
        packedAfterPublish.push(botId ?? '');
      }
      if (botId === betaId) {
        betaHolds += 1;
        if (betaHolds === 1) {
          await holdBeta;
        }
      }
    };
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 's.ts', op: 'create', content: 's' }]);
      }
      return 'talk';
    };
    const done = app.send('simultaneous');
    await vi.waitFor(() => {
      expect(app.orchestrator.sessions.listPublished().some((p) => p.fromBotId === alphaId)).toBe(true);
      expect(gw.requestCount).toBeGreaterThanOrEqual(2);
    });
    expect(packedAfterPublish).toEqual([]);
    const proposePacks = gw.lastMessages.filter((_, i) => {
      const instruction = gw.lastMessages[i]![gw.lastMessages[i]!.length - 1]?.content ?? '';
      return instruction.includes('Role: propose') && gw.turns.length >= 0;
    });
    const firstTwo = gw.lastMessages.slice(0, 2);
    expect(firstTwo).toHaveLength(2);
    for (const pack of firstTwo) {
      expect(isolationText(pack)).toBe('');
    }
    releaseBeta();
    await done;
    expect(firstTwo.some((pack) => isolationText(pack).includes(`From: ${alphaId}`))).toBe(false);
    expect(firstTwo.some((pack) => isolationText(pack).includes(`From: ${betaId}`))).toBe(false);
  });

  it('@ / vote / Split / implementer never overlap sendRequest', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    let seqInflight = 0;
    let seqMax = 0;
    const original = gw.stream.bind(gw);
    gw.stream = async (messages, token, onText) => {
      const instruction = messages[messages.length - 1]?.content ?? '';
      const sequential =
        instruction.includes('Role: vote') ||
        instruction.includes('Emit a JSON changeset') ||
        instruction.includes('NEED_EDIT');
      if (sequential) {
        seqInflight += 1;
        seqMax = Math.max(seqMax, seqInflight);
        try {
          return await original(messages, token, onText);
        } finally {
          seqInflight -= 1;
        }
      }
      return original(messages, token, onText);
    };
    agreeThenImplement(gw);
    await app.send('build');
    expect(seqMax).toBe(1);
    expect(gw.turns.filter((t) => t === 'implement')).toHaveLength(1);

    await app.reject();
    gw.maxInflight = 0;
    seqMax = 0;
    gw.script = ({ turn }) => (turn === 'direct' ? 'ok\nNO_EDIT' : 'x');
    await app.send('@alpha ping');
    expect(gw.maxInflight).toBe(1);
    expect(seqMax).toBe(1);
  });

  it('implementer runs after consensus / Pick with the full packet set; one JSON changeset', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    agreeThenImplement(gw, 'one.ts');
    await app.send('Must keep ACCEPT-CRITERIA-VERBATIM');
    const impl = gw.turns.filter((t) => t === 'implement');
    expect(impl).toHaveLength(1);
    const implIdx = gw.turns.findIndex((t) => t === 'implement');
    const isolation = isolationText(gw.lastMessages[implIdx]!);
    expect(isolation).toContain('At: consensus');
    expect(isolation).toContain('At: turn-end');
    expect(isolation).toContain('Must keep ACCEPT-CRITERIA-VERBATIM');
    expect(isolation).toContain('ACCEPT-CRITERIA-VERBATIM');
    const published = app.orchestrator.sessions.listPublished();
    expect(published.length).toBeGreaterThan(1);
    for (const packet of published) {
      expect(isolation).toContain(`At: ${packet.at}`);
    }
    expect(app.changesets.files).toHaveLength(1);
    expect(app.changesets.files?.[0]?.path).toBe('one.ts');
  });

  it('Stop cancels every in-flight sendRequest in the batch', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = () => 'talk';
    let release!: () => void;
    gw.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const done = app.send('go');
    await vi.waitFor(() => {
      expect(gw.requestCount).toBe(2);
    });
    app.stop();
    release();
    await done;
    expect(gw.turns.includes('implement')).toBe(false);
    expect(gw.turns.includes('critique')).toBe(false);
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    expect(app.orchestrator.getRunState().phase).toBe('split');
  });

  it('composer is locked until the batch settles', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    agreeThenImplement(gw);
    let release!: () => void;
    gw.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = app.send('one');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().debateRunning).toBe(true);
      expect(gw.requestCount).toBeGreaterThan(0);
    });
    const count = gw.requestCount;
    await app.send('two during batch');
    expect(gw.requestCount).toBe(count);
    expect(app.orchestrator.getRunState().debateRunning).toBe(true);
    release();
    await first;
  });
});

describe('EB-3 settle-then-ingest', () => {
  it('same-batch packs omit sibling packets, including when a speaker has not started', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const betaId = app.registry.getByHandle('beta')!.id;
    let releaseBeta!: () => void;
    const holdBeta = new Promise<void>((resolve) => {
      releaseBeta = resolve;
    });
    let betaHolds = 0;
    gw.afterStart = async ({ botId }) => {
      if (botId === betaId) {
        betaHolds += 1;
        if (betaHolds === 1) {
          await holdBeta;
        }
      }
    };
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'x.ts', op: 'create', content: 'x' }]);
      }
      return 'talk';
    };
    const done = app.send('go');
    await vi.waitFor(() => {
      expect(gw.lastMessages.length).toBeGreaterThanOrEqual(2);
      expect(app.orchestrator.sessions.listPublished().length).toBeGreaterThan(0);
    });
    const betaPropose = gw.lastMessages.find((_, i) => gw.lastSendOpts[i]?.botId === betaId)!;
    expect(isolationText(betaPropose)).toBe('');
    releaseBeta();
    await done;
    const proposePacks = gw.lastMessages.filter((_, i) => {
      const last = gw.lastMessages[i]![gw.lastMessages[i]!.length - 1]?.content ?? '';
      return last.includes('Role: propose');
    });
    for (const pack of proposePacks.filter((_, i) => i < 2)) {
      expect(isolationText(pack)).toBe('');
    }
  });

  it('in-flight sendRequest is not mutated when a sibling publishes', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const betaId = app.registry.getByHandle('beta')!.id;
    let releaseBeta!: () => void;
    const holdBeta = new Promise<void>((resolve) => {
      releaseBeta = resolve;
    });
    const original = gw.stream.bind(gw);
    let snapshot: string[] | undefined;
    gw.stream = async (messages, token, onText) => {
      const botId = gw.lastSendOpts[gw.lastSendOpts.length - 1]?.botId;
      if (botId === betaId && !snapshot) {
        snapshot = messages.map((m) => m.content);
        await holdBeta;
        expect(messages.map((m) => m.content)).toEqual(snapshot);
        expect(messages).toBe(gw.lastMessages.find((_, i) => gw.lastSendOpts[i]?.botId === betaId));
      }
      return original(messages, token, onText);
    };
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'm.ts', op: 'create', content: 'm' }]);
      }
      return 'talk';
    };
    const done = app.send('go');
    await vi.waitFor(() => {
      expect(app.orchestrator.sessions.listPublished().length).toBeGreaterThan(0);
      expect(snapshot).toBeDefined();
    });
    expect(snapshot!.some((text) => text.startsWith('Isolation packet:'))).toBe(false);
    releaseBeta();
    await done;
  });

  it('after settle, remaining-turn + implementer packs include every packet from that batch', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    const betaId = app.registry.getByHandle('beta')!.id;
    agreeThenImplement(gw);
    await app.send('batch packets');
    const critiqueIdx = gw.turns.findIndex((t) => t === 'critique');
    expect(critiqueIdx).toBeGreaterThanOrEqual(0);
    const critiquePack = isolationText(gw.lastMessages[critiqueIdx]!);
    expect(critiquePack).toContain('At: turn-end');
    expect(critiquePack).toContain(`From: ${alphaId}`);
    expect(critiquePack).toContain(`From: ${betaId}`);
    const impl = gw.turns.findIndex((t) => t === 'implement');
    const implIso = isolationText(gw.lastMessages[impl]!);
    expect(implIso).toContain(`From: ${alphaId}`);
    expect(implIso).toContain(`From: ${betaId}`);
    expect(implIso).toContain('At: consensus');
    const published = app.orchestrator.sessions.listPublished().filter((p) => p.at === 'turn-end' && p.fromBotId);
    expect(published.length).toBeGreaterThanOrEqual(2);
    for (const packet of published) {
      expect(implIso).toContain(`From: ${packet.fromBotId}`);
    }
  });

  it('critique pack includes all propose packets + own SI-1', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    gw.script = ({ turn, instruction, messages }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'propose' && messages[0]?.content.includes('@alpha')) {
        return 'ALPHA-OWN-PROPOSE-HISTORY';
      }
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'c.ts', op: 'create', content: 'c' }]);
      }
      return 'talk';
    };
    await app.send('critique talk');
    const alphaCritique = gw.lastMessages.find((pack, i) => {
      const last = pack[pack.length - 1]?.content ?? '';
      return gw.lastSendOpts[i]?.botId === alphaId && last.includes('Role: critique');
    })!;
    const text = joined(alphaCritique);
    expect(text).toContain('ALPHA-OWN-PROPOSE-HISTORY');
    expect(isolationText(alphaCritique)).toContain('At: turn-end');
    expect(isolationText(alphaCritique)).toContain(`From: ${alphaId}`);
    const betaId = app.registry.getByHandle('beta')!.id;
    expect(isolationText(alphaCritique)).toContain(`From: ${betaId}`);
  });

  it('Continue / later batch ingests all settled packets from prior batches first', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT' : 'talk');
    await app.send('first');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    expect(app.orchestrator.sessions.messagesOf(alphaId).some((m) => m.content.startsWith('Isolation packet:'))).toBe(
      true,
    );
    const prior = app.orchestrator.sessions.listPublished().length;
    expect(prior).toBeGreaterThan(0);
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'c.ts', op: 'create', content: 'c' }]);
      }
      return 'talk';
    };
    const before = gw.lastMessages.length;
    await app.continueDebate();
    const continuedPropose = gw.lastMessages.slice(before).find((pack) => {
      const last = pack[pack.length - 1]?.content ?? '';
      return last.includes('Role: propose');
    })!;
    expect(isolationText(continuedPropose)).toContain('At: turn-end');
    expect(isolationText(continuedPropose).split('Isolation packet:').length).toBeGreaterThan(1);
  });

  it('does not silently drop a published packet', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('keep every packet');
    const impl = gw.turns.findIndex((t) => t === 'implement');
    const isolation = isolationText(gw.lastMessages[impl]!);
    const published = app.orchestrator.sessions.listPublished();
    expect(published.length).toBeGreaterThan(0);
    for (const packet of published) {
      expect(isolation).toContain(`At: ${packet.at}`);
      if (packet.fromBotId) {
        expect(isolation).toContain(`From: ${packet.fromBotId}`);
      }
    }
  });

  it('QC-3 overflow of one bot does not cancel siblings; that bot still has no sibling packets from the batch', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    await app.createBot({
      name: 'Beta',
      handle: 'beta',
      persona: 'OVERFLOW-' + 'Z'.repeat(4000),
      role: 'review',
      instructions: 'two',
    });
    const alphaId = app.registry.getByHandle('alpha')!.id;
    const betaId = app.registry.getByHandle('beta')!.id;
    gw.maxInputTokens = 1200;
    let release!: () => void;
    gw.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'o.ts', op: 'create', content: 'o' }]);
      }
      return 'talk';
    };
    const done = app.send('one overflows');
    await vi.waitFor(() => {
      expect(msgs.some((m) => m.type === 'error' && m.code === 'pack-overflow')).toBe(true);
      expect(gw.requestCount).toBeGreaterThan(0);
    });
    expect(app.orchestrator.getRunState().debateRunning).toBe(true);
    expect(gw.lastSendOpts.every((opts) => opts.botId !== betaId)).toBe(true);
    const during = gw.lastMessages.filter((_, i) => gw.lastSendOpts[i]?.botId === alphaId);
    expect(during.length).toBeGreaterThan(0);
    expect(isolationText(during[0]!)).toBe('');
    const count = gw.requestCount;
    await app.send('ignored while batch');
    expect(gw.requestCount).toBe(count);
    release();
    await done;
    expect(gw.lastSendOpts.some((opts) => opts.botId === alphaId)).toBe(true);
    expect(msgs.some((m) => m.type === 'error' && m.message === COPY.packOverflow)).toBe(true);
  });
});

describe('EB-4 SI-1 persist + talk', () => {
  it('SI-1 is still present at critique; not reset between batches', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    gw.script = ({ turn, messages }) => {
      if (turn === 'propose' && messages[0]?.content.includes('@alpha')) {
        return 'OWN-HISTORY-LINE';
      }
      if (turn === 'consensus') {
        return 'DISSENT';
      }
      return 'talk';
    };
    await app.send('persist me');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    const atSplit = app.orchestrator.sessions.messagesOf(alphaId);
    expect(atSplit.length).toBeGreaterThan(0);
    expect(atSplit.some((m) => m.content.includes('OWN-HISTORY-LINE'))).toBe(true);
    expect(atSplit.some((m) => m.content.startsWith('Isolation packet:'))).toBe(true);
    const critique = gw.lastMessages.find((pack, i) => {
      const last = pack[pack.length - 1]?.content ?? '';
      return gw.lastSendOpts[i]?.botId === alphaId && last.includes('Role: critique');
    })!;
    expect(joined(critique)).toContain('OWN-HISTORY-LINE');
    expect(isolationText(critique)).toContain('At: turn-end');
  });

  it('SI-1 persists across Continue and Pick', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT' : 'KEEP-ME');
    await app.send('first');
    const mid = app.orchestrator.sessions.messagesOf(alphaId).length;
    expect(mid).toBeGreaterThan(0);
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'DISSENT';
      }
      return 'KEEP-ME';
    };
    await app.continueDebate();
    expect(app.orchestrator.sessions.messagesOf(alphaId).length).toBeGreaterThan(mid);
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    gw.script = ({ turn }) => {
      if (turn === 'implement') {
        return changesetFence([{ path: 'p.ts', op: 'create', content: 'p' }]);
      }
      return 'x';
    };
    await app.pick(alphaId);
    expect(app.orchestrator.sessions.messagesOf(alphaId).length).toBeGreaterThan(0);
    expect(app.orchestrator.sessions.messagesOf(alphaId).some((m) => m.content.includes('KEEP-ME'))).toBe(true);
  });

  it('ingest appends; subscriber own history is not replaced or wiped; stores are never merged', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    const betaId = app.registry.getByHandle('beta')!.id;
    gw.script = ({ turn, messages }) => {
      if (turn === 'propose' && messages[0]?.content.includes('@alpha')) {
        return 'ALPHA-OWN-ONLY';
      }
      if (turn === 'propose' && messages[0]?.content.includes('@beta')) {
        return 'BETA-OWN-ONLY';
      }
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'z.ts', op: 'create', content: 'z' }]);
      }
      return 'talk';
    };
    await app.send('no merge');
    const alpha = app.orchestrator.sessions.messagesOf(alphaId);
    const beta = app.orchestrator.sessions.messagesOf(betaId);
    expect(alpha.some((m) => m.content.includes('ALPHA-OWN-ONLY'))).toBe(true);
    expect(alpha.some((m) => m.content.includes('BETA-OWN-ONLY'))).toBe(false);
    expect(beta.some((m) => m.content.includes('BETA-OWN-ONLY'))).toBe(true);
    expect(beta.some((m) => m.content.includes('ALPHA-OWN-ONLY'))).toBe(false);
    expect(alpha.filter((m) => m.content.startsWith('Isolation packet:')).length).toBeGreaterThan(0);
  });

  it('packs do not restuff HV articles or a global Swarm transcript', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn, messages }) => {
      if (turn === 'propose' && messages[0]?.content.includes('@alpha')) {
        return 'ALPHA-HV-ARTICLE-FULL';
      }
      if (turn === 'propose' && messages[0]?.content.includes('@beta')) {
        return 'BETA-HV-ARTICLE-FULL';
      }
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'h.ts', op: 'create', content: 'h' }]);
      }
      return 'talk';
    };
    await app.send('hv display only');
    const betaId = app.registry.getByHandle('beta')!.id;
    for (let i = 0; i < gw.turns.length; i++) {
      const text = joined(gw.lastMessages[i]!);
      const isolation = isolationText(gw.lastMessages[i]!);
      expect(isolation).not.toContain('ALPHA-HV-ARTICLE-FULL');
      expect(isolation).not.toContain('BETA-HV-ARTICLE-FULL');
      if (gw.lastSendOpts[i]?.botId === betaId) {
        expect(text).not.toContain('ALPHA-HV-ARTICLE-FULL');
      }
    }
  });

  it('talk fields are SI-2 verbatim + OS-4 bodies; AC is not lossy-summarized', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('Must keep ACCEPT-CRITERIA-VERBATIM-AC');
    const betaId = app.registry.getByHandle('beta')!.id;
    const critique = gw.lastMessages.find((pack, i) => {
      const last = pack[pack.length - 1]?.content ?? '';
      return gw.lastSendOpts[i]?.botId === betaId && last.includes('Role: critique');
    })!;
    const isolation = isolationText(critique);
    expect(isolation).toContain('Must keep ACCEPT-CRITERIA-VERBATIM-AC');
    expect(isolation).toContain('- Must keep ACCEPT-CRITERIA-VERBATIM-AC');
    expect(isolation).not.toMatch(/AC summarized|summary of acceptance/i);
  });

  it('failed drafts stay unpublished', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    gw.script = ({ turn }) => {
      if (turn === 'direct') {
        return 'BANTER-FAILED-DRAFT please ignore\nNEED_EDIT';
      }
      return 'not-a-changeset FAILED-DRAFT-JSON';
    };
    await app.send('@alpha please edit');
    expect(msgs.some((m) => m.type === 'error' && m.code === 'parse-failed')).toBe(true);
    const isolation = gw.lastMessages.map(isolationText).join('\n');
    expect(isolation).not.toContain('BANTER-FAILED-DRAFT');
    expect(isolation).not.toContain('FAILED-DRAFT-JSON');
    expect(app.orchestrator.sessions.listPublished().every((p) => !p.requirements.some((r) => r.includes('BANTER')))).toBe(
      true,
    );
  });

  it('CM-4 stale nodeIds omitted; turn not blocked; SI-2 bodies unchanged', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('build the src/app.ts feature');
    expect(app.orchestrator.getRunState().phase).not.toBe('error');
    const published = app.orchestrator.sessions.listPublished();
    expect(published.length).toBeGreaterThan(0);
    for (const packet of published) {
      expect(packet.nodeIds?.includes('file:stale.ts')).toBeFalsy();
      expect(packet.requirements.join('\n')).toContain('build the src/app.ts feature');
    }
  });

  it('each parallel sendRequest uses that bot MS-1 modelId', async () => {
    const { app, gw } = harness();
    await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'a',
      role: 'lead',
      instructions: 'one',
      modelId: 'copilot/picked',
    });
    await app.createBot({
      name: 'Beta',
      handle: 'beta',
      persona: 'b',
      role: 'review',
      instructions: 'two',
      modelId: 'copilot/other',
    });
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'm.ts', op: 'create', content: 'm' }]);
      }
      return 'talk';
    };
    await app.send('models');
    const propose = gw.turns
      .map((turn, i) => ({ turn, modelId: gw.lastSendOpts[i]?.modelId }))
      .filter((t) => t.turn === 'propose');
    expect(propose.map((p) => p.modelId).sort()).toEqual(['copilot/other', 'copilot/picked']);
    const critique = gw.turns
      .map((turn, i) => ({ turn, modelId: gw.lastSendOpts[i]?.modelId }))
      .filter((t) => t.turn === 'critique');
    expect(critique.map((p) => p.modelId).sort()).toEqual(['copilot/other', 'copilot/picked']);
  });

  it('reload / run-end clears SI-1; BR-3 / BotStoreFile.version unchanged', async () => {
    const { app, gw, store } = harness();
    await twoBots(app);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    agreeThenImplement(gw);
    await app.send('build');
    expect(app.orchestrator.sessions.messagesOf(alphaId).length).toBeGreaterThan(0);
    expect(app.orchestrator.bus.list().length).toBeGreaterThan(0);
    await app.reject();
    expect(app.orchestrator.sessions.peek(alphaId)).toBeUndefined();
    expect(app.orchestrator.bus.list()).toEqual([]);
    expect(BOTS_STATE_KEY).toBe('botrider.bots.v1');
    expect(JSON.stringify(store.get(BOTS_STATE_KEY))).not.toMatch(/Isolation packet|inbox|sessionMessages|HostEventBus/);
    expect(src('src/app/bot-session-store.ts')).not.toMatch(/BotStoreFile|BOTS_STATE_KEY|setKeysForSync/);
    expect(src('src/app/event-bus.ts')).not.toMatch(/BotStoreFile|globalState|memento/);
    expect(src('src/app/bot-session-store.ts')).not.toMatch(/version:\s*[2-9]/);
    for (const file of listSrcTs(join(root, 'src'))) {
      expect(src(file), file).not.toMatch(/setKeysForSync/);
    }
  });
});
