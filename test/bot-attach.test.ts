import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import {
  applyEmptyOnly,
  attachFilterExtensions,
  attachOpenDialogOptions,
  emitAttachResult,
  ingestPickedFiles,
  isUnfilledAttachField,
  parseAgentSnapshot,
  removeAttachment,
  resolveFormAttachments,
  shouldOpenAttachDialog,
  type AttachFileIo,
} from '../src/app/bot-attach';
import { BotRegistry } from '../src/app/bot-registry';
import { COPY, BOTS_STATE_KEY } from '../src/app/copy';
import { TokenGovernor, attachmentPackLabel, attachmentsBlock, packKindFor } from '../src/app/token-governor';
import { ATTACH_MAX_BYTES, agentKindCount, attachmentsOf, type BotRecord } from '../src/domain/bot';
import { turnInstruction } from '../src/app/prompt-builder';
import type { HostToUi } from '../src/protocol/messages';
import { defaultWorkspace, FakeGateway, FixedWorkspace, MemoryFs, MemoryStore } from './fakes';
import { emptyBoard } from '../src/app/run-board';

const WS = '/tmp/bot-rider-ws';
const AGENT_MD = `---
name: Docs Agent
handle: DocsAgent
persona: Calm guide
---
body leftover
`;

class MemoryAttachIo implements AttachFileIo {
  files = new Map<string, Uint8Array>();
  reads: string[] = [];
  unreadable = new Set<string>();
  missingStat = new Set<string>();

  put(absPath: string, text: string | Uint8Array): void {
    this.files.set(absPath, typeof text === 'string' ? new TextEncoder().encode(text) : text);
  }

  async statSize(absPath: string): Promise<number> {
    if (this.missingStat.has(absPath)) {
      throw new Error('stat failed');
    }
    const bytes = this.files.get(absPath);
    if (!bytes) {
      throw new Error('missing');
    }
    return bytes.byteLength;
  }

  async readBytes(absPath: string): Promise<Uint8Array> {
    this.reads.push(absPath);
    if (this.unreadable.has(absPath)) {
      throw new Error('unreadable');
    }
    const bytes = this.files.get(absPath);
    if (!bytes) {
      throw new Error('missing');
    }
    return bytes;
  }
}

function bot(overrides: Partial<BotRecord> = {}): BotRecord {
  return {
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
    ...overrides,
  };
}

function lenCounter(max = 1_000_000) {
  return {
    maxInputTokens: max,
    countTokens: async (m: { content: string }[]) => m.reduce((n, x) => n + x.content.length, 0),
  };
}

function joined(messages: { content: string }[]): string {
  return messages.map((m) => m.content).join('\n');
}

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

function srcOf(...rel: string[]): string {
  return rel.map((file) => readFileSync(join(__dirname, '..', file), 'utf8')).join('\n');
}

describe('attach picker contract', () => {
  it('refuses the dialog when no folder is open', () => {
    expect(shouldOpenAttachDialog(undefined)).toBe(false);
    expect(shouldOpenAttachDialog('')).toBe(false);
    expect(shouldOpenAttachDialog(WS)).toBe(true);
  });

  it('Agent picker is single-select markdown/text and does not list .py', () => {
    const opts = attachOpenDialogOptions(WS, 'agent');
    expect(opts.canSelectMany).toBe(false);
    expect(opts.canSelectFiles).toBe(true);
    expect(opts.canSelectFolders).toBe(false);
    expect(opts.defaultUri.fsPath).toBe(WS);
    expect(opts.title).toBe('Attach agent');
    const exts = Object.values(opts.filters).flat();
    expect(exts).toEqual(['md', 'txt', 'markdown']);
    expect(exts).not.toContain('py');
    expect(exts).not.toContain('.py');
    expect(attachFilterExtensions('agent')).not.toContain('py');
  });

  it('Scripts picker lists .md and .py and allows many', () => {
    const opts = attachOpenDialogOptions(WS, 'scripts');
    expect(opts.canSelectMany).toBe(true);
    const exts = Object.values(opts.filters).flat();
    expect(exts).toEqual(expect.arrayContaining(['md', 'txt', 'markdown', 'py', 'js', 'ts', 'sh', 'bash', 'zsh', 'ps1']));
    expect(attachFilterExtensions('scripts')).toEqual(expect.arrayContaining(['md', 'py']));
    expect(attachFilterExtensions('hooks')).toEqual(attachFilterExtensions('scripts'));
    expect(attachOpenDialogOptions(WS, 'skills').canSelectMany).toBe(true);
    expect(attachFilterExtensions('skills')).toEqual(['md', 'txt', 'markdown']);
    expect(attachFilterExtensions('instructions')).not.toContain('py');
    expect(attachFilterExtensions('prompts')).not.toContain('py');
  });
});

describe('snapshot ingest', () => {
  it('stores a workspace snapshot with a relative path label and kind equal to the slot', async () => {
    const io = new MemoryAttachIo();
    const abs = `${WS}/docs/AGENTS.md`;
    io.put(abs, AGENT_MD);
    const result = await ingestPickedFiles({
      slot: 'agent',
      folderFsPath: WS,
      picked: [{ absPath: abs }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(result.added).toEqual([{ path: 'docs/AGENTS.md', name: 'AGENTS.md' }]);
    expect(result.attachments[0]?.path).toBe('docs/AGENTS.md');
    expect(result.attachments[0]?.name).toBe('AGENTS.md');
    expect(result.attachments[0]?.kind).toBe('agent');
    expect(result.attachments[0]?.snapshot).toContain('Calm guide');
    expect(result.mapped).toEqual({
      name: 'Docs Agent',
      handle: 'docsagent',
      persona: 'Calm guide',
    });
    expect(result.skipped).toEqual([]);
  });

  it('maps empty name/handle/persona from the Agent slot only; filled fields stay', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/AGENTS.md`, AGENT_MD);
    const empty = await ingestPickedFiles({
      slot: 'agent',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/AGENTS.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(empty.mapped).toEqual({ name: 'Docs Agent', handle: 'docsagent', persona: 'Calm guide' });

    const filled = await ingestPickedFiles({
      slot: 'agent',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/AGENTS.md` }],
      existing: [],
      fields: { name: 'Keep Name', handle: 'keep-handle', persona: 'Keep persona' },
      io,
    });
    expect(filled.mapped).toBeUndefined();
    expect(
      applyEmptyOnly(
        { name: 'Keep Name', handle: 'keep-handle', persona: 'Keep persona' },
        { name: 'Docs Agent', handle: 'docsagent', persona: 'Calm guide' },
      ),
    ).toEqual({});
  });

  it('default persona placeholder counts as empty for map; user-edited persona is not overwritten', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/AGENTS.md`, AGENT_MD);
    const result = await ingestPickedFiles({
      slot: 'agent',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/AGENTS.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: COPY.defaultNewBotPersona },
      io,
    });
    expect(isUnfilledAttachField('persona', COPY.defaultNewBotPersona)).toBe(true);
    expect(isUnfilledAttachField('persona', 'I wrote this persona')).toBe(false);
    expect(result.mapped).toEqual({
      name: 'Docs Agent',
      handle: 'docsagent',
      persona: 'Calm guide',
    });
    expect(
      applyEmptyOnly(
        { name: '', handle: '', persona: COPY.defaultNewBotPersona },
        { name: 'Docs Agent', handle: 'docsagent', persona: 'Calm guide' },
      ),
    ).toEqual({
      name: 'Docs Agent',
      handle: 'docsagent',
      persona: 'Calm guide',
    });
    expect(
      applyEmptyOnly(
        { name: '', handle: '', persona: 'I wrote this persona' },
        { name: 'Docs Agent', handle: 'docsagent', persona: 'Calm guide' },
      ),
    ).toEqual({
      name: 'Docs Agent',
      handle: 'docsagent',
    });
  });

  it('Agent second pick replaces and still leaves 0 or 1 agent', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/first.md`, '---\nname: First\nhandle: first\npersona: First persona\n---\n');
    io.put(`${WS}/second.md`, '---\nname: Second\nhandle: second\npersona: Second persona\n---\n');
    const first = await ingestPickedFiles({
      slot: 'agent',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/first.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(agentKindCount(first.attachments)).toBe(1);
    const second = await ingestPickedFiles({
      slot: 'agent',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/second.md` }],
      existing: first.attachments,
      fields: {
        name: first.mapped?.name ?? '',
        handle: first.mapped?.handle ?? '',
        persona: first.mapped?.persona ?? '',
      },
      io,
    });
    expect(second.added).toEqual([{ path: 'second.md', name: 'second.md' }]);
    expect(second.attachments.filter((a) => a.kind === 'agent')).toHaveLength(1);
    expect(agentKindCount(second.attachments)).toBe(1);
    expect(second.attachments.find((a) => a.kind === 'agent')?.path).toBe('second.md');
    expect(second.mapped).toBeUndefined();
  });

  it('replace remaps empty fields only from the new Agent file', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/first.md`, '---\nname: First\nhandle: first\n---\n');
    io.put(`${WS}/second.md`, '---\nname: Second\nhandle: second\npersona: From second\n---\n');
    const first = await ingestPickedFiles({
      slot: 'agent',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/first.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    const second = await ingestPickedFiles({
      slot: 'agent',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/second.md` }],
      existing: first.attachments,
      fields: { name: 'First', handle: 'first', persona: '' },
      io,
    });
    expect(second.mapped).toEqual({ persona: 'From second' });
  });

  it('.md under Scripts has kind scripts and does not map', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/scripts/note.md`, AGENT_MD);
    const result = await ingestPickedFiles({
      slot: 'scripts',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/scripts/note.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(result.attachments[0]?.kind).toBe('scripts');
    expect(result.mapped).toBeUndefined();
  });

  it('AGENTS.md under Skills does not map', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/skills/AGENTS.md`, AGENT_MD);
    const result = await ingestPickedFiles({
      slot: 'skills',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/skills/AGENTS.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(result.attachments[0]?.kind).toBe('skills');
    expect(result.mapped).toBeUndefined();
  });

  it('attaches scripts and hooks snapshots without mapping, spawn, eval, or a hooks-runner', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/scripts/setup.sh`, 'echo hello\n');
    io.put(`${WS}/hooks/pre.py`, 'print("hi")\n');
    const scripts = await ingestPickedFiles({
      slot: 'scripts',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/scripts/setup.sh` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    const hooks = await ingestPickedFiles({
      slot: 'hooks',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/hooks/pre.py` }],
      existing: scripts.attachments,
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(scripts.attachments[0]?.kind).toBe('scripts');
    expect(hooks.attachments.map((a) => a.kind)).toEqual(['scripts', 'hooks']);
    expect(scripts.mapped).toBeUndefined();
    expect(hooks.mapped).toBeUndefined();
    const src = srcOf(
      'src/app/bot-attach.ts',
      'src/adapters/bot-form-panel.ts',
      'src/app/token-governor.ts',
      'src/app/bot-registry.ts',
    );
    expect(src).not.toMatch(/\bspawn\b/);
    expect(src).not.toMatch(/\beval\b/);
    expect(src).not.toMatch(/hooks-runner/);
    expect(src).not.toMatch(/child_process/);
    expect(src).not.toMatch(/sendRequest/);
  });

  it('skips 262145 bytes with exact too large copy, continues the pick, and does not call Copilot', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/huge.md`, new Uint8Array(ATTACH_MAX_BYTES + 1));
    io.put(`${WS}/ok.txt`, 'small enough');
    const result = await ingestPickedFiles({
      slot: 'skills',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/huge.md` }, { absPath: `${WS}/ok.txt` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(result.skipped[0]?.message).toBe('Skipped huge.md · too large');
    expect(result.skipped[0]?.message.endsWith('too large')).toBe(true);
    expect(result.skipped[0]?.reason).toBe('too-large');
    expect(result.added).toEqual([{ path: 'ok.txt', name: 'ok.txt' }]);
    expect(result.attachments[0]?.kind).toBe('skills');
    expect(io.reads).not.toContain(`${WS}/huge.md`);
    expect(srcOf('src/app/bot-attach.ts')).not.toMatch(/sendRequest/);
  });

  it('skips binary, unreadable, and outside-workspace files with locked copy and continues', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/bin.dat`, new Uint8Array([0x41, 0x00, 0x42]));
    io.put(`${WS}/utf8.dat`, new Uint8Array([0xff, 0xfe, 0xfd]));
    io.put(`${WS}/bad.txt`, 'x');
    io.unreadable.add(`${WS}/bad.txt`);
    io.put(`${WS}/keep.md`, 'keep');
    const result = await ingestPickedFiles({
      slot: 'prompts',
      folderFsPath: WS,
      picked: [
        { absPath: `${WS}/bin.dat` },
        { absPath: `${WS}/utf8.dat` },
        { absPath: `${WS}/bad.txt` },
        { absPath: '/tmp/other/out.md' },
        { absPath: `${WS}/keep.md` },
      ],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(result.skipped.map((s) => s.message)).toEqual([
      'Skipped bin.dat · Binary file.',
      'Skipped utf8.dat · Binary file.',
      "Skipped bad.txt · Can't read this file.",
      'Skipped out.md · Not in this workspace.',
    ]);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'binary',
      'binary',
      'unreadable',
      'outside-workspace',
    ]);
    expect(result.added).toEqual([{ path: 'keep.md', name: 'keep.md' }]);
  });

  it('ignores a duplicate path in the same slot and allows the same path in two kinds', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/note.md`, 'one');
    const first = await ingestPickedFiles({
      slot: 'skills',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/note.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    const dup = await ingestPickedFiles({
      slot: 'skills',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/note.md` }],
      existing: first.attachments,
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(dup.added).toEqual([]);
    expect(dup.skipped).toEqual([]);
    expect(dup.attachments).toHaveLength(1);
    const otherKind = await ingestPickedFiles({
      slot: 'scripts',
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/note.md` }],
      existing: first.attachments,
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(otherKind.added).toEqual([{ path: 'note.md', name: 'note.md' }]);
    expect(otherKind.attachments).toHaveLength(2);
    expect(otherKind.attachments.map((a) => a.kind).sort()).toEqual(['scripts', 'skills']);
  });

  it('parses H1 when frontmatter is absent', () => {
    expect(parseAgentSnapshot('# Mapper\nRemaining body\n')).toEqual({
      name: 'Mapper',
      persona: 'Remaining body',
    });
  });

  it('ports always carry slot on added and skipped', () => {
    const msgs: HostToUi[] = [];
    emitAttachResult(
      'scripts',
      {
        added: [{ path: 'a.md', name: 'a.md' }],
        skipped: [{ name: 'huge.md', reason: 'too-large', message: 'Skipped huge.md · too large' }],
        attachments: [],
      },
      (msg) => msgs.push(msg),
    );
    expect(msgs).toEqual([
      { type: 'bots/attach-added', slot: 'scripts', files: [{ path: 'a.md', name: 'a.md' }] },
      {
        type: 'bots/attach-skipped',
        slot: 'scripts',
        name: 'huge.md',
        reason: 'too-large',
        message: 'Skipped huge.md · too large',
      },
    ]);
    const proto = readFileSync(join(__dirname, '../src/protocol/messages.ts'), 'utf8');
    expect(proto).toContain("type: 'bots/attach-pick'; slot: AttachmentKind");
    expect(proto).toContain("type: 'bots/attach-remove'; slot: AttachmentKind; path: string");
    expect(proto).not.toMatch(/type: 'bots\/attach-pick' \}/);
    const panel = readFileSync(join(__dirname, '../src/adapters/bot-form-panel.ts'), 'utf8');
    expect(panel).toContain('msg.slot');
    expect(panel).toContain('emitAttachResult(slot, result, emit)');
    expect(panel).toContain('removeAttachment(session.attachments, msg.slot, msg.path)');
    expect(panel).toContain('filters: options.filters');
  });
});

describe('bot record persist', () => {
  it('save with empty Agent succeeds and stores zero kind agent', async () => {
    const store = new MemoryStore();
    const registry = new BotRegistry(store, () => 'id-1', () => 't0');
    const created = await registry.create({
      name: 'Alpha',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      attachments: [{ path: 'note.md', name: 'note.md', snapshot: 'N', kind: 'skills' }],
    });
    expect(created.attachments?.some((a) => a.kind === 'agent')).toBe(false);
    expect(agentKindCount(created.attachments ?? [])).toBe(0);
    const empty = await registry.create({
      name: 'Beta',
      persona: 'p',
      role: 'r',
      instructions: 'i',
    });
    expect(empty.attachments).toEqual([]);
    expect(agentKindCount(empty.attachments ?? [])).toBe(0);
  });

  it('persists kind on create/update and reads missing attachments as []', async () => {
    const store = new MemoryStore();
    const registry = new BotRegistry(store, () => 'id-1', () => 't0');
    const created = await registry.create({
      name: 'Alpha',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      attachments: [{ path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'SNAP-1', kind: 'agent' }],
    });
    expect(created.attachments).toEqual([
      { path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'SNAP-1', kind: 'agent' },
    ]);
    const persisted = store.get<BotRecord[]>(BOTS_STATE_KEY);
    expect(persisted?.[0]?.attachments?.[0]?.kind).toBe('agent');
    expect(persisted?.[0]?.attachments?.[0]?.snapshot).toBe('SNAP-1');

    const updated = await registry.update(created.id, {
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      active: true,
      attachments: [{ path: 'note.md', name: 'note.md', snapshot: 'SNAP-2', kind: 'scripts' }],
    });
    expect(updated.attachments).toEqual([
      { path: 'note.md', name: 'note.md', snapshot: 'SNAP-2', kind: 'scripts' },
    ]);
    expect(agentKindCount(updated.attachments ?? [])).toBe(0);

    const legacy = new MemoryStore();
    await legacy.update(BOTS_STATE_KEY, [
      {
        id: 'old',
        handle: 'old',
        name: 'Old',
        persona: 'p',
        role: 'r',
        instructions: 'i',
        active: true,
        colorIndex: 0,
        createdAt: 't',
        updatedAt: 't',
      },
    ]);
    const loaded = new BotRegistry(legacy);
    expect(loaded.list()[0]!.attachments).toEqual([]);
    expect(attachmentsOf(loaded.list()[0])).toEqual([]);
  });

  it('does not infer kind on old records; missing kind does not occupy Agent; echo keeps them', async () => {
    const store = new MemoryStore();
    await store.update(BOTS_STATE_KEY, [
      {
        id: 'old',
        handle: 'old',
        name: 'Old',
        persona: 'p',
        role: 'r',
        instructions: 'i',
        active: true,
        colorIndex: 0,
        createdAt: 't',
        updatedAt: 't',
        attachments: [{ path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'LEGACY' }],
      },
    ]);
    const registry = new BotRegistry(store, () => 'id-2', () => 't1');
    const loaded = registry.list()[0]!;
    expect(loaded.attachments).toEqual([{ path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'LEGACY' }]);
    expect(loaded.attachments?.[0]?.kind).toBeUndefined();
    expect(agentKindCount(loaded.attachments ?? [])).toBe(0);
    expect(srcOf('src/domain/bot.ts', 'src/app/bot-attach.ts')).not.toMatch(/CLEARLY_AGENT_NAMES/);
    const echoed = await registry.update(loaded.id, {
      name: 'Old',
      handle: 'old',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      active: true,
      attachments: loaded.attachments,
    });
    expect(echoed.attachments).toEqual([{ path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'LEGACY' }]);
    expect(echoed.attachments?.[0]?.kind).toBeUndefined();
  });

  it('rejects a second Agent kind on Save', async () => {
    const registry = new BotRegistry(new MemoryStore(), () => 'id-1', () => 't0');
    await expect(
      registry.create({
        name: 'Alpha',
        persona: 'p',
        role: 'r',
        instructions: 'i',
        attachments: [
          { path: 'a.md', name: 'a.md', snapshot: 'A', kind: 'agent' },
          { path: 'b.md', name: 'b.md', snapshot: 'B', kind: 'agent' },
        ],
      }),
    ).rejects.toThrow(/at most one Agent/i);
  });

  it('handle collision on Save is a validation error and does not call Copilot', async () => {
    const { app, gw } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i' });
    await expect(
      app.createBot({
        name: 'Copy',
        handle: 'alpha',
        persona: 'p',
        role: 'r',
        instructions: 'i',
        attachments: [{ path: 'AGENTS.md', name: 'AGENTS.md', snapshot: 'x', kind: 'agent' }],
      }),
    ).rejects.toThrow(/@alpha is already taken/);
    expect(gw.requestCount).toBe(0);
    expect(gw.ensureCalls).toBe(0);
  });

  it('create/update accept the form attachments list and do not merge disk leftovers', async () => {
    const { app } = harness();
    const created = await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      attachments: [
        { path: 'a.md', name: 'a.md', snapshot: 'A', kind: 'skills' },
        { path: 'b.md', name: 'b.md', snapshot: 'B', kind: 'skills' },
      ],
    });
    await app.handleUi({
      type: 'bots/update',
      id: created.id,
      patch: {
        name: 'Alpha',
        handle: 'alpha',
        persona: 'p',
        role: 'r',
        instructions: 'i',
        attachments: [{ path: 'c.md', name: 'c.md', snapshot: 'C', kind: 'prompts' }],
      },
      active: true,
    });
    expect(app.registry.getById(created.id)?.attachments).toEqual([
      { path: 'c.md', name: 'c.md', snapshot: 'C', kind: 'prompts' },
    ]);
    expect(removeAttachment(created.attachments ?? [], 'skills', 'a.md').map((a) => a.path)).toEqual(['b.md']);
    expect(
      resolveFormAttachments([{ path: 'c.md', name: 'c.md', snapshot: '', kind: 'prompts' }], [
        { path: 'c.md', name: 'c.md', snapshot: 'FROM-SESSION', kind: 'prompts' },
      ]),
    ).toEqual([{ path: 'c.md', name: 'c.md', snapshot: 'FROM-SESSION', kind: 'prompts' }]);
  });
});

describe('TokenGovernor attachment extras', () => {
  const attached = bot({
    attachments: [
      { path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'SNAP-KEEP', kind: 'agent' },
      { path: 'notes.md', name: 'notes.md', snapshot: 'SNAP-TAIL', kind: 'skills' },
    ],
  });
  const other = bot({ id: '2', handle: 'beta', name: 'Beta', attachments: [] });
  const board = { ...emptyBoard(), goal: 'build the feature' };

  it('includes extras only on that bot’s debate/@/implementer pack and labels kind', async () => {
    const gov = new TokenGovernor();
    const debate = await gov.pack({
      bot: attached,
      kind: packKindFor('propose'),
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
    });
    expect(debate.ok).toBe(true);
    if (!debate.ok) {
      return;
    }
    const text = joined(debate.messages);
    expect(text).toContain(attachmentsBlock(attached.attachments ?? [])!);
    expect(text).toContain('Attached files');
    expect(text).toContain('AGENTS.md (docs/AGENTS.md) · agent');
    expect(text).toContain('notes.md (notes.md) · skills');
    expect(text).toContain('SNAP-KEEP');
    expect(attachmentPackLabel(attached.attachments![0]!)).toBe('AGENTS.md (docs/AGENTS.md) · agent');

    const direct = await gov.pack({
      bot: attached,
      kind: packKindFor('direct'),
      instruction: turnInstruction('direct', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
    });
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(joined(direct.messages)).toContain('SNAP-KEEP');
    }

    const implement = await gov.pack({
      bot: attached,
      kind: 'implement',
      instruction: turnInstruction('implement', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
      implementerFiles: [{ path: 'src/app.ts', content: 'export const n = 1;\n' }],
    });
    expect(implement.ok).toBe(true);
    if (implement.ok) {
      expect(joined(implement.messages)).toContain('SNAP-TAIL');
    }

    const otherPack = await gov.pack({
      bot: other,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
    });
    expect(otherPack.ok).toBe(true);
    if (otherPack.ok) {
      expect(joined(otherPack.messages)).not.toContain('SNAP-KEEP');
      expect(joined(otherPack.messages)).not.toContain('Attached files');
    }
  });

  it('packs old records missing kind without a kind tag and without counting them as Agent', async () => {
    const gov = new TokenGovernor();
    const legacy = bot({
      attachments: [{ path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'LEGACY-SNAP' }],
    });
    expect(agentKindCount(legacy.attachments ?? [])).toBe(0);
    expect(attachmentPackLabel(legacy.attachments![0]!)).toBe('AGENTS.md (docs/AGENTS.md)');
    const packed = await gov.pack({
      bot: legacy,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
    });
    expect(packed.ok).toBe(true);
    if (packed.ok) {
      const text = joined(packed.messages);
      expect(text).toContain('LEGACY-SNAP');
      expect(text).toContain('AGENTS.md (docs/AGENTS.md)');
      expect(text).not.toContain(' · agent');
      expect(text).not.toContain(' · skills');
    }
  });

  it('omits extras on vote and trims them silently before pack-overflow', async () => {
    const gov = new TokenGovernor();
    const vote = await gov.pack({
      bot: attached,
      kind: 'vote',
      instruction: turnInstruction('consensus', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
    });
    expect(vote.ok).toBe(true);
    if (vote.ok) {
      expect(joined(vote.messages)).not.toContain('Attached files');
      expect(joined(vote.messages)).not.toContain('SNAP-KEEP');
    }

    const keepHead = await gov.pack({
      bot: { ...attached, attachments: attached.attachments?.slice(0, 1) },
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
    });
    expect(keepHead.ok).toBe(true);
    if (!keepHead.ok) {
      return;
    }
    const dropTail = lenCounter(await lenCounter().countTokens(keepHead.messages));
    const trimmed = await gov.pack({
      bot: attached,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: dropTail,
      mcpContext: ['MCP-NOTE-' + 'Z'.repeat(80)],
    });
    expect(trimmed.ok).toBe(true);
    if (trimmed.ok) {
      const text = joined(trimmed.messages);
      expect(text).toContain('SNAP-KEEP');
      expect(text).not.toContain('SNAP-TAIL');
      expect(text).not.toContain('MCP-NOTE');
    }

    const overflow = await gov.pack({
      bot: attached,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(1),
    });
    expect(overflow).toEqual({ ok: false, overflow: true });
  });
});

describe('send uses snapshots, not live paths', () => {
  it('does not fs.readFile the attachment path on Send', async () => {
    const { app, gw, fs, msgs } = harness();
    await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'lead',
      instructions: 'i',
      attachments: [{ path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'SNAPSHOT-ONLY', kind: 'agent' }],
    });
    fs.files.set('docs/AGENTS.md', 'DISK-SHOULD-NOT-APPEAR');
    gw.script = ({ turn }) => {
      if (turn === 'direct') {
        return 'done\nNO_EDIT';
      }
      return 'ok';
    };
    await app.send('@alpha ship it');
    expect(gw.lastMessages.some((pack) => pack.some((m) => m.content.includes('SNAPSHOT-ONLY')))).toBe(
      true,
    );
    expect(gw.lastMessages.some((pack) => pack.some((m) => m.content.includes('DISK-SHOULD-NOT-APPEAR')))).toBe(
      false,
    );
    expect(fs.readTextCalls).not.toContain('docs/AGENTS.md');
    expect(msgs.filter((m) => m.type === 'bots/attach-skipped')).toEqual([]);
    expect(gw.requestCount).toBeGreaterThan(0);
  });
});

describe('settings sync stays off', () => {
  it('never calls setKeysForSync for bot keys and does not bump a store version', () => {
    const files = [
      'src/app/bot-registry.ts',
      'src/app/bot-attach.ts',
      'src/extension.ts',
      'src/domain/bot.ts',
    ];
    for (const file of files) {
      const text = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(text, file).not.toMatch(/setKeysForSync/);
      expect(text, file).not.toMatch(/BotStoreFile/);
    }
  });
});

describe('leftovers stay out', () => {
  it('does not mention leftovers 002/003/009/014 or Graphify in the host attach slice', () => {
    const src = srcOf(
      'src/app/bot-attach.ts',
      'src/domain/bot.ts',
      'src/app/token-governor.ts',
      'src/adapters/bot-form-panel.ts',
    );
    expect(src).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
    expect(src).not.toMatch(/Graphify/i);
  });
});
