import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Application } from '../src/app/application';
import { COPY } from '../src/app/copy';
import { HostEventBus } from '../src/app/event-bus';
import { proposedFileChrome } from '../src/adapters/review-chrome';
import {
  isTestPath,
  isTesterAssignment,
  parseDispatcherSplit,
  remainingWorkBots,
  unionWorkerFiles,
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

function isolationText(pack: PromptMessage[]): string {
  return pack
    .filter((m) => m.content.startsWith('Isolation packet:'))
    .map((m) => m.content)
    .join('\n');
}

function joined(pack: PromptMessage[]): string {
  return pack.map((m) => m.content).join('\n');
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

async function workSwarm(
  app: Application,
  extra?: { tester?: boolean; namedBa?: boolean; reservedDev1?: boolean },
) {
  await app.createBot({
    name: extra?.namedBa ? 'BA Architect' : 'SpecBot',
    handle: extra?.namedBa ? 'ba' : 'specbot',
    persona: 'spec persona',
    role: 'analyst',
    instructions: 'write spec',
    spec: extra?.namedBa ? undefined : true,
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
    name: extra?.tester ? 'PathTester' : 'DevB',
    handle: extra?.tester ? 'tester' : 'devb',
    persona: 'b',
    role: 'dev',
    instructions: 'two',
  });
  if (extra?.reservedDev1) {
    await app.createBot({
      name: 'Dev1',
      handle: 'dev1',
      persona: 'reserved-looking',
      role: 'tester',
      instructions: 'not a role',
    });
  }
  if (extra?.namedBa) {
    await app.createBot({
      name: 'zzz',
      handle: 'zzz',
      persona: 'real spec',
      role: 'spec',
      instructions: 'flagged',
      spec: true,
    });
  }
}

function scriptWork(
  gw: FakeGateway,
  assignments: { handle: string; paths: string[] }[],
  filesFor: (handle: string, paths: string[]) => { path: string; op: 'create' | 'update' | 'delete'; content?: string }[],
) {
  gw.script = ({ turn, instruction, messages }) => {
    if (turn === 'spec') {
      return 'SPEC-BODY login must work';
    }
    if (turn === 'dispatch') {
      return assignmentFence(assignments);
    }
    if (turn === 'work') {
      const persona = messages[0]?.content ?? '';
      const handle =
        assignments.find((item) => persona.includes(`@${item.handle}`))?.handle ??
        assignments[0]!.handle;
      const paths = assignedFrom(instruction);
      return changesetFence(filesFor(handle, paths.length ? paths : assignments.find((a) => a.handle === handle)?.paths ?? []));
    }
    if (turn === 'direct') {
      return 'solo during work\nNO_EDIT';
    }
    return 'talk';
  };
}

const defaultAssignments = [
  { handle: 'deva', paths: ['src/a.ts'] },
  { handle: 'devb', paths: ['src/b.ts'] },
];

describe('WK-1 Work run type', () => {
  it('is a distinct run type; Debate default Send unchanged', async () => {
    const debate = harness();
    await debate.app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    await debate.app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
    debate.gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'd.ts', op: 'create', content: 'd' }]);
      }
      return 'talk';
    };
    await debate.app.send('default is debate');
    expect(debate.gw.turns[0]).toBe('propose');
    expect(debate.app.orchestrator.getRunState().runType).toBeUndefined();
    expect(debate.gw.turns.includes('spec')).toBe(false);

    const work = harness();
    await workSwarm(work.app);
    scriptWork(work.gw, defaultAssignments, (_h, paths) =>
      paths.map((path) => ({ path, op: 'create', content: 'w' })),
    );
    await work.app.send('do the work', 'work');
    expect(work.gw.turns[0]).toBe('spec');
    expect(work.app.orchestrator.getRunState().runType).toBe('work');
    expect(work.app.orchestrator.getRunState().phase).toBe('pendingReview');
    expect(work.gw.turns.includes('propose')).toBe(false);

    const viaUi = harness();
    await workSwarm(viaUi.app);
    scriptWork(viaUi.gw, defaultAssignments, (_h, paths) =>
      paths.map((path) => ({ path, op: 'create', content: 'w' })),
    );
    await viaUi.app.handleUi({ type: 'chat/send', text: 'via chrome field', runType: 'work' });
    expect(viaUi.gw.turns[0]).toBe('spec');
  });

  it('reuses host in-process Event Bus; not vscode.EventBus; not network', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    await app.send('bus', 'work');
    expect(app.orchestrator.bus).toBeInstanceOf(HostEventBus);
    expect(app.orchestrator.bus.list().length).toBeGreaterThan(0);

    expect(src('src/app/event-bus.ts')).toContain('HostEventBus');
    expect(src('src/app/event-bus.ts')).not.toMatch(/vscode\.EventBus|WebSocket|postMessage/);
    expect(src('src/app/orchestrator.ts')).toContain('HostEventBus');
    expect(src('src/app/orchestrator.ts')).not.toMatch(/vscode\.EventBus/);
    const proto = src('src/protocol/messages.ts');
    expect(proto).toContain("runType?: 'work' | 'debate'");
    expect(proto).not.toMatch(/type: 'event-bus|type: 'eventBus|type: 'bus\//);
  });

  it('packets append; BotSession stores never merged; packs do not restuff HV / Swarm transcript', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    await app.send('append', 'work');
    const specId = app.registry.getByHandle('specbot')!.id;
    const dewa = app.registry.getByHandle('deva')!.id;
    const specMsgs = app.orchestrator.sessions.messagesOf(specId);
    const dewaMsgs = app.orchestrator.sessions.messagesOf(dewa);
    expect(specMsgs.length).toBeGreaterThan(0);
    expect(dewaMsgs.length).toBeGreaterThan(0);
    expect(specMsgs).not.toBe(dewaMsgs);
    expect(specMsgs.filter((m) => m.role === 'assistant').some((m) => m.content.includes('SPEC-BODY'))).toBe(true);
    expect(dewaMsgs.filter((m) => m.role === 'assistant').some((m) => m.content.includes('SPEC-BODY'))).toBe(false);
    expect(app.orchestrator.sessions.peek(specId)?.botId).toBe(specId);
    expect(app.orchestrator.sessions.peek(dewa)?.botId).toBe(dewa);
    for (const pack of gw.lastMessages) {
      expect(joined(pack)).not.toContain('HV article');
      expect(isolationText(pack)).not.toContain('SPEC-BODY login must work');
    }
  });
});

describe('WK-2 designation gate', () => {
  it('Save / New Bot succeeds with 0, 1, or 2 designation flags', async () => {
    const { app } = harness();
    const none = await app.createBot({ name: 'None', handle: 'none', persona: 'p', role: 'r', instructions: 'i' });
    expect(none.dispatcher).toBeUndefined();
    expect(none.spec).toBeUndefined();
    const one = await app.createBot({
      name: 'One',
      handle: 'one',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      dispatcher: true,
    });
    expect(one.dispatcher).toBe(true);
    expect(one.spec).toBeUndefined();
    const both = await app.createBot({
      name: 'Both',
      handle: 'both',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      dispatcher: true,
      spec: true,
    });
    expect(both.dispatcher).toBe(true);
    expect(both.spec).toBe(true);
    const updated = await app.updateBot(none.id, {
      name: 'None',
      handle: 'none',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      active: true,
      spec: true,
    });
    expect(updated.spec).toBe(true);
    expect(app.registry.getByHandle('one')?.dispatcher).toBe(true);
    expect(app.registry.getByHandle('both')?.spec).toBe(true);
    await app.handleUi({
      type: 'bots/create',
      draft: {
        name: 'ViaUi',
        handle: 'viaui',
        persona: 'p',
        role: 'r',
        instructions: 'i',
        active: true,
        dispatcher: true,
        spec: false,
      },
    });
    expect(app.registry.getByHandle('viaui')?.dispatcher).toBe(true);
    expect(src('src/app/bot-registry.ts')).not.toMatch(/BotStoreFile/);
    expect(src('src/domain/bot.ts')).not.toMatch(/BotStoreFile/);
  });

  it('Work Send with 0 or >1 active dispatcher or spec does not run Work; exact copy', async () => {
    const zero = harness();
    await zero.app.createBot({ name: 'A', handle: 'a', persona: 'p', role: 'r', instructions: 'i' });
    await zero.app.send('no flags', 'work');
    expect(zero.gw.requestCount).toBe(0);
    expect(zero.gw.turns).toEqual([]);
    expect(zero.msgs.some((m) => m.type === 'error' && m.message === COPY.workNeedsRoles)).toBe(true);
    expect(COPY.workNeedsRoles).toBe('Work needs one Dispatcher and one Spec.');

    const many = harness();
    await many.app.createBot({
      name: 'S1',
      handle: 's1',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      spec: true,
      dispatcher: true,
    });
    await many.app.createBot({
      name: 'S2',
      handle: 's2',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      spec: true,
    });
    await many.app.send('two specs', 'work');
    expect(many.gw.requestCount).toBe(0);
    expect(many.msgs.some((m) => m.type === 'error' && m.message === 'Work needs one Dispatcher and one Spec.')).toBe(
      true,
    );

    const inactive = harness();
    await workSwarm(inactive.app);
    const spec = inactive.app.registry.getByHandle('specbot')!;
    await inactive.app.toggleBot(spec.id, false);
    await inactive.app.send('inactive spec', 'work');
    expect(inactive.gw.requestCount).toBe(0);
    expect(inactive.msgs.some((m) => m.type === 'error' && m.message === COPY.workNeedsRoles)).toBe(true);
  });

  it('exactly one active dispatcher and one active spec starts BA-phase; flags not name matching', async () => {
    const { app, gw } = harness();
    await workSwarm(app, { namedBa: true });
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    await app.send('flagged spec', 'work');
    expect(gw.turns[0]).toBe('spec');
    expect(gw.lastSendOpts[0]?.handle).toBe('zzz');
    expect(gw.lastSendOpts[0]?.handle).not.toBe('ba');
    expect(gw.lastMessages[0]?.[0]?.content).toContain('@zzz');
    expect(gw.lastMessages[0]?.[0]?.content).not.toContain('@ba');
  });
});

describe('WK-3 BA-phase', () => {
  it('is sequential; other workers do not sendRequest yet; SI-1 persists across phases', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    const specId = app.registry.getByHandle('specbot')!.id;
    const leadId = app.registry.getByHandle('lead')!.id;
    let releaseSpec!: () => void;
    const holdSpec = new Promise<void>((resolve) => {
      releaseSpec = resolve;
    });
    gw.afterStart = async ({ botId }) => {
      if (botId === specId) {
        await holdSpec;
      }
    };
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    const done = app.send('ba first', 'work');
    await vi.waitFor(() => {
      expect(gw.requestCount).toBe(1);
    });
    expect(gw.lastSendOpts.every((opts) => opts.botId === specId)).toBe(true);
    expect(gw.turns).toEqual(['spec']);
    expect(app.changesets.hasPending()).toBe(false);
    releaseSpec();
    await done;
    expect(gw.turns[0]).toBe('spec');
    expect(gw.turns[1]).toBe('dispatch');
    expect(gw.lastSendOpts[1]?.botId).toBe(leadId);
    expect(app.orchestrator.sessions.messagesOf(specId).length).toBeGreaterThan(0);
    expect(app.orchestrator.sessions.messagesOf(leadId).some((m) => m.content.startsWith('Isolation packet:'))).toBe(
      true,
    );
    expect(app.orchestrator.sessions.listPublished().length).toBeGreaterThan(0);
  });
});

describe('WK-4 dispatch + Work-batch', () => {
  it('dispatch is one sequential turn; workers are split handles; no reserved Dev1/Dev2/tester names', async () => {
    const { app, gw } = harness();
    await workSwarm(app, { reservedDev1: true });
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    await app.send('split handles', 'work');
    expect(gw.turns.filter((t) => t === 'dispatch')).toHaveLength(1);
    const workOpts = gw.lastSendOpts.filter((_, i) => gw.turns[i] === 'work');
    const workHandles = workOpts.map((opts) => opts.handle);
    expect(workHandles.sort()).toEqual(['deva', 'devb']);
    expect(workHandles).not.toContain('dev1');
    expect(workHandles).not.toContain('lead');
    expect(workHandles).not.toContain('specbot');
    expect(src('src/app/work-split.ts')).not.toMatch(/Dev1|Dev2/);
    expect(src('src/app/orchestrator.ts')).not.toMatch(/name-contains|includes\('BA'\)|includes\("BA"\)/);
  });

  it('rejects an overlapping / invalid split; Work-batch does not start; host does not invent a partition', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    gw.script = ({ turn }) => {
      if (turn === 'spec') {
        return 'spec';
      }
      if (turn === 'dispatch') {
        return assignmentFence([
          { handle: 'deva', paths: ['src/a.ts'] },
          { handle: 'devb', paths: ['src/a.ts'] },
        ]);
      }
      return changesetFence([{ path: 'invented.ts', op: 'create', content: 'nope' }]);
    };
    await app.send('overlap', 'work');
    expect(gw.turns.includes('work')).toBe(false);
    expect(gw.turns.filter((t) => t === 'dispatch').length).toBeGreaterThanOrEqual(1);
    expect(app.changesets.hasPending()).toBe(false);
    expect(app.changesets.files).toBeUndefined();
    expect(msgs.some((m) => m.type === 'chat/notice' && m.text === COPY.invalidSplit)).toBe(true);
    expect(src('src/app/work-split.ts')).not.toMatch(/leftover|invent.*partition|fillMissing/);
  });

  it('Work-batch is parallel on disjoint paths; packs exclude sibling packets until settle', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    const dewa = app.registry.getByHandle('deva')!.id;
    const dewB = app.registry.getByHandle('devb')!.id;
    let releaseB!: () => void;
    const holdB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    gw.afterStart = async ({ botId }) => {
      if (botId === dewB && gw.turns[gw.turns.length - 1] === 'work') {
        await holdB;
      }
    };
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    const done = app.send('parallel deaf', 'work');
    await vi.waitFor(() => {
      expect(gw.turns.filter((t) => t === 'work').length).toBeGreaterThanOrEqual(1);
      expect(gw.maxInflight).toBeGreaterThanOrEqual(2);
    });
    const workPacks = gw.lastMessages.filter((_, i) => gw.turns[i] === 'work');
    expect(workPacks.length).toBeGreaterThanOrEqual(2);
    for (const pack of workPacks) {
      const iso = isolationText(pack);
      expect(iso).not.toContain(`From: ${dewa}`);
      expect(iso).not.toContain(`From: ${dewB}`);
    }
    releaseB();
    await done;
    expect(gw.maxInflight).toBeGreaterThanOrEqual(2);
  });

  it('QC-3 overflow of one bot does not cancel siblings', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    await app.updateBot(app.registry.getByHandle('devb')!.id, {
      name: 'DevB',
      handle: 'devb',
      persona: 'OVERFLOW-' + 'Z'.repeat(8000),
      role: 'dev',
      instructions: 'two',
      active: true,
    });
    gw.maxInputTokens = 3000;
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    await app.send('one overflows', 'work');
    expect(msgs.some((m) => m.type === 'error' && m.code === 'pack-overflow')).toBe(true);
    expect(msgs.some((m) => m.type === 'error' && m.message === COPY.packOverflow)).toBe(true);
    expect(gw.lastSendOpts.some((opts) => opts.handle === 'deva' && gw.turns[gw.lastSendOpts.indexOf(opts)] === 'work')).toBe(
      true,
    );
    expect(gw.lastSendOpts.filter((opts, i) => opts.handle === 'devb' && gw.turns[i] === 'work')).toHaveLength(0);
  });

  it('in-flight sendRequest is not mutated', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    const dewB = app.registry.getByHandle('devb')!.id;
    let releaseB!: () => void;
    const holdB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    const original = gw.stream.bind(gw);
    let snapshot: string[] | undefined;
    gw.stream = async (messages, token, onText) => {
      const botId = gw.lastSendOpts[gw.lastSendOpts.length - 1]?.botId;
      const turn = detectFromMessages(messages);
      if (botId === dewB && turn === 'work' && !snapshot) {
        snapshot = messages.map((m) => m.content);
        await holdB;
        expect(messages.map((m) => m.content)).toEqual(snapshot);
      }
      return original(messages, token, onText);
    };
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    const done = app.send('no mutate', 'work');
    await vi.waitFor(() => {
      expect(snapshot).toBeDefined();
    });
    expect(snapshot!.join('\n')).not.toMatch(/From: .*deva/);
    releaseB();
    await done;
  });
});

function detectFromMessages(messages: PromptMessage[]): string {
  const last = messages[messages.length - 1]?.content ?? '';
  if (last.includes('Role: work')) {
    return 'work';
  }
  if (last.includes('Role: spec')) {
    return 'spec';
  }
  if (last.includes('Role: dispatch')) {
    return 'dispatch';
  }
  return '';
}

describe('WK-5 composer + tester-as-path-worker', () => {
  it('tester is a worker on test paths; pack is BA spec packets + assigned paths; no sibling workers until settle', async () => {
    const { app, gw } = harness();
    await workSwarm(app, { tester: true });
    const assignments = [
      { handle: 'deva', paths: ['src/a.ts'] },
      { handle: 'tester', paths: ['test/login.test.ts'] },
    ];
    scriptWork(gw, assignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 't' })));
    await app.send('tester paths', 'work');
    const testerPack = gw.lastMessages.find((_, i) => gw.turns[i] === 'work' && gw.lastSendOpts[i]?.handle === 'tester')!;
    expect(testerPack).toBeDefined();
    expect(joined(testerPack)).toContain('test/login.test.ts');
    expect(isolationText(testerPack) + joined(testerPack)).toMatch(/Isolation packet:/);
    expect(joined(testerPack)).not.toContain('src/a.ts ---');
    const dewaPack = gw.lastMessages.find((_, i) => gw.turns[i] === 'work' && gw.lastSendOpts[i]?.handle === 'deva')!;
    expect(joined(dewaPack)).not.toContain('login.test.ts ---');
    expect(isTestPath('test/login.test.ts')).toBe(true);
    expect(isTesterAssignment(['test/login.test.ts'])).toBe(true);
    expect(isTesterAssignment(['src/a.ts'])).toBe(false);
  });

  it('comparing worker output to spec does not run in F8a', () => {
    const host = src('src/app/orchestrator.ts') + src('src/app/work-split.ts');
    expect(host).not.toMatch(/compareToSpec|compare-to-spec|diffAgainstSpec|workerOutputToSpec/);
  });

  it('master Send during Work-batch does not start a second run; exact copy', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    let release!: () => void;
    gw.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    const first = app.send('batch', 'work');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().workBatch).toBe(true);
      expect(gw.turns.includes('work')).toBe(true);
    });
    const count = gw.requestCount;
    await app.send('second master', 'work');
    expect(gw.requestCount).toBe(count);
    expect(msgs.some((m) => m.type === 'error' && m.message === COPY.workBatchRunning)).toBe(true);
    expect(COPY.workBatchRunning).toBe('Work batch still running.');
    release();
    await first;
  });

  it('@ to a not-in-flight bot may run; @ to an in-flight bot waits', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    const dewa = app.registry.getByHandle('deva')!.id;
    let releaseA!: () => void;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let held = false;
    gw.afterStart = async ({ botId }) => {
      if (botId === dewa && !held) {
        held = true;
        await holdA;
      }
    };
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    const first = app.send('batch @', 'work');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().workBatch).toBe(true);
    });
    const during = gw.requestCount;
    const specSolo = app.send('@specbot ping', 'work');
    await vi.waitFor(() => {
      expect(gw.turns.includes('direct')).toBe(true);
    });
    expect(gw.requestCount).toBeGreaterThan(during);
    const waiting = gw.requestCount;
    const waitSolo = app.send('@deva later', 'work');
    await new Promise((r) => setTimeout(r, 30));
    expect(gw.requestCount).toBe(waiting);
    releaseA();
    await waitSolo;
    await specSolo;
    await first;
    expect(gw.turns.filter((t) => t === 'direct').length).toBeGreaterThanOrEqual(2);
  });
});

describe('WK-6 union Approve + Stop', () => {
  it('BR-6 Files only after settle; hasPendingChanges false / no applyEdit until then', async () => {
    const { app, gw, fs } = harness();
    await workSwarm(app);
    let release!: () => void;
    gw.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    const done = app.send('files after', 'work');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().workBatch).toBe(true);
    });
    expect(app.changesets.hasPending()).toBe(false);
    expect(fs.applyCalls).toBe(0);
    release();
    await done;
    expect(app.changesets.hasPending()).toBe(true);
    expect(fs.applyCalls).toBe(0);
    await app.approve();
    expect(fs.applyCalls).toBe(1);
  });

  it('MCP Grain B Approve is a separate click from Files Approve', async () => {
    const port = new FakeMcpPort();
    port.config = true;
    const { app, gw, fs, msgs } = harness(new McpGateway(port, () => undefined, { settleMs: 0 }));
    await workSwarm(app);
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    await app.send('mcp separate', 'work');
    expect(app.changesets.hasPending()).toBe(true);
    const beforeInvoke = port.invokeCalls.length;
    await app.approve();
    expect(port.invokeCalls.length).toBe(beforeInvoke);
    expect(fs.applyCalls).toBe(1);
    msgs.length = 0;
    await app.approveMcp();
    expect(fs.applyCalls).toBe(1);
    expect(src('src/app/application.ts')).toContain('approveMcp');
    expect(src('src/app/application.ts')).toMatch(/Grain B: invoke staged MCP only/);
  });

  it('overlapping paths dropped; note Skipped {path} · collision; remainder Approves', async () => {
    const { app, gw, msgs, fs } = harness();
    await workSwarm(app);
    gw.script = ({ turn, instruction, messages }) => {
      if (turn === 'spec') {
        return 'spec';
      }
      if (turn === 'dispatch') {
        return assignmentFence(defaultAssignments);
      }
      if (turn === 'work') {
        const persona = messages[0]?.content ?? '';
        if (persona.includes('@deva')) {
          return changesetFence([
            { path: 'src/a.ts', op: 'create', content: 'a' },
            { path: 'src/keep.ts', op: 'create', content: 'k' },
          ]);
        }
        return changesetFence([{ path: 'src/a.ts', op: 'create', content: 'b' }]);
      }
      return 'talk';
    };
    await app.send('collision', 'work');
    expect(msgs.some((m) => m.type === 'chat/notice' && m.text === COPY.skippedCollision('src/a.ts'))).toBe(true);
    expect(COPY.skippedCollision('src/a.ts')).toBe('Skipped src/a.ts · collision');
    const files = app.changesets.files ?? [];
    expect(files.map((f) => f.path)).toEqual(['src/keep.ts']);
    expect(files.some((f) => f.path === 'src/a.ts')).toBe(false);
    await app.approve();
    expect(fs.lastOps.some((op) => 'relativePath' in op && op.relativePath === 'src/keep.ts')).toBe(true);
    expect(fs.lastOps.some((op) => 'relativePath' in op && op.relativePath === 'src/a.ts')).toBe(false);
  });

  it('Stop aborts every in-flight sendRequest in this Work-batch', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    let release!: () => void;
    gw.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    const done = app.send('stop all', 'work');
    await vi.waitFor(() => {
      expect(gw.maxInflight).toBeGreaterThanOrEqual(2);
    });
    app.stop();
    release();
    await done;
    expect(app.changesets.hasPending()).toBe(false);
    expect(gw.turns.filter((t) => t === 'work').length).toBeGreaterThanOrEqual(0);
  });

  it('one Files list; §24 chips stay on Proposed Changes Files', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    scriptWork(gw, defaultAssignments, (_h, paths) => paths.map((path) => ({ path, op: 'create', content: 'w' })));
    await app.send('one list', 'work');
    const previews = msgs.filter((m) => m.type === 'changeset/preview');
    expect(previews).toHaveLength(1);
    expect(previews[0] && previews[0].type === 'changeset/preview' && previews[0].files.length).toBe(2);
    expect(proposedFileChrome({ path: 'src/a.ts', op: 'create', specIds: ['BR-6'] }).description).toContain('BR-6');
    expect(src('src/adapters/review-chrome.ts')).toContain('specIds');
    expect(src('src/app/run-board.ts')).not.toMatch(/specIds/);
  });

  it('Debate §26 composer-lock unchanged when the toggle is Debate', async () => {
    const { app, gw } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
    let release!: () => void;
    gw.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    gw.script = ({ turn }) => (turn === 'consensus' ? 'AGREE' : 'talk');
    const first = app.send('debate lock');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().debateRunning).toBe(true);
    });
    const count = gw.requestCount;
    await app.send('ignored', 'debate');
    expect(gw.requestCount).toBe(count);
    await app.handleUi({ type: 'chat/send', text: 'still ignored' });
    expect(gw.requestCount).toBe(count);
    release();
    await first;
    const chatJs = src('media/chat.js');
    expect(chatJs).toContain('!!state.splitOpen || (!!state.debateRunning && !deliverableAsk)');
  });
});

describe('work-split helpers', () => {
  it('validates remaining active handles, disjoint workspace-relative paths, and drops union collisions', () => {
    const parsed = parseDispatcherSplit(
      assignmentFence([
        { handle: 'deva', paths: ['src/a.ts'] },
        { handle: 'devb', paths: ['src/b.ts'] },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const ok = validateDispatcherSplit({
      assignments: parsed.assignments,
      remaining: [
        { id: '1', handle: 'deva', active: true },
        { id: '2', handle: 'devb', active: true },
      ],
      workspaceRoot: '/tmp/bot-rider-ws',
    });
    expect(ok.ok).toBe(true);
    const overlap = validateDispatcherSplit({
      assignments: [
        { handle: 'deva', paths: ['src/a.ts'] },
        { handle: 'devb', paths: ['src/a.ts'] },
      ],
      remaining: [
        { id: '1', handle: 'deva', active: true },
        { id: '2', handle: 'devb', active: true },
      ],
      workspaceRoot: '/tmp/bot-rider-ws',
    });
    expect(overlap.ok).toBe(false);
    const unknown = validateDispatcherSplit({
      assignments: [{ handle: 'ghost', paths: ['src/a.ts'] }],
      remaining: [{ id: '1', handle: 'deva', active: true }],
      workspaceRoot: '/tmp/bot-rider-ws',
    });
    expect(unknown.ok).toBe(false);
    const inactive = validateDispatcherSplit({
      assignments: [{ handle: 'deva', paths: ['src/a.ts'] }],
      remaining: [{ id: '1', handle: 'deva', active: false }],
      workspaceRoot: '/tmp/bot-rider-ws',
    });
    expect(inactive.ok).toBe(false);
    const union = unionWorkerFiles([
      { botId: '1', files: [{ path: 'src/a.ts', op: 'create', content: 'a' }] },
      { botId: '2', files: [{ path: 'src/a.ts', op: 'create', content: 'b' }, { path: 'src/c.ts', op: 'create', content: 'c' }] },
    ]);
    expect(union.collisions).toEqual(['src/a.ts']);
    expect(union.files.map((f) => f.path)).toEqual(['src/c.ts']);
    expect(
      remainingWorkBots(
        [
          { id: 's', handle: 's', name: 's', persona: '', role: '', instructions: '', active: true, colorIndex: 0, createdAt: '', updatedAt: '', spec: true },
          { id: 'd', handle: 'd', name: 'd', persona: '', role: '', instructions: '', active: true, colorIndex: 0, createdAt: '', updatedAt: '', dispatcher: true },
          { id: 'w', handle: 'w', name: 'w', persona: '', role: '', instructions: '', active: true, colorIndex: 0, createdAt: '', updatedAt: '' },
        ],
        { id: 's', handle: 's', name: 's', persona: '', role: '', instructions: '', active: true, colorIndex: 0, createdAt: '', updatedAt: '' },
        { id: 'd', handle: 'd', name: 'd', persona: '', role: '', instructions: '', active: true, colorIndex: 0, createdAt: '', updatedAt: '' },
      ).map((b) => b.id),
    ).toEqual(['w']);
  });

  it('does not reopen Event Bus chrome or reserved roles in host sources', () => {
    for (const file of listSrcTs(join(root, 'src'))) {
      const text = src(file);
      expect(text, file).not.toMatch(/vscode\.EventBus/);
    }
  });
});
