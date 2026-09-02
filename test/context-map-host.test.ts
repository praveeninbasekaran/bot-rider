import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import {
  buildIsolationPacket,
  packetToMessage,
  type IsolationPacket,
} from '../src/app/bot-session-store';
import {
  ContextMapHost,
  EmptyContextMapNeighborhood,
  fileNodeId,
  matchCodeNodeIds,
  packetCanvasLabel,
  retainKnownNodeIds,
  type ContextMapActions,
  type ContextMapChild,
  type ContextMapFile,
  type ContextMapFolder,
  type ContextMapNeighborhood,
  type ContextMapSymbol,
} from '../src/app/context-map';
import { COPY, BOTS_STATE_KEY } from '../src/app/copy';
import { turnInstruction } from '../src/app/prompt-builder';
import { emptyBoard } from '../src/app/run-board';
import { TokenGovernor, type TokenCounter } from '../src/app/token-governor';
import type { BotRecord } from '../src/domain/bot';
import type { HostToUi } from '../src/protocol/messages';
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

class FakeNeighborhood implements ContextMapNeighborhood {
  folderInfo: ContextMapFolder | undefined = {
    uri: 'file:///ws',
    path: '/ws',
    name: 'ws',
  };
  active: ContextMapFile | undefined = {
    uri: 'file:///ws/src/app.ts',
    path: 'src/app.ts',
    name: 'app.ts',
  };
  children = new Map<string, ContextMapChild[]>();
  symbols = new Map<string, ContextMapSymbol[]>();
  symbolCalls: string[] = [];
  listCalls: string[] = [];
  throwSymbols = false;

  folder(): ContextMapFolder | undefined {
    return this.folderInfo;
  }
  activeFile(): ContextMapFile | undefined {
    return this.active;
  }
  async listChildren(folderUri: string): Promise<ContextMapChild[]> {
    this.listCalls.push(folderUri);
    return this.children.get(folderUri) ?? [];
  }
  async fileSymbols(fileUri: string): Promise<ContextMapSymbol[]> {
    this.symbolCalls.push(fileUri);
    if (this.throwSymbols) {
      throw new Error('symbols failed');
    }
    return this.symbols.get(fileUri) ?? [];
  }
}

class FakeActions implements ContextMapActions {
  opened: { uri: string; range?: { start: { line: number; character: number }; end?: { line: number; character: number } } }[] =
    [];
  revealed: string[] = [];
  async openUri(uri: string, range?: { start: { line: number; character: number }; end?: { line: number; character: number } }) {
    this.opened.push({ uri, range });
  }
  async revealProposedFile(path: string) {
    this.revealed.push(path);
  }
}

function harness(map?: { neighborhood?: ContextMapNeighborhood; actions?: ContextMapActions }) {
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
    undefined,
    undefined,
    map,
  );
  return { app, gw, fs, store, msgs };
}

async function twoBots(app: Application) {
  await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
  await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
}

function agreeThenImplement(gw: FakeGateway, path = 'src/out.ts') {
  gw.script = ({ turn, instruction }) => {
    const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
    if (turn === 'consensus') {
      return round === 1 ? 'DISSENT' : 'AGREE';
    }
    if (turn === 'implement') {
      return changesetFence([{ path, op: 'create', content: 'ok' }]);
    }
    return 'talk';
  };
}

function lenCounter(max = 1_000_000): TokenCounter {
  return {
    maxInputTokens: max,
    countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
  };
}

const bot: BotRecord = {
  id: '1',
  handle: 'alpha',
  name: 'Alpha',
  persona: 'PERSONA-UNIQUE',
  role: 'architect',
  instructions: 'keep secrets',
  active: true,
  colorIndex: 0,
  createdAt: 't',
  updatedAt: 't',
};

function packet(overrides: Partial<IsolationPacket> = {}): IsolationPacket {
  return {
    id: 'p1',
    at: 'turn-end',
    requirements: ['REQ-VERBATIM-KEEP'],
    decisions: ['DECIDE-THIS'],
    constraints: ['CONSTRAINT-X'],
    openQuestions: ['OPEN-Q'],
    ...overrides,
  };
}

function runMsgs(msgs: HostToUi[]) {
  return msgs.filter((m) => m.type === 'contextMap/run');
}

describe('CM-1 view contribution', () => {
  const pkg = JSON.parse(src('package.json')) as {
    contributes: {
      commands: { command: string; title: string }[];
      menus: Record<string, { command: string; when?: string }[]>;
      viewsContainers: { activitybar: { id: string }[] };
      views: Record<string, { id: string; name?: string; type?: string; visibility?: string }[]>;
    };
  };

  it('contributes Context Map in the existing container; order Bots → Chat → Context Map → Proposed Changes', () => {
    expect(pkg.contributes.viewsContainers.activitybar.map((v) => v.id)).toEqual(['botrider']);
    expect(pkg.contributes.viewsContainers.activitybar).toHaveLength(1);
    expect(pkg.contributes.views.botrider.map((v) => v.id)).toEqual([
      'botrider.bots',
      'botrider.chat',
      'botrider.contextMap',
      'botrider.review',
    ]);
    const map = pkg.contributes.views.botrider.find((v) => v.id === 'botrider.contextMap');
    expect(map?.name).toBe('Context Map');
    expect(map?.type).toBe('webview');
    expect(map?.visibility).toBe('visible');
    expect(pkg.contributes.commands.find((c) => c.command === 'botrider.contextMap.refresh')?.title).toBe(
      'Refresh',
    );
    expect(pkg.contributes.menus['view/title'].find((m) => m.command === 'botrider.contextMap.refresh')?.when).toBe(
      'view == botrider.contextMap',
    );
  });

  it('is not a second Activity Bar icon and is not Graphify', () => {
    expect(Object.keys(pkg.contributes.views)).toEqual(['botrider']);
    const blobs = ['package.json', 'src/extension.ts', 'src/adapters/context-map-view.ts', 'src/app/context-map.ts'];
    for (const file of blobs) {
      expect(src(file), file).not.toMatch(/Graphify/i);
    }
    expect(src('media/context-map.js')).not.toMatch(/Graphify/i);
    expect(src('src/extension.ts')).not.toMatch(/botrider\.contextMap\.focus/);
    expect(src('src/extension.ts')).toContain('registerWebviewViewProvider(ContextMapViewProvider.viewId, mapView)');
    expect(src('src/extension.ts')).toContain("'botrider.chat'");
    expect(src('src/adapters/chat-expand-panel.ts')).toContain('retainContextWhenHidden: true');
    expect(src('src/adapters/context-map-view.ts')).not.toContain('retainContextWhenHidden');
  });
});

describe('CM-2 workspace neighborhood', () => {
  it('opening the view does not crawl whole-workspace symbols', async () => {
    const hood = new FakeNeighborhood();
    hood.symbols.set('file:///ws/src/app.ts', [
      { name: 'n', kind: 'Variable', start: { line: 0, character: 13 }, end: { line: 0, character: 14 } },
    ]);
    hood.children.set('file:///ws', [
      { uri: 'file:///ws/src', path: 'src', name: 'src', directory: true },
      { uri: 'file:///ws/README.md', path: 'README.md', name: 'README.md', directory: false },
    ]);
    const { app } = harness({ neighborhood: hood });
    await app.contextMap.onViewVisible();
    expect(hood.listCalls).toEqual([]);
    expect(hood.symbolCalls).toEqual(['file:///ws/src/app.ts']);
    const last = app.contextMap.lastWorkspace;
    expect(last.nodes.some((n) => n.kind === 'file' && n.path === 'src/app.ts')).toBe(true);
    expect(last.nodes.some((n) => n.kind === 'symbol' && n.label === 'n')).toBe(true);
    expect(last.nodes.some((n) => n.path === 'README.md')).toBe(false);
  });

  it('expanding a file node loads that file’s symbols only', async () => {
    const hood = new FakeNeighborhood();
    hood.symbols.set('file:///ws/src/app.ts', [
      { name: 'n', kind: 'Variable', start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    ]);
    hood.symbols.set('file:///ws/src/other.ts', [
      { name: 'other', kind: 'Function', start: { line: 1, character: 0 }, end: { line: 2, character: 1 } },
    ]);
    const { app } = harness({ neighborhood: hood });
    await app.contextMap.refreshWorkspace();
    hood.symbolCalls = [];
    await app.handleUi({ type: 'contextMap/expand-file', uri: 'file:///ws/src/other.ts' });
    expect(hood.symbolCalls).toEqual(['file:///ws/src/other.ts']);
    expect(hood.listCalls).toEqual([]);
    expect(app.contextMap.lastWorkspace.nodes.some((n) => n.label === 'other')).toBe(true);
    expect(app.contextMap.lastWorkspace.nodes.filter((n) => n.kind === 'symbol')).toHaveLength(2);
  });

  it('Refresh re-fetches the current neighborhood only', async () => {
    const hood = new FakeNeighborhood();
    hood.symbols.set('file:///ws/src/app.ts', [
      { name: 'n', kind: 'Variable', start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    ]);
    const { app, msgs } = harness({ neighborhood: hood });
    await app.contextMap.refreshWorkspace();
    await app.contextMap.expandFile('file:///ws');
    expect(hood.listCalls).toEqual(['file:///ws']);
    hood.symbolCalls = [];
    hood.listCalls = [];
    const beforeRun = runMsgs(msgs).length;
    await app.contextMap.refreshWorkspace();
    expect(hood.symbolCalls).toEqual(['file:///ws/src/app.ts']);
    expect(hood.listCalls).toEqual([]);
    expect(runMsgs(msgs).length).toBe(beforeRun);
  });

  it('incomplete graph: no error toast', async () => {
    const hood = new FakeNeighborhood();
    hood.throwSymbols = true;
    const { app, msgs } = harness({ neighborhood: hood });
    await app.contextMap.refreshWorkspace();
    expect(msgs.some((m) => m.type === 'error')).toBe(false);
    expect(app.contextMap.lastWorkspace.nodes.some((n) => n.kind === 'file')).toBe(true);
    hood.folderInfo = undefined;
    hood.active = undefined;
    await app.contextMap.refreshWorkspace();
    expect(app.contextMap.lastWorkspace.nodes).toEqual([]);
    expect(msgs.some((m) => m.type === 'error')).toBe(false);
  });
});

describe('CM-2 this-run graph', () => {
  it('is empty after reload until the next run and is not persisted', async () => {
    const { app, gw, store, msgs } = harness();
    expect(app.contextMap.lastRun).toEqual({ nodes: [], edges: [] });
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('build');
    const during = runMsgs(msgs).at(-1);
    expect(during && during.type === 'contextMap/run' && during.nodes.some((n) => n.kind === 'bot')).toBe(true);
    expect(during && during.type === 'contextMap/run' && during.nodes.some((n) => n.kind === 'proposedFile')).toBe(
      true,
    );
    expect(JSON.stringify(store.get(BOTS_STATE_KEY) ?? {})).not.toMatch(/contextMap|proposedFile|mapsTo/);
    expect(src('src/app/context-map.ts')).not.toMatch(/globalState|BOTS_STATE_KEY|setKeysForSync|memento/);

    await app.reject();
    const after = runMsgs(msgs).at(-1);
    expect(after).toEqual({ type: 'contextMap/run', nodes: [], edges: [] });

    app.contextMap.clearRun();
    expect(app.contextMap.lastRun).toEqual({ nodes: [], edges: [] });
    app.orchestrator.sessions.clear();
    expect(app.orchestrator.sessions.listPublished()).toEqual([]);
  });

  it('labels bots @{handle} and does not put packet bodies or OpenSpec ids on the canvas', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('build');
    const run = runMsgs(msgs).at(-1);
    expect(run && run.type === 'contextMap/run').toBe(true);
    if (!run || run.type !== 'contextMap/run') {
      return;
    }
    const bots = run.nodes.filter((n) => n.kind === 'bot');
    expect(bots.map((b) => b.label).sort()).toEqual(['@alpha', '@beta']);
    expect(run.nodes.some((n) => n.kind === 'packet' && n.label === 'Turn')).toBe(true);
    expect(run.nodes.some((n) => n.label.includes('REQ-'))).toBe(false);
    expect(run.nodes.every((n) => n.kind !== 'packet' || !/AGREE|talk/.test(n.label))).toBe(true);
    expect(run.nodes.some((n) => n.id.startsWith('EX-') || n.label === 'EX-1')).toBe(false);
  });
});

describe('CM-3 inspect / open', () => {
  it('click/select does not Approve, sendRequest, execute, or dump full-file into Swarm', async () => {
    const actions = new FakeActions();
    const hood = new FakeNeighborhood();
    const { app, gw, msgs } = harness({ neighborhood: hood, actions });
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('build');
    const beforeRequests = gw.requestCount;
    const beforeApprove = app.changesets.hasPending();
    await app.handleUi({ type: 'contextMap/select', nodeId: fileNodeId('file:///ws/src/app.ts') });
    expect(gw.requestCount).toBe(beforeRequests);
    expect(app.changesets.hasPending()).toBe(beforeApprove);
    expect(app.thread.list().some((t) => t.text.includes('export const n'))).toBe(false);
    expect(msgs.some((m) => m.type === 'changeset/cleared')).toBe(false);
    expect(src('src/app/context-map.ts')).not.toMatch(/approve\(|sendRequest|applyEdit|executeCommand/);
    expect(src('src/app/context-map.ts')).not.toMatch(/thread\.append|chat\/send/);
  });

  it('open without location is no-op; with location MAY vscode.open — still not Approve', async () => {
    const actions = new FakeActions();
    const hood = new FakeNeighborhood();
    hood.symbols.set('file:///ws/src/app.ts', [
      { name: 'n', kind: 'Variable', start: { line: 0, character: 13 }, end: { line: 0, character: 14 } },
    ]);
    const { app, gw } = harness({ neighborhood: hood, actions });
    await app.contextMap.refreshWorkspace();
    await app.handleUi({ type: 'contextMap/open', nodeId: 'missing-node' });
    expect(actions.opened).toEqual([]);
    const file = app.contextMap.lastWorkspace.nodes.find((n) => n.kind === 'file');
    await app.handleUi({ type: 'contextMap/open', nodeId: file!.id });
    expect(actions.opened).toEqual([{ uri: 'file:///ws/src/app.ts', range: undefined }]);
    const symbol = app.contextMap.lastWorkspace.nodes.find((n) => n.kind === 'symbol');
    await app.handleUi({ type: 'contextMap/open', nodeId: symbol!.id });
    expect(actions.opened[1]?.uri).toBe('file:///ws/src/app.ts');
    expect(actions.opened[1]?.range).toEqual({
      start: { line: 0, character: 13 },
      end: { line: 0, character: 14 },
    });
    expect(app.changesets.hasPending()).toBe(false);
    expect(gw.requestCount).toBe(0);
  });

  it('proposed-file select MAY focus Review row and does not Approve', async () => {
    const actions = new FakeActions();
    const { app, gw } = harness({ actions });
    await twoBots(app);
    agreeThenImplement(gw, 'src/out.ts');
    await app.send('build');
    expect(app.changesets.hasPending()).toBe(true);
    const proposed = app.contextMap.lastRun.nodes.find((n) => n.kind === 'proposedFile');
    expect(proposed?.path).toBe('src/out.ts');
    await app.handleUi({ type: 'contextMap/select', nodeId: proposed!.id });
    expect(actions.revealed).toEqual(['src/out.ts']);
    expect(app.changesets.hasPending()).toBe(true);
    expect(app.changesets.files?.[0]?.content).toBe('ok');
  });
});

describe('CM-4 packet nodeIds', () => {
  it('published packet with a stale node id omits that id and still publishes; turn is not blocked', async () => {
    const hood = new FakeNeighborhood();
    const { app, gw } = harness({ neighborhood: hood });
    await app.contextMap.refreshWorkspace();
    const known = app.contextMap.knownCodeNodeIds();
    expect(known.length).toBeGreaterThan(0);
    const live = known[0]!;
    expect(app.contextMap.nodeIdsFor(packet({ constraints: ['src/app.ts (in changeset)'] }), [live, 'file:stale.ts'])).toEqual(
      expect.arrayContaining([live]),
    );
    expect(app.contextMap.nodeIdsFor(packet(), ['file:stale.ts'])).toBeUndefined();

    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('build the src/app.ts feature');
    expect(gw.requestCount).toBeGreaterThan(1);
    const published = app.orchestrator.sessions.listPublished();
    expect(published.length).toBeGreaterThan(0);
    for (const p of published) {
      expect(p.nodeIds?.includes('file:stale.ts')).toBeFalsy();
      if (p.nodeIds) {
        for (const id of p.nodeIds) {
          expect(known.includes(id) || app.contextMap.knownCodeNodeIds().includes(id)).toBe(true);
        }
      }
    }
    expect(app.orchestrator.getRunState().phase).not.toBe('error');
  });

  it('SI-2 bodies unchanged when nodeIds present; OS-4 spec bodies still required; QC-3 if they cannot fit', async () => {
    const withIds = packet({
      nodeIds: ['file:///ws/src/app.ts'],
      specs: [{ id: 'EX-1', body: 'EX-1-SPEC-BODY-VERBATIM-OS4' }],
    });
    const msg = packetToMessage(withIds);
    expect(msg.content).toContain('REQ-VERBATIM-KEEP');
    expect(msg.content).toContain('DECIDE-THIS');
    expect(msg.content).toContain('CONSTRAINT-X');
    expect(msg.content).toContain('OPEN-Q');
    expect(msg.content).toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
    expect(msg.content).not.toContain('file:///ws/src/app.ts');
    expect(msg.content).not.toContain('nodeIds');

    const gov = new TokenGovernor();
    const ok = await gov.pack({
      bot,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board: { ...emptyBoard(), goal: 'go' },
      workspace: defaultWorkspace,
      counter: lenCounter(),
      isolationPackets: [withIds],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const text = ok.messages.map((m) => m.content).join('\n');
      expect(text).toContain('REQ-VERBATIM-KEEP');
      expect(text).toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
      expect(text).not.toContain('nodeIds');
    }

    const overflow = await gov.pack({
      bot,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board: { ...emptyBoard(), goal: 'go' },
      workspace: defaultWorkspace,
      counter: lenCounter(80),
      isolationPackets: [
        packet({
          nodeIds: ['file:any'],
          specs: [{ id: 'EX-1', body: 'EX-BODY-' + 'Z'.repeat(400) }],
        }),
      ],
    });
    expect(overflow).toEqual({ ok: false, overflow: true });

    const built = buildIsolationPacket({
      at: 'turn-end',
      board: { ...emptyBoard(), goal: 'ship', files: [{ path: 'a.ts', inChangeset: true }] },
    });
    expect(built.nodeIds).toBeUndefined();
    expect(built.requirements).toEqual(['ship']);
  });
});

describe('CM sequential / leftovers / protocol', () => {
  it('sequential: no overlapping sendRequest', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('build');
    expect(gw.requestCount).toBeGreaterThan(1);
    expect(gw.maxInflight).toBeGreaterThan(1);
    expect(src('src/app/orchestrator.ts')).not.toMatch(/F7 parallel/);
  });

  it('adds only additive contextMap protocol members and does not reopen leftover ports', () => {
    const proto = src('src/protocol/messages.ts');
    const host = proto.slice(proto.indexOf('export type HostToUi'), proto.indexOf('export type UiToHost'));
    const ui = proto.slice(proto.indexOf('export type UiToHost'), proto.indexOf('export interface WorkspaceContext'));
    expect(host).toContain("type: 'contextMap/workspace'");
    expect(host).toContain("type: 'contextMap/run'");
    expect(ui).toContain("type: 'contextMap/expand-file'");
    expect(ui).toContain("type: 'contextMap/select'");
    expect(ui).toContain("type: 'contextMap/open'");
    expect(host).not.toMatch(/openspec\/|cite\/|spec-catalog/);
    expect(ui).not.toMatch(/openspec\/|cite\/|specIds/);
    expect(matchCodeNodeIds(packet({ constraints: ['src/app.ts (in changeset)'] }), [
      { id: 'file:live', kind: 'file', label: 'app.ts', path: 'src/app.ts' },
    ])).toEqual(['file:live']);
    expect(retainKnownNodeIds(['file:live', 'file:stale'], ['file:live'])).toEqual(['file:live']);
    expect(packetCanvasLabel(packet({ at: 'consensus' }))).toBe('Consensus');
    expect(new EmptyContextMapNeighborhood().folder()).toBeUndefined();
    for (const file of ['src/app/context-map.ts', 'src/adapters/context-map-view.ts', 'src/app/orchestrator.ts']) {
      const text = src(file);
      expect(text, file).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
      expect(text, file).not.toMatch(/Graphify/i);
    }
    for (const file of listSrcTs(join(root, 'src'))) {
      expect(src(file), file).not.toMatch(/setKeysForSync/);
    }
  });
});
