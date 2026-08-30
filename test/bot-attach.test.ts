import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import {
  applyEmptyOnly,
  attachOpenDialogOptions,
  canMapClearlyAgent,
  ingestPickedFiles,
  isScriptOrHookPath,
  parseClearlyAgent,
  removeAttachment,
  resolveFormAttachments,
  shouldOpenAttachDialog,
  type AttachFileIo,
} from '../src/app/bot-attach';
import { BotRegistry } from '../src/app/bot-registry';
import { COPY, BOTS_STATE_KEY } from '../src/app/copy';
import { TokenGovernor, attachmentsBlock, packKindFor } from '../src/app/token-governor';
import { ATTACH_MAX_BYTES, attachmentsOf, type BotRecord } from '../src/domain/bot';
import { turnInstruction } from '../src/app/prompt-builder';
import type { HostToUi } from '../src/protocol/messages';
import { defaultWorkspace, FakeGateway, FixedWorkspace, MemoryFs, MemoryStore } from './fakes';
import { emptyBoard } from '../src/app/run-board';

const WS = '/tmp/bot-rider-ws';

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

describe('attach picker contract', () => {
  it('opens a multi-file workspace dialog and refuses when no folder', () => {
    expect(shouldOpenAttachDialog(undefined)).toBe(false);
    expect(shouldOpenAttachDialog('')).toBe(false);
    expect(shouldOpenAttachDialog(WS)).toBe(true);
    const opts = attachOpenDialogOptions(WS);
    expect(opts.canSelectMany).toBe(true);
    expect(opts.canSelectFiles).toBe(true);
    expect(opts.canSelectFolders).toBe(false);
    expect(opts.defaultUri.fsPath).toBe(WS);
    expect(opts.title).toBe('Attach workspace files');
  });
});

describe('snapshot ingest', () => {
  it('stores a workspace AGENTS.md snapshot with a relative path label', async () => {
    const io = new MemoryAttachIo();
    const abs = `${WS}/docs/AGENTS.md`;
    io.put(
      abs,
      '---\nname: Docs Agent\nhandle: DocsAgent\npersona: Calm guide\n---\nbody leftover\n',
    );
    const result = await ingestPickedFiles({
      folderFsPath: WS,
      picked: [{ absPath: abs }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(result.added).toEqual([{ path: 'docs/AGENTS.md', name: 'AGENTS.md' }]);
    expect(result.attachments[0]?.path).toBe('docs/AGENTS.md');
    expect(result.attachments[0]?.name).toBe('AGENTS.md');
    expect(result.attachments[0]?.snapshot).toContain('Calm guide');
    expect(result.mapped).toEqual({
      name: 'Docs Agent',
      handle: 'docsagent',
      persona: 'Calm guide',
    });
    expect(result.skipped).toEqual([]);
  });

  it('maps only the first clearly-agent file and never overwrites filled fields', async () => {
    const io = new MemoryAttachIo();
    io.put(
      `${WS}/AGENTS.md`,
      '---\nname: First\nhandle: first\npersona: First persona\n---\n',
    );
    io.put(`${WS}/skills/SKILL.md`, '# Second\nSecond persona from H1\n');
    const empty = await ingestPickedFiles({
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/AGENTS.md` }, { absPath: `${WS}/skills/SKILL.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(empty.mapped).toEqual({ name: 'First', handle: 'first', persona: 'First persona' });
    expect(empty.added.map((f) => f.path)).toEqual(['AGENTS.md', 'skills/SKILL.md']);

    const filled = await ingestPickedFiles({
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/AGENTS.md` }, { absPath: `${WS}/skills/SKILL.md` }],
      existing: [],
      fields: { name: 'Keep Name', handle: 'keep-handle', persona: 'Keep persona' },
      io,
    });
    expect(filled.mapped).toBeUndefined();
    expect(applyEmptyOnly({ name: 'Keep Name', handle: 'keep-handle', persona: 'Keep persona' }, {
      name: 'First',
      handle: 'first',
      persona: 'First persona',
    })).toEqual({});
  });

  it('create default persona is empty so the first clearly-agent maps persona', async () => {
    const io = new MemoryAttachIo();
    io.put(
      `${WS}/AGENTS.md`,
      '---\nname: Docs Agent\nhandle: DocsAgent\npersona: Calm guide\n---\n',
    );
    const result = await ingestPickedFiles({
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/AGENTS.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: COPY.defaultNewBotPersona },
      io,
    });
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

  it('attaches scripts and hooks without mapping or executing', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/scripts/setup.sh`, 'echo hello\n');
    io.put(`${WS}/.husky/pre-commit`, 'npm test\n');
    io.put(`${WS}/hooks/AGENT.md`, '---\nname: Hooked\nhandle: hooked\n---\n');
    const result = await ingestPickedFiles({
      folderFsPath: WS,
      picked: [
        { absPath: `${WS}/scripts/setup.sh` },
        { absPath: `${WS}/.husky/pre-commit` },
        { absPath: `${WS}/hooks/AGENT.md` },
      ],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(result.added.map((f) => f.path)).toEqual([
      'scripts/setup.sh',
      '.husky/pre-commit',
      'hooks/AGENT.md',
    ]);
    expect(result.mapped).toBeUndefined();
    expect(isScriptOrHookPath('scripts/setup.sh')).toBe(true);
    expect(isScriptOrHookPath('.husky/pre-commit')).toBe(true);
    expect(isScriptOrHookPath('hooks/AGENT.md')).toBe(true);
    expect(canMapClearlyAgent('hooks/AGENT.md')).toBe(false);
    const src = readFileSync(join(__dirname, '../src/app/bot-attach.ts'), 'utf8');
    expect(src).not.toMatch(/\bspawn\b/);
    expect(src).not.toMatch(/\bexec\b/);
    expect(src).not.toMatch(/\beval\b/);
    expect(src).not.toMatch(/child_process/);
    expect(src).not.toMatch(/sendRequest/);
  });

  it('skips 262145 bytes with exact too large copy and continues the pick', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/huge.md`, new Uint8Array(ATTACH_MAX_BYTES + 1));
    io.put(`${WS}/ok.txt`, 'small enough');
    const result = await ingestPickedFiles({
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
    expect(io.reads).not.toContain(`${WS}/huge.md`);
  });

  it('skips binary, unreadable, and outside-workspace files with locked copy', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/bin.dat`, new Uint8Array([0x41, 0x00, 0x42]));
    io.put(`${WS}/utf8.dat`, new Uint8Array([0xff, 0xfe, 0xfd]));
    io.put(`${WS}/bad.txt`, 'x');
    io.unreadable.add(`${WS}/bad.txt`);
    io.put(`${WS}/keep.md`, 'keep');
    const result = await ingestPickedFiles({
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

  it('ignores a duplicate path on the same form', async () => {
    const io = new MemoryAttachIo();
    io.put(`${WS}/note.md`, 'one');
    const first = await ingestPickedFiles({
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/note.md` }],
      existing: [],
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    const second = await ingestPickedFiles({
      folderFsPath: WS,
      picked: [{ absPath: `${WS}/note.md` }],
      existing: first.attachments,
      fields: { name: '', handle: '', persona: '' },
      io,
    });
    expect(second.added).toEqual([]);
    expect(second.skipped).toEqual([]);
    expect(second.attachments).toHaveLength(1);
  });

  it('parses H1 when frontmatter is absent', () => {
    expect(parseClearlyAgent('# Mapper\nRemaining body\n')).toEqual({
      name: 'Mapper',
      persona: 'Remaining body',
    });
  });
});

describe('bot record persist', () => {
  it('persists attachments on create/update and reads missing as []', async () => {
    const store = new MemoryStore();
    const registry = new BotRegistry(store, () => 'id-1', () => 't0');
    const created = await registry.create({
      name: 'Alpha',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      attachments: [{ path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'SNAP-1' }],
    });
    expect(created.attachments).toEqual([
      { path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'SNAP-1' },
    ]);
    const persisted = store.get<BotRecord[]>(BOTS_STATE_KEY);
    expect(persisted?.[0]?.attachments?.[0]?.snapshot).toBe('SNAP-1');

    const updated = await registry.update(created.id, {
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      active: true,
      attachments: [{ path: 'note.md', name: 'note.md', snapshot: 'SNAP-2' }],
    });
    expect(updated.attachments).toEqual([{ path: 'note.md', name: 'note.md', snapshot: 'SNAP-2' }]);

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
        attachments: [{ path: 'AGENTS.md', name: 'AGENTS.md', snapshot: 'x' }],
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
        { path: 'a.md', name: 'a.md', snapshot: 'A' },
        { path: 'b.md', name: 'b.md', snapshot: 'B' },
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
        attachments: [{ path: 'c.md', name: 'c.md', snapshot: 'C' }],
      },
      active: true,
    });
    expect(app.registry.getById(created.id)?.attachments).toEqual([
      { path: 'c.md', name: 'c.md', snapshot: 'C' },
    ]);
    expect(removeAttachment(created.attachments ?? [], 'a.md').map((a) => a.path)).toEqual(['b.md']);
    expect(
      resolveFormAttachments([{ path: 'c.md', name: 'c.md', snapshot: '' }], [
        { path: 'c.md', name: 'c.md', snapshot: 'FROM-SESSION' },
      ]),
    ).toEqual([{ path: 'c.md', name: 'c.md', snapshot: 'FROM-SESSION' }]);
  });
});

describe('TokenGovernor attachment extras', () => {
  const attached = bot({
    attachments: [
      { path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'SNAP-KEEP' },
      { path: 'notes.md', name: 'notes.md', snapshot: 'SNAP-TAIL' },
    ],
  });
  const other = bot({ id: '2', handle: 'beta', name: 'Beta', attachments: [] });
  const board = { ...emptyBoard(), goal: 'build the feature' };

  it('includes extras only on that bot’s debate/@/implementer pack', async () => {
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
    expect(text).toContain('AGENTS.md (docs/AGENTS.md)');
    expect(text).toContain('SNAP-KEEP');

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
      attachments: [{ path: 'docs/AGENTS.md', name: 'AGENTS.md', snapshot: 'SNAPSHOT-ONLY' }],
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
  it('never calls setKeysForSync for bot keys', () => {
    const files = [
      'src/app/bot-registry.ts',
      'src/app/bot-attach.ts',
      'src/extension.ts',
      'src/domain/bot.ts',
    ];
    for (const file of files) {
      const text = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(text, file).not.toMatch(/setKeysForSync/);
    }
  });
});
