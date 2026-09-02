import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import { packetToMessage, type IsolationPacket } from '../src/app/bot-session-store';
import { COPY, BOTS_STATE_KEY } from '../src/app/copy';
import { McpActionStore, toMcpActionDto } from '../src/app/mcp-action-store';
import {
  OpenSpecCatalog,
  attachFileCites,
  collectExactCatalogIds,
  containsExactIdToken,
  filterToCatalog,
  matchSpecBodies,
  parseSpecsIndex,
} from '../src/app/openspec-catalog';
import { PatchParser } from '../src/app/patch-parser';
import { turnInstruction } from '../src/app/prompt-builder';
import { filesToPreview } from '../src/protocol/messages';
import { emptyBoard } from '../src/app/run-board';
import { TokenGovernor, type TokenCounter } from '../src/app/token-governor';
import type { BotRecord } from '../src/domain/bot';
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
const parser = new PatchParser();

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

function seedCatalog(
  fs: MemoryFs,
  rows: Array<{ id: string; body?: string; slug?: string; missingBody?: boolean }>,
): void {
  const lines = ['| Id | Capability | Spec |', '| --- | --- | --- |'];
  for (const row of rows) {
    const slug = row.slug ?? row.id.toLowerCase();
    const rel = `specs/${slug}/spec.md`;
    lines.push(`| ${row.id} | ${row.id} title | [${rel}](./${rel}) |`);
    if (!row.missingBody) {
      fs.files.set(`openspec/${rel}`, row.body ?? `${row.id} body`);
    }
  }
  fs.files.set('openspec/specs.md', lines.join('\n'));
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

function lenCounter(max = 1_000_000): TokenCounter {
  return {
    maxInputTokens: max,
    countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
  };
}

function lastPreview(msgs: HostToUi[]) {
  const preview = [...msgs].reverse().find((m) => m.type === 'changeset/preview');
  return preview && preview.type === 'changeset/preview' ? preview : undefined;
}

function agreeThenImplement(gw: FakeGateway): void {
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

describe('OS-1 catalog', () => {
  it('missing openspec/ → empty catalog, no error, no banner, no chips/specIds', async () => {
    const { app, gw, fs, msgs } = harness();
    await twoBots(app);
    agreeThenImplement(gw);
    const before = [...fs.files.keys()];
    await app.send('build the feature');
    expect(app.orchestrator.catalog.snapshot()).toEqual([]);
    expect(msgs.some((m) => m.type === 'error')).toBe(false);
    expect(JSON.stringify(msgs)).not.toMatch(/empty catalog|OpenSpec chips|missing openspec/i);
    const preview = lastPreview(msgs);
    expect(preview).toBeDefined();
    expect(preview?.files.every((f) => f.specIds === undefined)).toBe(true);
    expect(JSON.stringify(preview)).not.toContain('specIds');
    expect(before.filter((k) => k.startsWith('openspec/'))).toEqual([]);
    expect(JSON.stringify(COPY)).not.toMatch(/openspec/i);
  });

  it('openspec/ present, specs.md missing → empty catalog, no error', async () => {
    const { app, gw, fs, msgs } = harness();
    fs.files.set('openspec/README.md', 'index later');
    fs.files.set('openspec/specs/ex-1/spec.md', 'should not be invented');
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('build');
    expect(app.orchestrator.catalog.snapshot()).toEqual([]);
    expect(msgs.some((m) => m.type === 'error')).toBe(false);
    expect(lastPreview(msgs)?.files.every((f) => !f.specIds)).toBe(true);
  });

  it('index row whose spec.md is missing → that id absent; other rows still load', async () => {
    const { app, gw, fs } = harness();
    seedCatalog(fs, [
      { id: 'BR-6', missingBody: true },
      { id: 'EX-1', body: 'EX-1-SPEC-BODY-VERBATIM' },
    ]);
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('build');
    const entries = app.orchestrator.catalog.snapshot();
    expect(entries.map((e) => e.id)).toEqual(['EX-1']);
    expect(entries[0]?.body).toBe('EX-1-SPEC-BODY-VERBATIM');
  });

  it('does not invent ids from directories and first duplicate row wins', async () => {
    const fs = new MemoryFs();
    fs.files.set(
      'openspec/specs.md',
      [
        '| Id | Spec |',
        '| --- | --- |',
        '| EX-1 | [specs/ex-1/spec.md](./specs/ex-1/spec.md) |',
        '| EX-1 | [specs/ex-1-other/spec.md](./specs/ex-1-other/spec.md) |',
      ].join('\n'),
    );
    fs.files.set('openspec/specs/ex-1/spec.md', 'FIRST-BODY');
    fs.files.set('openspec/specs/ex-1-other/spec.md', 'SECOND-BODY');
    fs.files.set('openspec/specs/ghost/spec.md', 'GHOST-NOT-IN-INDEX');
    const catalog = new OpenSpecCatalog(fs);
    const entries = await catalog.load();
    expect(entries).toEqual([{ id: 'EX-1', body: 'FIRST-BODY' }]);
    expect(parseSpecsIndex(fs.files.get('openspec/specs.md')!).map((r) => r.id)).toEqual(['EX-1']);
  });

  it('host does not write openspec/ at runtime', async () => {
    const { app, gw, fs } = harness();
    seedCatalog(fs, [{ id: 'EX-1', body: 'stay' }]);
    const before = new Map(fs.files);
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('follow EX-1 please');
    for (const key of fs.files.keys()) {
      if (key.startsWith('openspec/')) {
        expect(fs.files.get(key)).toBe(before.get(key));
      }
    }
    expect(fs.lastOps.every((op) => !op.relativePath.replace(/\\/g, '/').startsWith('openspec/'))).toBe(true);
    const catalogSrc = src('src/app/openspec-catalog.ts');
    expect(catalogSrc).not.toMatch(/writeFile|writeFileSync|applyEdit|createFile|mkdir|readdir|findFiles/);
    expect(catalogSrc).not.toMatch(/globalState|BOTS_STATE_KEY|memento|setKeysForSync/);
    expect(JSON.stringify(new MemoryStore().get(BOTS_STATE_KEY) ?? null)).not.toMatch(/openspec|OpenSpecEntry/);
  });

  it('never persists catalog to BR-3 / globalState', async () => {
    const { app, gw, store, fs } = harness();
    seedCatalog(fs, [{ id: 'EX-1', body: 'body' }]);
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('EX-1');
    expect(JSON.stringify(store.get(BOTS_STATE_KEY))).not.toMatch(/EX-1-SPEC|OpenSpec|openspec\/specs/);
  });
});

describe('OS-2 cite filter', () => {
  it('implementer specIds / exact id in file content: catalog id survives; unknown dropped; parse still succeeds', async () => {
    const { app, gw, fs, msgs } = harness();
    seedCatalog(fs, [
      { id: 'BR-6', body: 'gated' },
      { id: 'EX-1', body: 'export body' },
    ]);
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([
          {
            path: 'src/a.ts',
            op: 'create',
            content: 'touch BR-6 and mention BR-60 which is not BR-6',
            specIds: ['EX-1', 'NOPE', 'F3-1'],
          },
        ]);
      }
      return 'talk';
    };
    await app.send('build');
    expect(msgs.some((m) => m.type === 'error' && (m.code === 'parse-failed' || m.code === 'validate-failed'))).toBe(
      false,
    );
    const preview = lastPreview(msgs);
    expect(preview?.files[0]?.specIds).toEqual(['BR-6', 'EX-1']);
    const pending = app.changesets.files?.[0];
    expect(pending?.specIds).toEqual(['BR-6', 'EX-1']);
    expect(containsExactIdToken('BR-60', 'BR-6')).toBe(false);
    expect(containsExactIdToken('cite BR-6 please', 'BR-6')).toBe(true);
  });

  it('debate / @ / vote / Split changesets have no cites', async () => {
    const { app, gw, fs, msgs } = harness();
    seedCatalog(fs, [{ id: 'BR-6', body: 'gated' }]);
    await twoBots(app);
    const citedFence = changesetFence([
      { path: 'leaked.ts', op: 'create', content: 'BR-6', specIds: ['BR-6'] },
    ]);
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return `DISSENT\n${citedFence}`;
      }
      return `language only\n${citedFence}`;
    };
    await app.send('build');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    expect(msgs.some((m) => m.type === 'changeset/preview')).toBe(false);
    expect(app.changesets.hasPending()).toBe(false);
    const debate = parser.sanitizeDebate(`proposal:\n${citedFence}`);
    expect(debate).not.toContain('BR-6');
    expect(debate).not.toContain('specIds');

    const { app: solo, gw: soloGw, fs: soloFs, msgs: soloMsgs } = harness();
    seedCatalog(soloFs, [{ id: 'BR-6', body: 'gated' }]);
    await solo.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    soloGw.script = () => `${citedFence}\nNO_EDIT`;
    await solo.send('@alpha skip edits');
    expect(soloMsgs.some((m) => m.type === 'changeset/preview')).toBe(false);
    expect(solo.changesets.hasPending()).toBe(false);
  });

  it('emits optional specIds on changeset/preview in catalog-index order and omits when empty', () => {
    const catalog = [
      { id: 'EX-1', body: 'e' },
      { id: 'BR-6', body: 'b' },
    ];
    const files = [
      attachFileCites(
        { path: 'a.ts', op: 'create', content: 'BR-6', specIds: ['BR-6', 'EX-1', 'NOPE'] },
        catalog,
      ),
      attachFileCites({ path: 'b.ts', op: 'update', content: 'plain' }, catalog),
    ];
    expect(files[0]?.specIds).toEqual(['EX-1', 'BR-6']);
    const preview = filesToPreview(files);
    expect(preview[0]?.specIds).toEqual(['EX-1', 'BR-6']);
    expect(preview[1]?.specIds).toBeUndefined();
    expect('specIds' in (preview[1] ?? {})).toBe(false);
  });
});

describe('OS-2 MCP Grain B', () => {
  it('MCP Grain B never gets specIds', () => {
    const store = new McpActionStore(() => undefined);
    const action = store.append({
      name: 'create_issue',
      server: 'github',
      tool: 'create_issue',
      args: { title: 'Ship' },
      argsLine: 'title Ship',
      botId: 'b1',
      handle: 'alpha',
    });
    const dto = toMcpActionDto(action);
    expect(dto).not.toHaveProperty('specIds');
    expect(JSON.stringify(store.snapshot())).not.toContain('specIds');
    const proto = src('src/protocol/messages.ts');
    const mcpDto = proto.slice(proto.indexOf('export interface McpActionDto'), proto.indexOf('export type HostToUi'));
    expect(mcpDto).not.toContain('specIds');
    expect(src('src/app/mcp-action-store.ts')).not.toContain('specIds');
    expect(proto).toContain("type: 'mcp/actions-preview'; actions: McpActionDto[]");
    expect(proto).not.toMatch(/type: 'openspec\//);
    expect(proto).not.toMatch(/type: 'cite\//);
  });
});

describe('OS-4 isolation ingest', () => {
  it('master prompt containing exact EX-1 ingests that spec body verbatim into remaining-turn + implementer packets; fuzzy title does not', async () => {
    const { app, gw, fs } = harness();
    seedCatalog(fs, [{ id: 'EX-1', body: 'EX-1-SPEC-BODY-VERBATIM-OS4' }]);
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('please follow EX-1 for export');
    const betaId = app.registry.getByHandle('beta')!.id;
    const alphaId = app.registry.getByHandle('alpha')!.id;
    const betaPacks = gw.lastMessages.filter((_, i) => gw.lastSendOpts[i]?.botId === betaId);
    expect(betaPacks.length).toBeGreaterThan(0);
    const betaIsolation = betaPacks.map(isolationText).join('\n');
    expect(betaIsolation).toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
    expect(betaIsolation).toContain('EX-1');
    expect(betaIsolation).toContain('Specs:');
    const reqBlock = betaIsolation.slice(betaIsolation.indexOf('Requirements:'), betaIsolation.indexOf('Specs:'));
    expect(reqBlock).not.toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
    const impl = gw.turns.findIndex((t) => t === 'implement');
    expect(impl).toBeGreaterThanOrEqual(0);
    expect(isolationText(gw.lastMessages[impl]!)).toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
    expect(gw.lastSendOpts[impl]?.botId).toBe(alphaId);

    const fuzzy = harness();
    seedCatalog(fuzzy.fs, [{ id: 'EX-1', body: 'EX-1-SPEC-BODY-VERBATIM-OS4' }]);
    await twoBots(fuzzy.app);
    agreeThenImplement(fuzzy.gw);
    await fuzzy.app.send('Bot export / import please');
    const fuzzyIsolation = fuzzy.gw.lastMessages.map(isolationText).join('\n');
    expect(fuzzyIsolation).not.toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
    expect(collectExactCatalogIds('Bot export / import please', [{ id: 'EX-1' }])).toEqual([]);
    expect(collectExactCatalogIds('use EX-1 now', [{ id: 'EX-1' }])).toEqual(['EX-1']);
  });

  it('inactive bots do not receive spec-body packets', async () => {
    const { app, gw, fs } = harness();
    seedCatalog(fs, [{ id: 'EX-1', body: 'EX-1-SPEC-BODY-VERBATIM-OS4' }]);
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
    await app.send('please follow EX-1');
    expect(app.orchestrator.sessions.peek(gamma.id)).toBeUndefined();
    expect(gw.lastSendOpts.every((opts) => opts.botId !== gamma.id)).toBe(true);
    const betaId = app.registry.getByHandle('beta')!.id;
    const betaIsolation = gw.lastMessages
      .filter((_, i) => gw.lastSendOpts[i]?.botId === betaId)
      .map(isolationText)
      .join('\n');
    expect(betaIsolation).toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
  });

  it('packetToMessage includes spec bodies verbatim and never stuffs them into requirements', () => {
    const msg = packetToMessage(
      packet({
        specs: [{ id: 'EX-1', body: 'EX-1-SPEC-BODY-VERBATIM-OS4' }],
      }),
    );
    expect(msg.content).toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
    expect(msg.content).toContain('Specs:');
    expect(msg.content).toContain('EX-1');
    const reqBlock = msg.content.slice(
      msg.content.indexOf('Requirements:'),
      msg.content.indexOf('Decisions:'),
    );
    expect(reqBlock).not.toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
  });
});

describe('OS-4 TokenGovernor required spec bodies', () => {
  it('required spec bodies that cannot fit → pack-overflow; no Copilot call; no silent drop', async () => {
    const { app, gw, fs, msgs } = harness();
    seedCatalog(fs, [{ id: 'EX-1', body: 'EX-BODY-' + 'Z'.repeat(400) }]);
    await twoBots(app);
    const original = gw.stream.bind(gw);
    gw.stream = async (messages, token, onText) => {
      const result = await original(messages, token, onText);
      gw.maxInputTokens = await gw.countTokens(messages);
      return result;
    };
    await app.send('please follow EX-1');
    expect(gw.requestCount).toBe(1);
    expect(gw.turns).toEqual(['propose']);
    const err = msgs.find((m) => m.type === 'error' && m.code === 'pack-overflow');
    expect(err && err.type === 'error' && err.message).toBe(COPY.packOverflow);
    expect(msgs.filter((m) => m.type === 'chat/turn-start')).toHaveLength(1);

    const gov = new TokenGovernor();
    const huge = packet({
      specs: [{ id: 'EX-1', body: 'EX-BODY-' + 'Z'.repeat(400) }],
    });
    const overflow = await gov.pack({
      bot,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board: { ...emptyBoard(), goal: 'go' },
      workspace: defaultWorkspace,
      counter: lenCounter(80),
      isolationPackets: [huge],
    });
    expect(overflow).toEqual({ ok: false, overflow: true });
  });

  it('attachment extras still trim silent while required spec bodies stay', async () => {
    const gov = new TokenGovernor();
    const attached: BotRecord = {
      ...bot,
      attachments: [
        { path: 'keep.md', name: 'keep.md', snapshot: 'SNAP-KEEP', kind: 'skills' },
        { path: 'tail.md', name: 'tail.md', snapshot: 'SNAP-TAIL', kind: 'hooks' },
      ],
    };
    const required = packet({
      specs: [{ id: 'EX-1', body: 'EX-1-SPEC-BODY-VERBATIM-OS4' }],
    });
    const withPacket = await gov.pack({
      bot: { ...attached, attachments: attached.attachments?.slice(0, 1) },
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board: { ...emptyBoard(), goal: 'go' },
      workspace: defaultWorkspace,
      counter: lenCounter(),
      isolationPackets: [required],
    });
    expect(withPacket.ok).toBe(true);
    if (!withPacket.ok) {
      return;
    }
    expect(joined(withPacket.messages)).toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
    const dropTail = lenCounter(await lenCounter().countTokens(withPacket.messages));
    const trimmed = await gov.pack({
      bot: attached,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board: { ...emptyBoard(), goal: 'go' },
      workspace: defaultWorkspace,
      counter: dropTail,
      isolationPackets: [required],
      mcpContext: ['MCP-NOTE-' + 'Z'.repeat(80)],
    });
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) {
      return;
    }
    const text = joined(trimmed.messages);
    expect(text).toContain('EX-1-SPEC-BODY-VERBATIM-OS4');
    expect(text).toContain('Isolation packet:');
    expect(text).toContain('SNAP-KEEP');
    expect(text).not.toContain('SNAP-TAIL');
    expect(text).not.toContain('MCP-NOTE');
  });
});

describe('OS sequential / leftovers / protocol', () => {
  it('sequential: no overlapping sendRequest', async () => {
    const { app, gw, fs } = harness();
    seedCatalog(fs, [{ id: 'EX-1', body: 'body' }]);
    await twoBots(app);
    agreeThenImplement(gw);
    await app.send('follow EX-1');
    expect(gw.requestCount).toBeGreaterThan(1);
    expect(gw.maxInflight).toBe(1);
    const orch = src('src/app/orchestrator.ts');
    expect(orch).not.toMatch(/Promise\.all\s*\(/);
    expect(orch).not.toMatch(/Event Bus/);
    expect(orch).not.toMatch(/F7 parallel/);
  });

  it('adds no new HostToUi / UiToHost message types and does not reopen leftovers', () => {
    const proto = src('src/protocol/messages.ts');
    const host = proto.slice(proto.indexOf('export type HostToUi'), proto.indexOf('export type UiToHost'));
    const ui = proto.slice(proto.indexOf('export type UiToHost'), proto.indexOf('export interface WorkspaceContext'));
    expect(host).not.toMatch(/openspec\/|cite\/|spec-catalog/i);
    expect(ui).not.toMatch(/openspec\/|cite\/|specIds/);
    expect(host).toContain("type: 'changeset/preview'");
    expect(filterToCatalog(['NOPE', 'EX-1'], [{ id: 'BR-6' }, { id: 'EX-1' }])).toEqual(['EX-1']);
    const files = ['src/app/openspec-catalog.ts', 'src/app/token-governor.ts', 'src/app/orchestrator.ts', 'src/app/patch-parser.ts'];
    for (const file of files) {
      const text = src(file);
      expect(text, file).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
      expect(text, file).not.toMatch(/Graphify/i);
    }
    for (const file of listSrcTs(join(root, 'src'))) {
      expect(src(file), file).not.toMatch(/setKeysForSync/);
    }
    expect(src('src/app/openspec-catalog.ts')).not.toMatch(/eval\(|new Function/);
    expect(matchSpecBodies([{ id: 'EX-1', body: 'b' }], [], 'fuzzy title only')).toEqual([]);
    expect(matchSpecBodies([{ id: 'EX-1', body: 'b' }], [], 'see EX-1')).toEqual([{ id: 'EX-1', body: 'b' }]);
  });
});
