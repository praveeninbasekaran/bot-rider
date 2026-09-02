import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Application } from '../src/app/application';
import { COPY } from '../src/app/copy';
import {
  idleWorkBots,
  ownerIdsForFiles,
  validateDispatcherSplit,
} from '../src/app/work-split';
import type { HostToUi, PromptMessage } from '../src/protocol/messages';
import {
  assignmentFence,
  changesetFence,
  defaultWorkspace,
  FakeGateway,
  FakeMcpPort,
  FixedWorkspace,
  MemoryFs,
  MemoryStore,
} from './fakes';
import { McpGateway } from '../src/app/mcp-gateway';

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

function harness(mcp?: McpGateway) {
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
    undefined,
    undefined,
    mcp,
  );
  return { app, gw, fs, store, msgs };
}

function notices(msgs: HostToUi[]): string[] {
  return msgs.filter((m) => m.type === 'chat/notice').map((m) => m.text);
}

function isolationText(pack: PromptMessage[]): string {
  return pack
    .filter((m) => m.content.startsWith('Isolation packet:'))
    .map((m) => m.content)
    .join('\n');
}

function assignedFrom(instruction: string): string[] {
  const out: string[] = [];
  let take = false;
  for (const line of instruction.split('\n')) {
    if (line.startsWith('Assigned paths:')) {
      take = true;
      continue;
    }
    if (take && line.startsWith('- ')) {
      out.push(line.slice(2).trim());
      continue;
    }
    if (take && line.trim()) {
      break;
    }
  }
  return out;
}

function workHandles(gw: FakeGateway): string[] {
  return gw.lastSendOpts.filter((_, i) => gw.turns[i] === 'work').map((opts) => opts.handle ?? '');
}

function extraWorkHandles(gw: FakeGateway): string[] {
  const firstWork = gw.turns.indexOf('work');
  const secondDispatch = gw.turns.indexOf('dispatch', firstWork);
  if (secondDispatch < 0) {
    return [];
  }
  return gw.lastSendOpts
    .filter((_, i) => i > secondDispatch && gw.turns[i] === 'work')
    .map((opts) => opts.handle ?? '');
}

async function swarm(app: Application, extraHandles: string[] = ['devc']) {
  await app.createBot({
    name: 'SpecBot',
    handle: 'specbot',
    persona: 'spec persona',
    role: 'analyst',
    instructions: 'write spec',
    spec: true,
  });
  await app.createBot({
    name: 'Lead',
    handle: 'lead',
    persona: 'dispatch persona',
    role: 'lead',
    instructions: 'split paths',
    dispatcher: true,
  });
  await app.createBot({
    name: 'DevA',
    handle: 'deva',
    persona: 'a',
    role: 'dev',
    instructions: 'one',
  });
  await app.createBot({
    name: 'DevB',
    handle: 'devb',
    persona: 'b',
    role: 'dev',
    instructions: 'two',
  });
  for (const handle of extraHandles) {
    await app.createBot({
      name: handle,
      handle,
      persona: handle,
      role: 'dev',
      instructions: 'extra',
    });
  }
}

function scriptFollowOn(
  gw: FakeGateway,
  opts: {
    first?: { handle: string; paths: string[] }[];
    extra?: { handle: string; paths: string[] }[];
    filesFor?: (
      handle: string,
      paths: string[],
      phase: 'first' | 'extra',
    ) => { path: string; op: 'create' | 'update' | 'delete'; content?: string }[];
    argue?: (handle: string) => string;
    collideFirst?: boolean;
  } = {},
) {
  const first = opts.first ?? [
    { handle: 'deva', paths: ['src/a.ts'] },
    { handle: 'devb', paths: ['src/b.ts'] },
  ];
  const extra = opts.extra ?? [{ handle: 'devc', paths: ['src/c.ts'] }];
  let dispatchCount = 0;
  gw.script = ({ turn, instruction, messages }) => {
    if (turn === 'spec') {
      return 'SPEC-BODY login must work';
    }
    if (turn === 'dispatch') {
      dispatchCount += 1;
      return assignmentFence(dispatchCount === 1 ? first : extra);
    }
    if (turn === 'work') {
      const persona = messages[0]?.content ?? '';
      const handle =
        [...first, ...extra].find((item) => persona.includes(`@${item.handle}`))?.handle ??
        extra[0]?.handle ??
        first[0]!.handle;
      const paths = assignedFrom(instruction);
      const phase: 'first' | 'extra' = dispatchCount >= 2 ? 'extra' : 'first';
      const usedPaths = paths.length ? paths : [...first, ...extra].find((item) => item.handle === handle)?.paths ?? [];
      if (opts.filesFor) {
        return changesetFence(opts.filesFor(handle, usedPaths, phase));
      }
      if (opts.collideFirst && phase === 'first') {
        if (handle === 'deva') {
          return changesetFence([
            { path: 'src/a.ts', op: 'create', content: 'from-deva-a' },
            { path: 'src/keep.ts', op: 'create', content: 'keep' },
          ]);
        }
        if (handle === 'devb') {
          return changesetFence([{ path: 'src/a.ts', op: 'create', content: 'from-devb-a' }]);
        }
      }
      return changesetFence(usedPaths.map((path) => ({ path, op: 'create' as const, content: handle })));
    }
    if (turn === 'argue') {
      const persona = messages[0]?.content ?? '';
      const handle = persona.includes('@deva') ? 'deva' : persona.includes('@devb') ? 'devb' : 'unknown';
      return opts.argue ? opts.argue(handle) : 'DISSENT';
    }
    if (turn === 'direct') {
      return 'solo during extra\nNO_EDIT';
    }
    return 'talk';
  };
}

function holdRole(gw: FakeGateway, role: string, latch: Promise<void>): void {
  const prev = gw.afterStart;
  gw.afterStart = async (info) => {
    if (prev) {
      await prev(info);
    }
    const last = info.messages[info.messages.length - 1]?.content ?? '';
    if (last.includes(`Role: ${role}`)) {
      await latch;
    }
  };
}

describe('FO-1 idle trigger', () => {
  it('does not start extra dispatch during BA, first Work-batch, or Argue', async () => {
    const ba = harness();
    await swarm(ba.app);
    const specId = ba.app.registry.getByHandle('specbot')!.id;
    let releaseSpec!: () => void;
    const holdSpec = new Promise<void>((resolve) => {
      releaseSpec = resolve;
    });
    ba.gw.afterStart = async ({ botId }) => {
      if (botId === specId) {
        await holdSpec;
      }
    };
    scriptFollowOn(ba.gw);
    const baDone = ba.app.send('ba hold', 'work');
    await vi.waitFor(() => {
      expect(ba.gw.requestCount).toBe(1);
    });
    expect(ba.gw.turns.includes('dispatch')).toBe(false);
    expect(ba.app.changesets.hasPending()).toBe(false);
    releaseSpec();
    await baDone;

    const first = harness();
    await swarm(first.app);
    let releaseWork!: () => void;
    const holdWork = new Promise<void>((resolve) => {
      releaseWork = resolve;
    });
    holdRole(first.gw, 'work', holdWork);
    scriptFollowOn(first.gw);
    const firstDone = first.app.send('first batch hold', 'work');
    await vi.waitFor(() => {
      expect(first.app.orchestrator.getRunState().workBatch).toBe(true);
    });
    expect(first.gw.turns.filter((t) => t === 'dispatch')).toHaveLength(1);
    expect(first.gw.lastSendOpts.some((opts) => opts.handle === 'devc')).toBe(false);
    expect(first.app.changesets.hasPending()).toBe(false);
    releaseWork();
    await firstDone;
    expect(first.gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);

    const argue = harness();
    await swarm(argue.app, []);
    let releaseArgue!: () => void;
    const holdArgue = new Promise<void>((resolve) => {
      releaseArgue = resolve;
    });
    let heldArgue = false;
    argue.gw.afterStart = async (info) => {
      const last = info.messages[info.messages.length - 1]?.content ?? '';
      if (last.includes('Role: argue') && !heldArgue) {
        heldArgue = true;
        await holdArgue;
      }
    };
    scriptFollowOn(argue.gw, {
      first: [
        { handle: 'deva', paths: ['src/a.ts'] },
        { handle: 'devb', paths: ['src/z.ts'] },
      ],
      extra: [{ handle: 'devb', paths: ['src/extra.ts'] }],
      collideFirst: true,
      argue: () => 'DISSENT',
    });
    const argueDone = argue.app.send('argue hold', 'work');
    await vi.waitFor(() => {
      expect(argue.app.orchestrator.getRunState().argue).toBe(true);
    });
    expect(argue.gw.turns.filter((t) => t === 'dispatch')).toHaveLength(1);
    expect(argue.app.orchestrator.getRunState().arguePath).toBe('src/a.ts');
    expect(notices(argue.msgs).some((t) => t.startsWith('ARGUE · '))).toBe(true);
    releaseArgue();
    await argueDone;
    expect(argue.gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);
  });

  it('after first batch + Argue settle, idle active bots including dropped-collision-only MAY get one extra dispatch + Work-batch', async () => {
    const neverAssigned = harness();
    await swarm(neverAssigned.app);
    scriptFollowOn(neverAssigned.gw);
    await neverAssigned.app.send('idle never assigned', 'work');
    expect(neverAssigned.gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);
    expect(extraWorkHandles(neverAssigned.gw)).toEqual(['devc']);
    expect((neverAssigned.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);

    const dropped = harness();
    await swarm(dropped.app, []);
    scriptFollowOn(dropped.gw, {
      first: [
        { handle: 'deva', paths: ['src/a.ts'] },
        { handle: 'devb', paths: ['src/z.ts'] },
      ],
      extra: [{ handle: 'devb', paths: ['src/extra.ts'] }],
      collideFirst: true,
      argue: () => 'DISSENT',
    });
    await dropped.app.send('dropped collision idle', 'work');
    expect(dropped.gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);
    expect(extraWorkHandles(dropped.gw)).toEqual(['devb']);
    expect((dropped.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/extra.ts', 'src/keep.ts']);
    expect((dropped.app.changesets.files ?? []).some((f) => f.path === 'src/a.ts')).toBe(false);
  });

  it('spec/dispatcher extra split is skipped; they never get a work turn in the extra batch', async () => {
    const { app, gw, msgs } = harness();
    await swarm(app);
    scriptFollowOn(gw, {
      extra: [{ handle: 'specbot', paths: ['src/c.ts'] }],
    });
    await app.send('spec not idle', 'work');
    expect(extraWorkHandles(gw)).toEqual([]);
    expect(workHandles(gw).includes('specbot')).toBe(false);
    expect(workHandles(gw).includes('lead')).toBe(false);
    expect(msgs.some((m) => m.type === 'chat/notice' && m.text === COPY.followOnSkipped)).toBe(true);
    expect((app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('zero idle → silent skip, no banner, first union Approves', async () => {
    const { app, gw, msgs, fs } = harness();
    await swarm(app, []);
    scriptFollowOn(gw, { extra: [] });
    await app.send('zero idle', 'work');
    expect(gw.turns.filter((t) => t === 'dispatch')).toHaveLength(1);
    expect(gw.turns.filter((t) => t === 'work')).toHaveLength(2);
    expect(notices(msgs)).not.toContain(COPY.followOnSkipped);
    expect(notices(msgs).some((t) => /follow-on|Follow-on/.test(t))).toBe(false);
    expect(app.changesets.hasPending()).toBe(true);
    expect((app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    await app.approve();
    expect(fs.applyCalls).toBe(1);
  });
});

describe('FO-2 extra dispatch validate', () => {
  it('rejects extra split that overlaps the pending union; note Follow-on work skipped.; first union Approves', async () => {
    const { app, gw, msgs, fs } = harness();
    await swarm(app);
    scriptFollowOn(gw, {
      extra: [{ handle: 'devc', paths: ['src/a.ts'] }],
    });
    await app.send('overlap pending', 'work');
    expect(extraWorkHandles(gw)).toEqual([]);
    expect(notices(msgs)).toContain(COPY.followOnSkipped);
    expect(COPY.followOnSkipped).toBe('Follow-on work skipped.');
    expect((app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    await app.approve();
    expect(fs.applyCalls).toBe(1);
    expect(fs.lastOps.some((op) => 'relativePath' in op && op.relativePath === 'src/c.ts')).toBe(false);
  });

  it('rejects extra split that is invalid among extra assignments; first union Approves', async () => {
    const { app, gw, msgs } = harness();
    await swarm(app, ['devc', 'devd']);
    scriptFollowOn(gw, {
      extra: [
        { handle: 'devc', paths: ['src/c.ts'] },
        { handle: 'devd', paths: ['src/c.ts'] },
      ],
    });
    await app.send('overlap extra', 'work');
    expect(extraWorkHandles(gw)).toEqual([]);
    expect(notices(msgs)).toContain('Follow-on work skipped.');
    expect((app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('host never invents a partition', async () => {
    const { app, gw } = harness();
    await swarm(app, ['devc', 'devd']);
    scriptFollowOn(gw, {
      extra: [{ handle: 'devc', paths: ['src/c.ts'] }],
    });
    await app.send('no invent', 'work');
    expect(extraWorkHandles(gw)).toEqual(['devc']);
    expect(extraWorkHandles(gw)).not.toContain('devd');
    expect((app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(src('src/app/work-split.ts')).not.toMatch(/fillMissing|leftoverPaths|rewriteSplit/);
    expect(src('src/app/orchestrator.ts')).not.toMatch(/fillMissing|leftoverPaths|rewriteSplit/);
  });
});

describe('FO-3 cap + DEAF + no second Argue', () => {
  it('caps one extra dispatch + one extra Work-batch per Work Send; no second extra', async () => {
    const { app, gw } = harness();
    await swarm(app, ['devc', 'devd']);
    scriptFollowOn(gw, {
      extra: [{ handle: 'devc', paths: ['src/c.ts'] }],
    });
    await app.send('cap one', 'work');
    expect(gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);
    expect(extraWorkHandles(gw)).toEqual(['devc']);
    expect(gw.turns.filter((t) => t === 'work').length).toBe(3);
  });

  it('extra Work-batch is DEAF; QC-3 overflow skips that bot only', async () => {
    const deaf = harness();
    await swarm(deaf.app, ['devc', 'devd']);
    const idC = deaf.app.registry.getByHandle('devc')!.id;
    const idD = deaf.app.registry.getByHandle('devd')!.id;
    let releaseD!: () => void;
    const holdD = new Promise<void>((resolve) => {
      releaseD = resolve;
    });
    deaf.gw.afterStart = async (info) => {
      const last = info.messages[info.messages.length - 1]?.content ?? '';
      if (last.includes('Role: work') && last.includes('src/d.ts')) {
        await holdD;
      }
    };
    scriptFollowOn(deaf.gw, {
      extra: [
        { handle: 'devc', paths: ['src/c.ts'] },
        { handle: 'devd', paths: ['src/d.ts'] },
      ],
    });
    const done = deaf.app.send('extra deaf', 'work');
    await vi.waitFor(() => {
      expect(deaf.app.orchestrator.getRunState().workBatch).toBe(true);
      expect(deaf.gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);
      expect(deaf.gw.maxInflight).toBeGreaterThanOrEqual(2);
    });
    const extraPacks = deaf.gw.lastMessages.filter((pack) => {
      const last = pack.at(-1)?.content ?? '';
      return last.includes('Role: work') && (last.includes('src/c.ts') || last.includes('src/d.ts'));
    });
    expect(extraPacks.length).toBeGreaterThanOrEqual(2);
    for (const pack of extraPacks) {
      const iso = isolationText(pack);
      expect(iso).not.toContain(`From: ${idC}`);
      expect(iso).not.toContain(`From: ${idD}`);
    }
    releaseD();
    await done;

    const overflow = harness();
    await swarm(overflow.app, ['devc', 'devd']);
    await overflow.app.updateBot(overflow.app.registry.getByHandle('devd')!.id, {
      name: 'devd',
      handle: 'devd',
      persona: 'OVERFLOW-' + 'Z'.repeat(8000),
      role: 'dev',
      instructions: 'extra',
      active: true,
    });
    overflow.gw.maxInputTokens = 3000;
    scriptFollowOn(overflow.gw, {
      extra: [
        { handle: 'devc', paths: ['src/c.ts'] },
        { handle: 'devd', paths: ['src/d.ts'] },
      ],
    });
    await overflow.app.send('extra overflow', 'work');
    expect(overflow.msgs.some((m) => m.type === 'error' && m.message === COPY.packOverflow)).toBe(true);
    expect(extraWorkHandles(overflow.gw)).toEqual(['devc']);
    expect((overflow.app.changesets.files ?? []).map((f) => f.path)).toContain('src/c.ts');
    expect((overflow.app.changesets.files ?? []).map((f) => f.path)).not.toContain('src/d.ts');
  });

  it('extra-batch internal collision DROP + Skipped {path} · collision; no second Argue', async () => {
    const { app, gw, msgs } = harness();
    await swarm(app, ['devc', 'devd']);
    scriptFollowOn(gw, {
      extra: [
        { handle: 'devc', paths: ['src/c.ts'] },
        { handle: 'devd', paths: ['src/d.ts'] },
      ],
      filesFor: (handle, paths, phase) => {
        if (phase === 'extra') {
          return [{ path: 'src/both.ts', op: 'create', content: handle }];
        }
        return paths.map((path) => ({ path, op: 'create' as const, content: handle }));
      },
    });
    await app.send('extra collide', 'work');
    expect(notices(msgs)).toContain(COPY.skippedCollision('src/both.ts'));
    expect((app.changesets.files ?? []).some((f) => f.path === 'src/both.ts')).toBe(false);
    expect((app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    const firstWork = gw.turns.indexOf('work');
    const secondDispatch = gw.turns.indexOf('dispatch', firstWork);
    expect(gw.turns.slice(secondDispatch + 1).includes('argue')).toBe(false);
    expect(notices(msgs).filter((t) => t.startsWith('ARGUE · '))).toEqual([]);
  });
});

describe('FO-4 union + Stop', () => {
  it('ONE Files Approve after extra batch settles or skip; remainder never discarded', async () => {
    const settled = harness();
    await swarm(settled.app);
    scriptFollowOn(settled.gw);
    await settled.app.send('union extra', 'work');
    expect(settled.app.changesets.hasPending()).toBe(true);
    expect((settled.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    await settled.app.approve();
    expect(settled.fs.applyCalls).toBe(1);

    const skipped = harness();
    await swarm(skipped.app);
    scriptFollowOn(skipped.gw, { extra: [{ handle: 'devc', paths: ['src/a.ts'] }] });
    await skipped.app.send('union skip', 'work');
    expect((skipped.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    await skipped.app.approve();
    expect(skipped.fs.applyCalls).toBe(1);

    const withWinner = harness();
    await swarm(withWinner.app, []);
    scriptFollowOn(withWinner.gw, {
      first: [
        { handle: 'deva', paths: ['src/a.ts'] },
        { handle: 'devb', paths: ['src/z.ts'] },
      ],
      extra: [{ handle: 'devb', paths: ['src/extra.ts'] }],
      collideFirst: true,
      argue: () => 'AGREE @deva',
    });
    await withWinner.app.send('remainder plus winner plus extra', 'work');
    expect((withWinner.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual([
      'src/a.ts',
      'src/extra.ts',
      'src/keep.ts',
    ]);
    expect(withWinner.app.changesets.files?.find((f) => f.path === 'src/a.ts')?.content).toBe('from-deva-a');
    await withWinner.app.approve();
    expect(withWinner.fs.applyCalls).toBe(1);
  });

  it('Approve disabled until extra batch settles or is skipped', async () => {
    const running = harness();
    await swarm(running.app);
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    let extraHeld = false;
    running.gw.afterStart = async (info) => {
      const last = info.messages[info.messages.length - 1]?.content ?? '';
      if (last.includes('Role: work') && last.includes('src/c.ts') && !extraHeld) {
        extraHeld = true;
        await latch;
      }
    };
    scriptFollowOn(running.gw);
    const done = running.app.send('hold extra approve', 'work');
    await vi.waitFor(() => {
      expect(running.app.orchestrator.getRunState().workBatch).toBe(true);
      expect(running.gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);
    });
    expect(running.app.changesets.hasPending()).toBe(false);
    expect((running.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(await running.app.approve()).toBe(false);
    expect(running.fs.applyCalls).toBe(0);
    release();
    await done;
    expect(running.app.changesets.hasPending()).toBe(true);
    expect((running.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('Approve stays disabled while extra dispatch is in flight, then skip Approves the first union', async () => {
    const skipHold = harness();
    await swarm(skipHold.app);
    let releaseDispatch!: () => void;
    const holdDispatch = new Promise<void>((resolve) => {
      releaseDispatch = resolve;
    });
    let extraDispatchHeld = false;
    skipHold.gw.afterStart = async (info) => {
      const last = info.messages[info.messages.length - 1]?.content ?? '';
      if (last.includes('Role: dispatch') && last.includes('Claimed paths:') && !extraDispatchHeld) {
        extraDispatchHeld = true;
        await holdDispatch;
      }
    };
    scriptFollowOn(skipHold.gw, { extra: [{ handle: 'devc', paths: ['src/a.ts'] }] });
    const skipDone = skipHold.app.send('hold extra skip', 'work');
    await vi.waitFor(() => {
      expect(skipHold.gw.turns.filter((t) => t === 'dispatch').length).toBe(2);
    });
    expect(skipHold.app.changesets.hasPending()).toBe(false);
    expect(await skipHold.app.approve()).toBe(false);
    expect((skipHold.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    releaseDispatch();
    await skipDone;
    expect(skipHold.app.changesets.hasPending()).toBe(true);
    expect((skipHold.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('Stop during extra batch aborts, no enterSplit; remainder Approves; Work Stop still does not enterSplit', async () => {
    const extraStop = harness();
    await swarm(extraStop.app);
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    let extraHeld = false;
    extraStop.gw.afterStart = async (info) => {
      const last = info.messages[info.messages.length - 1]?.content ?? '';
      if (last.includes('Role: work') && last.includes('src/c.ts') && !extraHeld) {
        extraHeld = true;
        await latch;
      }
    };
    scriptFollowOn(extraStop.gw);
    const done = extraStop.app.send('stop extra', 'work');
    await vi.waitFor(() => {
      expect(extraStop.app.orchestrator.getRunState().workBatch).toBe(true);
      expect(extraStop.gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);
    });
    extraStop.app.stop();
    expect(extraStop.msgs.some((m) => m.type === 'chat/split')).toBe(false);
    release();
    await done;
    expect(extraStop.app.orchestrator.getRunState().splitOpen).toBe(false);
    expect(extraStop.app.orchestrator.getRunState().phase).not.toBe('split');
    expect((extraStop.app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect((extraStop.app.changesets.files ?? []).some((f) => f.path === 'src/c.ts')).toBe(false);
    await extraStop.app.approve();
    expect(extraStop.fs.applyCalls).toBe(1);
    const after = extraStop.gw.requestCount;
    await extraStop.app.continueDebate();
    await extraStop.app.pick(extraStop.app.registry.getByHandle('lead')!.id);
    expect(extraStop.gw.requestCount).toBe(after);

    const firstStop = harness();
    await swarm(firstStop.app);
    let releaseFirst!: () => void;
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    holdRole(firstStop.gw, 'work', holdFirst);
    scriptFollowOn(firstStop.gw);
    const firstDone = firstStop.app.send('stop first still', 'work');
    await vi.waitFor(() => {
      expect(firstStop.app.orchestrator.getRunState().workBatch).toBe(true);
    });
    firstStop.app.stop();
    releaseFirst();
    await firstDone;
    expect(firstStop.app.orchestrator.getRunState().splitOpen).toBe(false);
    expect(firstStop.msgs.some((m) => m.type === 'chat/split')).toBe(false);
    expect(firstStop.app.changesets.hasPending()).toBe(false);
  });

  it('invalid-split copy is Follow-on work skipped.; zero-idle skip has no banner', async () => {
    expect(COPY.followOnSkipped).toBe('Follow-on work skipped.');
    const invalid = harness();
    await swarm(invalid.app);
    scriptFollowOn(invalid.gw, { extra: [{ handle: 'ghost', paths: ['src/c.ts'] }] });
    await invalid.app.send('bad handle', 'work');
    expect(notices(invalid.msgs).filter((t) => t === COPY.followOnSkipped)).toHaveLength(1);

    const silent = harness();
    await swarm(silent.app, []);
    scriptFollowOn(silent.gw);
    await silent.app.send('silent zero', 'work');
    expect(notices(silent.msgs)).not.toContain(COPY.followOnSkipped);
    expect(notices(silent.msgs).some((t) => /Follow-on/.test(t))).toBe(false);
  });

  it('composer UNLOCKED during extra Work-batch; master Send does not start a second run', async () => {
    const { app, gw, msgs } = harness();
    await swarm(app);
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    let extraHeld = false;
    gw.afterStart = async (info) => {
      const last = info.messages[info.messages.length - 1]?.content ?? '';
      if (last.includes('Role: work') && last.includes('src/c.ts') && !extraHeld) {
        extraHeld = true;
        await latch;
      }
    };
    scriptFollowOn(gw);
    const first = app.send('extra composer', 'work');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().workBatch).toBe(true);
      expect(gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);
    });
    const count = gw.requestCount;
    await app.send('second master', 'work');
    expect(gw.requestCount).toBe(count);
    expect(msgs.some((m) => m.type === 'error' && m.message === COPY.workBatchRunning)).toBe(true);
    const specSolo = app.send('@specbot ping', 'work');
    await vi.waitFor(() => {
      expect(gw.turns.includes('direct')).toBe(true);
    });
    release();
    await specSolo;
    await first;
    expect(gw.turns.filter((t) => t === 'dispatch').length).toBe(2);
  });

  it('MCP Grain B is a separate click from Files Approve after extra batch', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    const { app, gw, fs } = harness(new McpGateway(port, () => undefined, { settleMs: 0 }));
    await swarm(app);
    scriptFollowOn(gw);
    await app.send('mcp separate extra', 'work');
    const before = port.invokeCalls.length;
    await app.approve();
    expect(port.invokeCalls.length).toBe(before);
    expect(fs.applyCalls).toBe(1);
  });
});

describe('FO out', () => {
  it('F8d / N Approves / looping extra / second Argue / spec-or-dispatcher extra workers do not run', async () => {
    const host = listSrcTs(join(root, 'src'))
      .map((file) => src(file))
      .join('\n');
    expect(host).not.toMatch(/stop-one|stopOne|compareToSpec|compare-to-spec/);
    expect(host).not.toMatch(/last-writer-wins|lastWriterWins|nApproves|N Approves/);
    expect(host).not.toMatch(/fillMissing|leftoverPaths|rewriteSplit/);
    const { app, gw, msgs } = harness();
    await swarm(app, ['devc', 'devd']);
    scriptFollowOn(gw, {
      extra: [{ handle: 'devc', paths: ['src/c.ts'] }],
    });
    await app.send('no loop', 'work');
    expect(gw.turns.filter((t) => t === 'dispatch')).toHaveLength(2);
    expect(gw.turns.filter((t) => t === 'argue')).toHaveLength(0);
    expect(extraWorkHandles(gw)).toEqual(['devc']);
    expect(extraWorkHandles(gw)).not.toContain('specbot');
    expect(extraWorkHandles(gw)).not.toContain('lead');
    expect(notices(msgs).filter((t) => t.startsWith('ARGUE · '))).toEqual([]);
  });

  it('idleWorkBots and blockedPaths helpers match the lock', () => {
    const freeze = [
      { id: 's', handle: 's', name: 's', persona: '', role: '', instructions: '', active: true, colorIndex: 0, createdAt: '', updatedAt: '', spec: true },
      { id: 'd', handle: 'd', name: 'd', persona: '', role: '', instructions: '', active: true, colorIndex: 0, createdAt: '', updatedAt: '', dispatcher: true },
      { id: 'w', handle: 'w', name: 'w', persona: '', role: '', instructions: '', active: true, colorIndex: 0, createdAt: '', updatedAt: '' },
      { id: 'idle', handle: 'idle', name: 'idle', persona: '', role: '', instructions: '', active: true, colorIndex: 0, createdAt: '', updatedAt: '' },
      { id: 'off', handle: 'off', name: 'off', persona: '', role: '', instructions: '', active: false, colorIndex: 0, createdAt: '', updatedAt: '' },
    ];
    expect(idleWorkBots(freeze, new Set(['w'])).map((b) => b.id)).toEqual(['idle']);
    const owners = ownerIdsForFiles(
      [{ path: 'src/a.ts', op: 'create', content: 'a' }],
      new Map([
        ['w', [{ path: 'src/a.ts', op: 'create', content: 'a' }]],
        ['idle', [{ path: 'src/drop.ts', op: 'create', content: 'x' }]],
      ]),
    );
    expect([...owners]).toEqual(['w']);
    const blocked = validateDispatcherSplit({
      assignments: [{ handle: 'idle', paths: ['src/a.ts'] }],
      remaining: [{ id: 'idle', handle: 'idle', active: true }],
      workspaceRoot: '/tmp/bot-rider-ws',
      blockedPaths: ['src/a.ts'],
    });
    expect(blocked.ok).toBe(false);
  });
});
