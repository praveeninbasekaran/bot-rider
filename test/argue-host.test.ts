import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Application } from '../src/app/application';
import { COPY } from '../src/app/copy';
import { parseAgreeWriter } from '../src/app/mentions';
import { workPathClaims } from '../src/app/work-split';
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

async function workSwarm(app: Application) {
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
}

function scriptCollision(
  gw: FakeGateway,
  opts: {
    argue?: (handle: string, instruction: string) => string;
    extraCollision?: boolean;
  } = {},
) {
  gw.script = ({ turn, instruction, messages }) => {
    if (turn === 'spec') {
      return 'SPEC-BODY login must work';
    }
    if (turn === 'dispatch') {
      return assignmentFence([
        { handle: 'deva', paths: ['src/a.ts'] },
        { handle: 'devb', paths: ['src/z.ts'] },
      ]);
    }
    if (turn === 'work') {
      const persona = messages[0]?.content ?? '';
      if (persona.includes('@deva')) {
        const files = [
          { path: 'src/a.ts', op: 'create' as const, content: 'from-deva-a' },
          { path: 'src/keep.ts', op: 'create' as const, content: 'keep' },
        ];
        if (opts.extraCollision) {
          files.push({ path: 'src/z.ts', op: 'create', content: 'from-deva-z' });
        }
        return changesetFence(files);
      }
      const files = [{ path: 'src/a.ts', op: 'create' as const, content: 'from-devb-a' }];
      if (opts.extraCollision) {
        files.push({ path: 'src/z.ts', op: 'create', content: 'from-devb-z' });
      }
      return changesetFence(files);
    }
    if (turn === 'argue') {
      const persona = messages[0]?.content ?? '';
      const handle = persona.includes('@deva') ? 'deva' : persona.includes('@devb') ? 'devb' : 'unknown';
      return opts.argue ? opts.argue(handle, instruction) : 'DISSENT';
    }
    if (turn === 'direct') {
      return 'solo during argue\nNO_EDIT';
    }
    return 'talk';
  };
}

function holdFirstArgue(gw: FakeGateway, latch: Promise<void>): void {
  let held = false;
  gw.afterStart = async (info) => {
    const last = info.messages[info.messages.length - 1]?.content ?? '';
    if (last.includes('Role: argue') && !held) {
      held = true;
      await latch;
    }
  };
}

describe('AG-1 collision trigger + one path at a time + hold Approve', () => {
  it('collision after Work-batch settle starts Argue on path-string-sorted paths, one at a time', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    scriptCollision(gw, { extraCollision: true, argue: () => 'DISSENT' });
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    holdFirstArgue(gw, latch);
    const done = app.send('two collisions', 'work');
    await vi.waitFor(() => {
      expect(gw.turns.filter((t) => t === 'argue').length).toBe(1);
    });
    expect(app.orchestrator.getRunState().argue).toBe(true);
    expect(app.orchestrator.getRunState().arguePath).toBe('src/a.ts');
    expect(notices(msgs).some((t) => t === COPY.argueHeader('src/a.ts'))).toBe(true);
    expect(notices(msgs).some((t) => t === COPY.argueHeader('src/z.ts'))).toBe(false);
    expect(gw.turns.filter((t) => t === 'argue').length).toBe(1);
    const count = gw.requestCount;
    await new Promise((r) => setTimeout(r, 30));
    expect(gw.requestCount).toBe(count);
    release();
    await vi.waitFor(() => {
      expect(notices(msgs).some((t) => t === COPY.argueHeader('src/z.ts'))).toBe(true);
    });
    await done;
    const headers = notices(msgs).filter((t) => t.startsWith('ARGUE · '));
    expect(headers[0]).toBe('ARGUE · src/a.ts');
    expect(headers[1]).toBe('ARGUE · src/z.ts');
    expect(headers).toEqual(['ARGUE · src/a.ts', 'ARGUE · src/z.ts']);
  });

  it('claimants are only Work-batch workers who touched that path; dispatcher/spec only if assigned', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    scriptCollision(gw, { argue: () => 'DISSENT' });
    await app.send('claimants', 'work');
    const argueOpts = gw.lastSendOpts.filter((_, i) => gw.turns[i] === 'argue');
    const handles = argueOpts.map((opts) => opts.handle);
    expect(handles.every((h) => h === 'deva' || h === 'devb')).toBe(true);
    expect(handles).not.toContain('lead');
    expect(handles).not.toContain('specbot');
    const host = src('src/app/orchestrator.ts');
    expect(host).toContain('assignedPath');
    expect(host).toMatch(/bot\.dispatcher \|\| bot\.spec/);
    const claims = workPathClaims([
      { botId: 'deva', files: [{ path: 'src/a.ts', op: 'create', content: 'a' }, { path: 'src/keep.ts', op: 'create', content: 'k' }] },
      { botId: 'devb', files: [{ path: 'src/a.ts', op: 'create', content: 'b' }] },
      { botId: 'lead', files: [] },
    ]);
    expect(claims.collisions.map((c) => c.path)).toEqual(['src/a.ts']);
    expect(claims.collisions[0]?.claimants.map((c) => c.botId).sort()).toEqual(['deva', 'devb']);
    expect(claims.remainder.map((f) => f.path)).toEqual(['src/keep.ts']);
  });

  it('Approve held until all collision paths winner or dropped; remainder never discarded; one Files Approve', async () => {
    const { app, gw, fs, msgs } = harness();
    await workSwarm(app);
    scriptCollision(gw, { argue: () => 'DISSENT' });
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    holdFirstArgue(gw, latch);
    const done = app.send('hold approve', 'work');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().argue).toBe(true);
    });
    expect(app.changesets.hasPending()).toBe(false);
    expect((app.changesets.files ?? []).map((f) => f.path)).toEqual(['src/keep.ts']);
    const preview = [...msgs].reverse().find((m) => m.type === 'changeset/preview');
    expect(preview && preview.type === 'changeset/preview' && preview.files.map((f) => f.path)).toEqual(['src/keep.ts']);
    expect(await app.approve()).toBe(false);
    expect(fs.applyCalls).toBe(0);
    release();
    await done;
    expect(app.changesets.hasPending()).toBe(true);
    expect((app.changesets.files ?? []).map((f) => f.path)).toEqual(['src/keep.ts']);
    await app.approve();
    expect(fs.applyCalls).toBe(1);
    expect(fs.lastOps).toHaveLength(1);
    expect(fs.lastOps[0] && 'relativePath' in fs.lastOps[0] && fs.lastOps[0].relativePath).toBe('src/keep.ts');
  });

  it('remainder still in Proposed Changes (visible, not discarded) while Argue runs and after drop', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    scriptCollision(gw, { argue: () => 'DISSENT' });
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    holdFirstArgue(gw, latch);
    const done = app.send('remainder visible', 'work');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().argue).toBe(true);
    });
    expect((app.changesets.files ?? []).some((f) => f.path === 'src/keep.ts')).toBe(true);
    expect((app.changesets.files ?? []).some((f) => f.path === 'src/a.ts')).toBe(false);
    release();
    await done;
    expect((app.changesets.files ?? []).map((f) => f.path)).toEqual(['src/keep.ts']);
    expect(notices(msgs)).toContain(COPY.skippedCollision('src/a.ts'));
    expect((app.changesets.files ?? []).some((f) => f.path === 'src/a.ts')).toBe(false);
  });

  it('no-collision path still Approves as F8a (no Argue)', async () => {
    const { app, gw, msgs, fs } = harness();
    await workSwarm(app);
    gw.script = ({ turn, instruction, messages }) => {
      if (turn === 'spec') {
        return 'spec';
      }
      if (turn === 'dispatch') {
        return assignmentFence([
          { handle: 'deva', paths: ['src/a.ts'] },
          { handle: 'devb', paths: ['src/b.ts'] },
        ]);
      }
      if (turn === 'work') {
        const persona = messages[0]?.content ?? '';
        const path = persona.includes('@deva') ? 'src/a.ts' : 'src/b.ts';
        return changesetFence([{ path, op: 'create', content: 'w' }]);
      }
      return instruction.includes('Role: argue') ? 'should-not-run' : 'talk';
    };
    await app.send('no collision', 'work');
    expect(gw.turns.includes('argue')).toBe(false);
    expect(notices(msgs).some((t) => t.startsWith('ARGUE · '))).toBe(false);
    expect(app.orchestrator.getRunState().argue).toBeFalsy();
    expect(app.changesets.hasPending()).toBe(true);
    expect((app.changesets.files ?? []).map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    await app.approve();
    expect(fs.applyCalls).toBe(1);
  });
});

describe('AG-2 sequential ping-pong', () => {
  it('sequential ping-pong sendRequest; next speaker waits, ingests APPEND into SI-1, then replies', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    const dewa = app.registry.getByHandle('deva')!.id;
    const dewB = app.registry.getByHandle('devb')!.id;
    scriptCollision(gw, { argue: () => 'DISSENT' });
    const arguePacks: PromptMessage[][] = [];
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    gw.afterStart = async (info) => {
      const last = info.messages[info.messages.length - 1]?.content ?? '';
      if (!last.includes('Role: argue')) {
        return;
      }
      arguePacks.push(info.messages);
      if (arguePacks.length === 2) {
        await latch;
      }
    };
    const done = app.send('ping pong', 'work');
    await vi.waitFor(() => {
      expect(arguePacks.length).toBe(2);
    });
    expect(gw.turns.filter((t) => t === 'argue').length).toBe(2);
    const dewaFrom = (pack: PromptMessage[]) =>
      pack.filter((m) => m.content.startsWith('Isolation packet:') && m.content.includes(`From: ${dewa}`)).length;
    expect(dewaFrom(arguePacks[1]!)).toBeGreaterThan(dewaFrom(arguePacks[0]!));
    expect(app.orchestrator.sessions.messagesOf(dewB).some((m) => m.content.includes(`From: ${dewa}`))).toBe(true);
    expect(app.orchestrator.sessions.peek(dewB)?.botId).toBe(dewB);
    release();
    await done;
    const dewaMsgs = app.orchestrator.sessions.messagesOf(dewa);
    const dewBMsgs = app.orchestrator.sessions.messagesOf(dewB);
    expect(dewaMsgs).not.toBe(dewBMsgs);
    expect(dewaMsgs.filter((m) => m.role === 'assistant').length).toBeGreaterThan(0);
    expect(dewBMsgs.filter((m) => m.content.startsWith('Isolation packet:')).length).toBeGreaterThan(0);
  });

  it('start order / first speaker is handle sort (localeCompare)', async () => {
    const { app, gw } = harness();
    await workSwarm(app);
    scriptCollision(gw, { argue: () => 'DISSENT' });
    await app.send('handle sort', 'work');
    const argueHandles = gw.lastSendOpts.filter((_, i) => gw.turns[i] === 'argue').map((opts) => opts.handle);
    expect(argueHandles[0]).toBe('deva');
    expect(argueHandles[1]).toBe('devb');
    expect('deva'.localeCompare('devb') < 0).toBe(true);
    const instruction = gw.lastMessages.find((_, i) => gw.turns[i] === 'argue')?.at(-1)?.content ?? '';
    expect(instruction).toContain('Argue round 1');
    expect(instruction).not.toMatch(/ROUND\s+\d+\s*·\s*CRITIQUE/);
    expect(instruction).not.toContain('Role: critique');
  });
});

describe('AG-3 winner / drop / Stop', () => {
  it('two rounds then drop if no SI-2 AGREE on one writer handle; skip note kept', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    const rounds: number[] = [];
    scriptCollision(gw, {
      argue: (_handle, instruction) => {
        const round = Number((instruction.match(/Argue round (\d+)/) || [])[1] || 0);
        rounds.push(round);
        return 'DISSENT not a win';
      },
    });
    await app.send('two rounds drop', 'work');
    expect(rounds.filter((n) => n === 1).length).toBe(2);
    expect(rounds.filter((n) => n === 2).length).toBe(2);
    expect(rounds.some((n) => n === 3)).toBe(false);
    expect(gw.turns.filter((t) => t === 'argue')).toHaveLength(4);
    expect(notices(msgs)).toContain(COPY.skippedCollision('src/a.ts'));
    expect((app.changesets.files ?? []).map((f) => f.path)).toEqual(['src/keep.ts']);
    expect((app.changesets.files ?? []).some((f) => f.path === 'src/a.ts')).toBe(false);
  });

  it('winner AGREE on one claimant handle; that file joins the same union; no reserved-role tie-break', async () => {
    const { app, gw, msgs, fs } = harness();
    await workSwarm(app);
    scriptCollision(gw, {
      argue: () => 'AGREE @deva',
    });
    await app.send('agree winner', 'work');
    expect(notices(msgs)).not.toContain(COPY.skippedCollision('src/a.ts'));
    expect(notices(msgs).some((t) => t === COPY.pickTitle || t === COPY.splitNoConsensus)).toBe(false);
    const files = app.changesets.files ?? [];
    expect(files.map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/keep.ts']);
    expect(files.find((f) => f.path === 'src/a.ts')?.content).toBe('from-deva-a');
    expect(files.find((f) => f.path === 'src/a.ts')?.content).not.toBe('from-devb-a');
    const packets = app.orchestrator.sessions.listPublished();
    expect(packets.some((p) => p.decisions.some((d) => d === 'AGREE @deva'))).toBe(true);
    await app.approve();
    expect(fs.applyCalls).toBe(1);
    const applied = fs.lastOps.filter((op) => 'relativePath' in op).map((op) => op.relativePath);
    expect(applied.sort()).toEqual(['src/a.ts', 'src/keep.ts']);
    expect(src('src/app/orchestrator.ts')).not.toMatch(/reserved-role|tie-break|tieBreak|auto-pick|autoPick|last-settled|lastSettled/);
  });

  it('No Pick / no enterSplit / no host auto-pick / no dispatcher-named winner', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    scriptCollision(gw, { argue: () => 'DISSENT' });
    await app.send('no pick', 'work');
    expect(msgs.some((m) => m.type === 'chat/split')).toBe(false);
    expect(app.orchestrator.getRunState().splitOpen).toBe(false);
    expect(app.orchestrator.getRunState().phase).not.toBe('split');
    const before = gw.requestCount;
    await app.continueDebate();
    await app.pick(app.registry.getByHandle('lead')!.id);
    expect(gw.requestCount).toBe(before);
    expect(gw.turns.includes('implement')).toBe(false);
    expect(src('src/app/orchestrator.ts')).not.toMatch(/botrider\.split\.pick|dispatcherNamedWinner|hostAutoPick/);
  });

  it('Stop during Argue: no winner, skip notes kept, remainder Approves, no enterSplit', async () => {
    const { app, gw, msgs, fs } = harness();
    await workSwarm(app);
    scriptCollision(gw, { extraCollision: true, argue: () => 'AGREE @deva' });
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    holdFirstArgue(gw, latch);
    const done = app.send('stop argue', 'work');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().argue).toBe(true);
    });
    app.stop();
    expect(msgs.some((m) => m.type === 'chat/split')).toBe(false);
    release();
    await done;
    expect(app.orchestrator.getRunState().splitOpen).toBe(false);
    expect(app.orchestrator.getRunState().phase).not.toBe('split');
    expect(notices(msgs)).toContain(COPY.skippedCollision('src/a.ts'));
    expect(notices(msgs)).toContain(COPY.skippedCollision('src/z.ts'));
    expect((app.changesets.files ?? []).map((f) => f.path)).toEqual(['src/keep.ts']);
    expect((app.changesets.files ?? []).some((f) => f.path === 'src/a.ts')).toBe(false);
    await app.approve();
    expect(fs.applyCalls).toBe(1);
    expect(gw.turns.includes('implement')).toBe(false);
    const after = gw.requestCount;
    await app.continueDebate();
    await app.pick(app.registry.getByHandle('lead')!.id);
    expect(gw.requestCount).toBe(after);
  });

  it('Work Stop still does not enterSplit', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    scriptCollision(gw, { argue: () => 'DISSENT' });
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    gw.afterStart = async (info) => {
      const last = info.messages[info.messages.length - 1]?.content ?? '';
      if (last.includes('Role: spec')) {
        await latch;
      }
    };
    const done = app.send('stop ba still', 'work');
    await vi.waitFor(() => {
      expect(gw.requestCount).toBe(1);
    });
    app.stop();
    release();
    await done;
    expect(app.orchestrator.getRunState().splitOpen).toBe(false);
    expect(msgs.some((m) => m.type === 'chat/split')).toBe(false);
    expect(gw.turns.includes('argue')).toBe(false);
    expect(app.changesets.hasPending()).toBe(false);
  });
});

describe('AG-4 union + composer + §28 header', () => {
  it('Composer @/Stop; @ stays sole respondent; master Send does not start a second run', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    const dewa = app.registry.getByHandle('deva')!.id;
    scriptCollision(gw, { argue: () => 'DISSENT' });
    let release!: () => void;
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    holdFirstArgue(gw, latch);
    const first = app.send('argue composer', 'work');
    await vi.waitFor(() => {
      expect(app.orchestrator.getRunState().argue).toBe(true);
    });
    const count = gw.requestCount;
    await app.send('second master', 'work');
    expect(gw.requestCount).toBe(count);
    expect(msgs.some((m) => m.type === 'error' && m.message === COPY.workBatchRunning)).toBe(true);
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
    release();
    await waitSolo;
    await specSolo;
    await first;
    expect(gw.turns.filter((t) => t === 'direct').length).toBeGreaterThanOrEqual(2);
    expect(gw.lastSendOpts.filter((_, i) => gw.turns[i] === 'direct').some((opts) => opts.botId === dewa)).toBe(true);
    expect(gw.turns.filter((t) => t === 'dispatch').length).toBe(1);
  });

  it('Header ARGUE · {path}; round headers Argue round 1 / 2, not ROUND n · CRITIQUE', async () => {
    const { app, gw, msgs } = harness();
    await workSwarm(app);
    scriptCollision(gw, { argue: () => 'DISSENT' });
    await app.send('headers', 'work');
    expect(COPY.argueHeader('src/a.ts')).toBe('ARGUE · src/a.ts');
    expect(COPY.argueRound(1)).toBe('Argue round 1');
    expect(COPY.argueRound(2)).toBe('Argue round 2');
    expect(notices(msgs)).toContain('ARGUE · src/a.ts');
    expect(notices(msgs)).toContain('Argue round 1');
    expect(notices(msgs)).toContain('Argue round 2');
    expect(notices(msgs).some((t) => /ROUND\s+\d+\s*·\s*CRITIQUE/.test(t))).toBe(false);
    expect(app.orchestrator.getRunState().argue).toBeFalsy();
    const argueInstructions = gw.lastMessages.filter((_, i) => gw.turns[i] === 'argue').map((pack) => pack.at(-1)?.content ?? '');
    for (const text of argueInstructions) {
      expect(text).not.toMatch(/ROUND\s+\d+\s*·\s*CRITIQUE/);
      expect(text).toMatch(/Argue round [12]/);
    }
    const proto = src('src/domain/run-state.ts');
    expect(proto).toContain('arguePath');
    expect(proto).toContain('argueRound');
  });

  it('F8c/F8d/N Approves/Pick/last-writer-wins without Argue/reserved-role tie-break do not run', async () => {
    const host = listSrcTs(join(root, 'src'))
      .map((file) => src(file))
      .join('\n');
    expect(host).not.toMatch(/f8c|F8c idle|idle follow-on|stop-one|stopOne|compareToSpec|compare-to-spec/);
    expect(host).not.toMatch(/last-writer-wins|lastWriterWins|nApproves|N Approves/);
    expect(host).not.toMatch(/reserved-role tie-break|reservedRoleTieBreak|host auto-pick|hostAutoPick/);
    expect(host).not.toMatch(/botrider\.split\.pick/);
    const { app, gw, fs } = harness();
    await workSwarm(app);
    scriptCollision(gw, { argue: () => 'DISSENT' });
    await app.send('no last writer', 'work');
    expect((app.changesets.files ?? []).some((f) => f.path === 'src/a.ts')).toBe(false);
    await app.approve();
    expect(fs.applyCalls).toBe(1);
    const port = new FakeMcpPort();
    port.config = true;
    const mcp = harness(new McpGateway(port, () => undefined, { settleMs: 0 }));
    await workSwarm(mcp.app);
    scriptCollision(mcp.gw, { argue: () => 'AGREE @deva' });
    await mcp.app.send('mcp grain b', 'work');
    const before = port.invokeCalls.length;
    await mcp.app.approve();
    expect(port.invokeCalls.length).toBe(before);
    expect(mcp.fs.applyCalls).toBe(1);
  });
});

describe('parseAgreeWriter', () => {
  it('reads a single claimant handle from AGREE and rejects DISSENT / multi / non-claimants', () => {
    expect(parseAgreeWriter('AGREE @deva', ['deva', 'devb'])).toBe('deva');
    expect(parseAgreeWriter('agree @DevB because yield', ['deva', 'devb'])).toBe('devb');
    expect(parseAgreeWriter('AGREE deva', ['deva', 'devb'])).toBe('deva');
    expect(parseAgreeWriter('DISSENT @deva', ['deva', 'devb'])).toBeUndefined();
    expect(parseAgreeWriter('AGREE @lead', ['deva', 'devb'])).toBeUndefined();
    expect(parseAgreeWriter('AGREE @deva @devb', ['deva', 'devb'])).toBeUndefined();
    expect(parseAgreeWriter('AGREE looks good', ['deva', 'devb'])).toBeUndefined();
  });
});
