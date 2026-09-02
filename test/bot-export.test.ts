import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import { BotRegistry } from '../src/app/bot-registry';
import {
  BOT_EXPORT_COMMANDS,
  BOT_EXPORT_FORMAT,
  EXPORT_FORMAT_PICKS,
  IMPORT_OPEN_DIALOG_OPTIONS,
  attachmentsFromExport,
  botsForExportSelf,
  botsFromTreeSelection,
  collisionChoicePrompt,
  defaultExportFilename,
  detectImportGate,
  encodeExport,
  exportBots,
  exportEntryFromBot,
  exportSaveFilters,
  FormExportSession,
  importBotEntries,
  importedToast,
  interpretDirtyExportPick,
  knownModelIdsForImport,
  parseBotExportText,
  resolveImportModelId,
  serializeBots,
  skipLine,
  takenFromBots,
  validateImportedHandle,
  type ExportDialogs,
  type ImportGate,
  type ImportUi,
} from '../src/app/bot-export';
import { COPY, BOTS_STATE_KEY } from '../src/app/copy';
import { ATTACH_MAX_BYTES, type BotDraft, type BotRecord } from '../src/domain/bot';
import type { HostToUi } from '../src/protocol/messages';
import {
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

function record(overrides: Partial<BotRecord> = {}): BotRecord {
  return {
    id: 'host-id',
    handle: 'alpha',
    name: 'Alpha',
    persona: 'calm',
    role: 'lead',
    instructions: 'be precise',
    active: true,
    colorIndex: 7,
    createdAt: 't0',
    updatedAt: 't1',
    attachments: [
      { kind: 'skills', path: 'docs/SKILLS.md', name: 'SKILLS.md', snapshot: 'skill text' },
    ],
    modelId: 'copilot/gpt-4.1',
    ...overrides,
  };
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

class RecordingUi implements ImportUi {
  choices: Array<'skip' | 'rename'> = [];
  handles: Array<string | undefined> = [];
  names: Array<string | undefined> = [];
  skips: string[] = [];
  chooseCalls: ImportGate[] = [];
  handlePrompts = 0;
  namePrompts = 0;

  async chooseSkipOrRename(gate: ImportGate): Promise<'skip' | 'rename'> {
    this.chooseCalls.push(gate);
    return this.choices.shift() ?? 'skip';
  }

  async promptHandle(
    _current: string,
    validate: (value: string) => string | undefined,
  ): Promise<string | undefined> {
    this.handlePrompts += 1;
    const next = this.handles.shift();
    if (next === undefined) {
      return undefined;
    }
    expect(validate(next)).toBeUndefined();
    return next;
  }

  async promptName(
    _current: string,
    validate: (value: string) => string | undefined,
  ): Promise<string | undefined> {
    this.namePrompts += 1;
    const next = this.names.shift();
    if (next === undefined) {
      return undefined;
    }
    expect(validate(next)).toBeUndefined();
    return next;
  }

  notifySkip(message: string): void {
    this.skips.push(message);
  }
}

function recordingDialogs(opts?: {
  format?: 'json' | 'yaml' | undefined;
  save?: boolean;
}): ExportDialogs & { formats: number; saves: string[]; toasts: string[] } {
  const out = {
    formats: 0,
    saves: [] as string[],
    toasts: [] as string[],
    async pickFormat() {
      out.formats += 1;
      return opts && 'format' in opts ? opts.format : 'json';
    },
    async saveFile(saveOpts: { defaultName: string; content: string }) {
      out.saves.push(saveOpts.defaultName);
      return opts?.save !== false;
    },
    showExported(n: number) {
      out.toasts.push(COPY.exported(n));
    },
  };
  return out;
}

describe('EX-1 writer envelope and filenames', () => {
  it('always emits format botrider.bots.v1 for one bot and for many', () => {
    const one = serializeBots([record()]);
    const many = serializeBots([record(), record({ handle: 'beta', name: 'Beta', id: '2' })]);
    expect(one).toEqual({ format: BOT_EXPORT_FORMAT, bots: [exportEntryFromBot(record())] });
    expect(many.format).toBe('botrider.bots.v1');
    expect(many.bots).toHaveLength(2);
    expect(JSON.parse(encodeExport(one, 'json')).format).toBe('botrider.bots.v1');
  });

  it('JSON and YAML round-trip the same entry fields; QuickPick default is JSON', () => {
    expect(EXPORT_FORMAT_PICKS[0]).toEqual({ label: 'JSON', format: 'json' });
    expect(EXPORT_FORMAT_PICKS[1]).toEqual({ label: 'YAML', format: 'yaml' });
    const file = serializeBots([record()]);
    const json = parseBotExportText(encodeExport(file, 'json'));
    const yml = parseBotExportText(encodeExport(file, 'yaml'));
    expect(json).toEqual({ ok: true, entries: file.bots });
    expect(yml).toEqual({ ok: true, entries: file.bots });
  });

  it('single filename is {handle}.bot.json|yaml; multi is bots.export.json|yaml', () => {
    expect(defaultExportFilename([record()], 'json')).toBe('alpha.bot.json');
    expect(defaultExportFilename([record()], 'yaml')).toBe('alpha.bot.yaml');
    expect(defaultExportFilename([record(), record({ handle: 'beta' })], 'json')).toBe('bots.export.json');
    expect(defaultExportFilename([record(), record({ handle: 'beta' })], 'yaml')).toBe('bots.export.yaml');
    expect(exportSaveFilters('json')).toEqual({ JSON: ['json'] });
    expect(exportSaveFilters('yaml')).toEqual({ YAML: ['yaml'] });
  });

  it('omits id, createdAt, updatedAt, colorIndex, SI session, transcript, and MCP pending', () => {
    const bloated = {
      ...record(),
      session: { botId: 'host-id', messages: [], inbox: [] },
      transcript: [{ role: 'user', content: 'hi' }],
      pendingMcp: [{ id: 'a' }],
    };
    const encoded = encodeExport(serializeBots([bloated]), 'json');
    const parsed = JSON.parse(encoded) as { bots: Record<string, unknown>[] };
    const entry = parsed.bots[0]!;
    expect(entry).not.toHaveProperty('id');
    expect(entry).not.toHaveProperty('createdAt');
    expect(entry).not.toHaveProperty('updatedAt');
    expect(entry).not.toHaveProperty('colorIndex');
    expect(entry).not.toHaveProperty('session');
    expect(entry).not.toHaveProperty('transcript');
    expect(entry).not.toHaveProperty('pendingMcp');
    expect(encoded).not.toMatch(/host-id|colorIndex|createdAt|updatedAt/);
    expect(entry.name).toBe('Alpha');
    expect(entry.handle).toBe('alpha');
    expect(entry.modelId).toBe('copilot/gpt-4.1');
    expect(entry.attachments).toEqual([
      { kind: 'skills', path: 'docs/SKILLS.md', name: 'SKILLS.md', snapshot: 'skill text' },
    ]);
  });

  it('zero bots / empty selection does not open the save dialog', async () => {
    const dialogs = recordingDialogs();
    const result = await exportBots({ bots: [], dialogs });
    expect(result.exported).toBe(0);
    expect(dialogs.formats).toBe(0);
    expect(dialogs.saves).toEqual([]);
    expect(dialogs.toasts).toEqual([]);
  });

  it('writes UTF-8 envelope then toasts Exported {n}.', async () => {
    const dialogs = recordingDialogs({ format: 'json' });
    const result = await exportBots({ bots: [record(), record({ handle: 'beta', name: 'Beta' })], dialogs });
    expect(result.exported).toBe(2);
    expect(dialogs.saves).toEqual(['bots.export.json']);
    expect(dialogs.toasts).toEqual(['Exported 2.']);
    expect(COPY.exported(1)).toBe('Exported 1.');
  });
});

describe('EX-2 reader shapes and create path', () => {
  it('accepts envelope, bare object, and bare list; unknown format rejects the file', () => {
    const entry = exportEntryFromBot(record());
    expect(parseBotExportText(JSON.stringify({ format: BOT_EXPORT_FORMAT, bots: [entry] }))).toEqual({
      ok: true,
      entries: [entry],
    });
    expect(parseBotExportText(JSON.stringify(entry))).toEqual({ ok: true, entries: [entry] });
    expect(parseBotExportText(JSON.stringify([entry, { ...entry, handle: 'beta' }]))).toEqual({
      ok: true,
      entries: [entry, { ...entry, handle: 'beta' }],
    });
    expect(parseBotExportText(JSON.stringify({ format: 'botrider.bots.v0', bots: [entry] }))).toEqual({
      ok: false,
      error: 'unreadable',
    });
    expect(parseBotExportText(JSON.stringify({ format: BOT_EXPORT_FORMAT }))).toEqual({
      ok: false,
      error: 'unreadable',
    });
    expect(parseBotExportText('{ not json')).toEqual({ ok: false, error: 'unreadable' });
    expect(COPY.unreadableBotFile).toBe("Couldn't read this bot file.");
  });

  it('empty bots[] creates nothing and is not an error', async () => {
    const parsed = parseBotExportText(JSON.stringify({ format: BOT_EXPORT_FORMAT, bots: [] }));
    expect(parsed).toEqual({ ok: true, entries: [] });
    const { app } = harness();
    const ui = new RecordingUi();
    const result = await importBotEntries({
      entries: parsed.ok ? parsed.entries : ['fail'],
      existing: app.registry.list(),
      knownModelIds: [],
      create: (draft) => app.createBot(draft),
      ui,
    });
    expect(result).toEqual({ imported: 0, skipped: 0 });
    expect(importedToast(0, 0)).toBeUndefined();
    expect(app.registry.list()).toEqual([]);
    expect(ui.skips).toEqual([]);
  });

  it('import calls create: new id, timestamps, next colorIndex; store version unchanged', async () => {
    const { app, store } = harness();
    const first = await app.createBot({
      name: 'Seed',
      handle: 'seed',
      persona: 'p',
      role: 'r',
      instructions: 'i',
    });
    expect(first.colorIndex).toBe(0);
    const ui = new RecordingUi();
    const before = store.get<BotRecord[]>(BOTS_STATE_KEY);
    await importBotEntries({
      entries: [
        {
          name: 'Imported',
          handle: 'imported',
          persona: 'p',
          role: 'r',
          instructions: 'i',
          active: true,
          id: 'FILE-ID',
          createdAt: 'FILE-CREATED',
          updatedAt: 'FILE-UPDATED',
          colorIndex: 99,
        },
      ],
      existing: app.registry.list(),
      knownModelIds: [],
      create: (draft) => app.createBot(draft),
      ui,
    });
    const created = app.registry.getByHandle('imported')!;
    expect(created.id).not.toBe('FILE-ID');
    expect(created.createdAt).not.toBe('FILE-CREATED');
    expect(created.updatedAt).not.toBe('FILE-UPDATED');
    expect(created.colorIndex).toBe(1);
    expect(created.colorIndex).not.toBe(99);
    expect(store.get<BotRecord[]>(BOTS_STATE_KEY)).toHaveLength((before?.length ?? 0) + 1);
    expect(src('src/app/bot-registry.ts')).not.toMatch(/BotStoreFile/);
    expect(src('src/app/bot-export.ts')).not.toMatch(/BotStoreFile/);
  });

  it('workspace is not required for the import picker', () => {
    expect(IMPORT_OPEN_DIALOG_OPTIONS.canSelectFiles).toBe(true);
    expect(IMPORT_OPEN_DIALOG_OPTIONS.canSelectFolders).toBe(false);
    expect(IMPORT_OPEN_DIALOG_OPTIONS.canSelectMany).toBe(false);
    expect(IMPORT_OPEN_DIALOG_OPTIONS.filters).toEqual({ JSON: ['json'], YAML: ['yaml', 'yml'] });
    expect(IMPORT_OPEN_DIALOG_OPTIONS).not.toHaveProperty('defaultUri');
  });
});

describe('EX-3 collision Skip / Rename', () => {
  it('handle taken → exact skip copy; record unchanged; never overwrite', async () => {
    const { app } = harness();
    const existing = await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'old',
      role: 'lead',
      instructions: 'keep',
    });
    const ui = new RecordingUi();
    ui.choices = ['skip'];
    const result = await importBotEntries({
      entries: [{ name: 'Alpha Prime', handle: 'alpha', persona: 'new', role: 'r', instructions: 'x', active: true }],
      existing: app.registry.list(),
      knownModelIds: [],
      create: (draft) => app.createBot(draft),
      ui,
    });
    expect(result).toEqual({ imported: 0, skipped: 1 });
    expect(ui.skips).toEqual(['Skipped @alpha · already taken.']);
    expect(skipLine({ kind: 'handle-taken', handle: 'alpha' })).toBe('Skipped @alpha · already taken.');
    const after = app.registry.getById(existing.id)!;
    expect(after.persona).toBe('old');
    expect(after.instructions).toBe('keep');
    expect(app.registry.list()).toHaveLength(1);
  });

  it('rename then create under the new handle; cancel rename = Skip', async () => {
    const { app } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i' });
    const renameUi = new RecordingUi();
    renameUi.choices = ['rename'];
    renameUi.handles = ['alpha-new'];
    await importBotEntries({
      entries: [{ name: 'Other', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i', active: true }],
      existing: app.registry.list(),
      knownModelIds: [],
      create: (draft) => app.createBot(draft),
      ui: renameUi,
    });
    expect(app.registry.getByHandle('alpha-new')?.name).toBe('Other');
    expect(app.registry.getByHandle('alpha')?.name).toBe('Alpha');

    const cancelUi = new RecordingUi();
    cancelUi.choices = ['rename'];
    cancelUi.handles = [undefined];
    const skipped = await importBotEntries({
      entries: [{ name: 'Third', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i', active: true }],
      existing: app.registry.list(),
      knownModelIds: [],
      create: (draft) => app.createBot(draft),
      ui: cancelUi,
    });
    expect(skipped).toEqual({ imported: 0, skipped: 1 });
    expect(cancelUi.skips).toEqual(['Skipped @alpha · already taken.']);
    expect(app.registry.list()).toHaveLength(2);
  });

  it('never auto-suffix on import (no uniqueHandle silent path)', async () => {
    expect(src('src/app/bot-export.ts')).not.toMatch(/uniqueHandle/);
    const registry = new BotRegistry(new MemoryStore());
    await registry.create({ name: 'Alpha', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i' });
    const ui = new RecordingUi();
    ui.choices = ['skip'];
    await importBotEntries({
      entries: [{ name: 'Alpha 2', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i', active: true }],
      existing: registry.list(),
      knownModelIds: [],
      create: (draft) => registry.create(draft),
      ui,
    });
    expect(registry.list().map((b) => b.handle)).toEqual(['alpha']);
    expect(registry.getByHandle('alpha-2')).toBeUndefined();
  });

  it('name-only collision uses exact copy; both collide prefer handle line; continue the list', async () => {
    expect(COPY.skipNameTaken('Alpha')).toBe('Skipped "Alpha" · a bot with that name already exists.');
    const { app } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i' });
    const nameOnly = detectImportGate(
      { name: 'Alpha', handle: 'gamma' },
      takenFromBots(app.registry.list()),
    );
    expect(nameOnly).toEqual({ kind: 'name-taken', name: 'Alpha' });
    expect(skipLine(nameOnly!)).toBe('Skipped "Alpha" · a bot with that name already exists.');

    const both = detectImportGate(
      { name: 'Alpha', handle: 'alpha' },
      takenFromBots(app.registry.list()),
    );
    expect(both).toEqual({ kind: 'handle-taken', handle: 'alpha' });
    expect(skipLine(both!)).toBe('Skipped @alpha · already taken.');
    expect(collisionChoicePrompt(both!)).toContain('@alpha');

    const ui = new RecordingUi();
    ui.choices = ['skip', 'skip'];
    const result = await importBotEntries({
      entries: [
        { name: 'Alpha', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i', active: true },
        { name: 'Alpha', handle: 'gamma', persona: 'p', role: 'r', instructions: 'i', active: true },
      ],
      existing: app.registry.list(),
      knownModelIds: [],
      create: (draft) => app.createBot(draft),
      ui,
    });
    expect(result).toEqual({ imported: 0, skipped: 2 });
    expect(ui.skips).toEqual([
      'Skipped @alpha · already taken.',
      'Skipped "Alpha" · a bot with that name already exists.',
    ]);
  });

  it('multi-import: skip one, import the next; same-file create counts as taken', async () => {
    const { app } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i' });
    const ui = new RecordingUi();
    ui.choices = ['skip'];
    const result = await importBotEntries({
      entries: [
        { name: 'Alpha', handle: 'alpha', persona: 'p', role: 'r', instructions: 'i', active: true },
        { name: 'Beta', handle: 'beta', persona: 'p', role: 'r', instructions: 'i', active: true },
        { name: 'Beta Two', handle: 'beta', persona: 'p', role: 'r', instructions: 'i', active: true },
      ],
      existing: app.registry.list(),
      knownModelIds: [],
      create: (draft) => app.createBot(draft),
      ui,
    });
    expect(result).toEqual({ imported: 1, skipped: 2 });
    expect(COPY.imported(1, 2)).toBe('Imported 1 · skipped 2.');
    expect(COPY.imported(0, 2)).toBe('Imported 0 · skipped 2.');
    expect(COPY.imported(1)).toBe('Imported 1.');
    expect(app.registry.getByHandle('beta')?.name).toBe('Beta');
    expect(ui.skips[0]).toBe('Skipped @alpha · already taken.');
    expect(ui.skips[1]).toBe('Skipped @beta · already taken.');
  });

  it('invalid handle and empty name use exact skip copy', async () => {
    const { app } = harness();
    const ui = new RecordingUi();
    ui.choices = ['skip', 'skip'];
    const result = await importBotEntries({
      entries: [
        { name: 'Ok', handle: 'Bad Handle', persona: 'p', role: 'r', instructions: 'i', active: true },
        { name: '', handle: 'okhandle', persona: 'p', role: 'r', instructions: 'i', active: true },
      ],
      existing: app.registry.list(),
      knownModelIds: [],
      create: (draft) => app.createBot(draft),
      ui,
    });
    expect(result).toEqual({ imported: 0, skipped: 2 });
    expect(ui.skips).toEqual(['Skipped @Bad Handle · invalid handle.', 'Skipped · name is required.']);
    expect(validateImportedHandle('', takenFromBots([]))).toBe('Handle is required.');
    expect(validateImportedHandle('Bad Handle', takenFromBots([]))).toBe(
      'Use a–z, 0–9, hyphen, or underscore. Start with a letter or number.',
    );
  });
});

describe('EX-4 safety, modelId, attachments, protocol', () => {
  it('modelId kept if in discovery else unset; import does not block; no sendRequest', async () => {
    const { app, gw } = harness();
    const ui = new RecordingUi();
    await importBotEntries({
      entries: [
        {
          name: 'Keep',
          handle: 'keep',
          persona: 'p',
          role: 'r',
          instructions: 'i',
          active: true,
          modelId: 'copilot/gpt-4.1',
        },
        {
          name: 'Drop',
          handle: 'drop',
          persona: 'p',
          role: 'r',
          instructions: 'i',
          active: true,
          modelId: 'copilot/gone',
        },
      ],
      existing: [],
      knownModelIds: ['copilot/gpt-4.1'],
      create: (draft) => app.createBot(draft),
      ui,
    });
    expect(app.registry.getByHandle('keep')?.modelId).toBe('copilot/gpt-4.1');
    expect(app.registry.getByHandle('drop')?.modelId).toBeUndefined();
    expect(resolveImportModelId('copilot/gone', ['copilot/gpt-4.1'])).toBeUndefined();
    expect(gw.requestCount).toBe(0);
    expect(gw.ensureCalls).toBe(0);
    expect(src('src/app/bot-export.ts')).not.toMatch(/selectChatModels/);
    expect(src('src/app/bot-export.ts')).not.toMatch(/sendRequest/);
    expect(src('src/app/bot-export.ts')).not.toMatch(/discoverCopilotModels/);
    expect(src('src/extension.ts')).toMatch(/knownModelIdsForImport\(app\.gateway\)/);
    expect(src('src/extension.ts')).not.toMatch(/knownModelIds:\s*\[\s*\]/);
  });

  it('attachments keep kind + path label + snapshot; never fs.readFile; never execute; extras dropped', () => {
    const fs = new MemoryFs();
    fs.files.set('docs/HOOKS.md', 'DISK-SHOULD-NOT-APPEAR');
    const { attachments, skips } = attachmentsFromExport([
      { kind: 'hooks', path: 'docs/HOOKS.md', name: 'HOOKS.md', snapshot: 'SNAP-ONLY' },
      { kind: 'not-a-slot', path: 'x', name: 'x', snapshot: 'drop me' },
      { kind: 'agent', path: 'a.md', name: 'a.md', snapshot: 'first agent' },
      { kind: 'agent', path: 'b.md', name: 'b.md', snapshot: 'extra agent' },
      { path: 'pack.md', name: 'pack.md', snapshot: 'untyped extra' },
    ]);
    expect(skips).toEqual([]);
    expect(attachments).toEqual([
      { kind: 'hooks', path: 'docs/HOOKS.md', name: 'HOOKS.md', snapshot: 'SNAP-ONLY' },
      { kind: 'agent', path: 'a.md', name: 'a.md', snapshot: 'first agent' },
      { path: 'pack.md', name: 'pack.md', snapshot: 'untyped extra' },
    ]);
    expect(fs.readTextCalls).toEqual([]);
    expect(src('src/app/bot-export.ts')).not.toMatch(/parseAgentSnapshot/);
    expect(src('src/app/bot-export.ts')).not.toMatch(/fs\.readFile/);
    expect(src('src/app/bot-export.ts')).not.toMatch(/child_process|spawn\(|exec\(|eval\(|hooks-runner/);
    expect(src('src/app/bot-export.ts')).not.toMatch(/map-from-file|mapFromFile/);
  });

  it('YAML safe-load only; custom tags do not execute', () => {
    let ran = false;
    (globalThis as { __botExportPwn?: () => void }).__botExportPwn = () => {
      ran = true;
    };
    const malicious = '!!js/function "function () { globalThis.__botExportPwn() }"\n';
    expect(parseBotExportText(malicious)).toEqual({ ok: false, error: 'unreadable' });
    expect(ran).toBe(false);
    expect(src('src/app/bot-export.ts')).toMatch(/CORE_SCHEMA/);
    expect(src('src/app/bot-export.ts')).not.toMatch(/DEFAULT_FULL_SCHEMA|js\/function|customTags/);
    delete (globalThis as { __botExportPwn?: () => void }).__botExportPwn;
  });

  it('oversize snapshot skips that attachment with too large; bot still created', async () => {
    const { app } = harness();
    const ui = new RecordingUi();
    const huge = 'x'.repeat(ATTACH_MAX_BYTES + 1);
    const result = await importBotEntries({
      entries: [
        {
          name: 'Big',
          handle: 'big',
          persona: 'p',
          role: 'r',
          instructions: 'i',
          active: true,
          attachments: [
            { kind: 'scripts', path: 'run.sh', name: 'run.sh', snapshot: huge },
            { kind: 'skills', path: 'ok.md', name: 'ok.md', snapshot: 'small' },
          ],
        },
      ],
      existing: [],
      knownModelIds: [],
      create: (draft) => app.createBot(draft),
      ui,
    });
    expect(result).toEqual({ imported: 1, skipped: 0 });
    expect(ui.skips).toEqual(['Skipped run.sh · too large']);
    const bot = app.registry.getByHandle('big')!;
    expect(bot.attachments).toEqual([{ kind: 'skills', path: 'ok.md', name: 'ok.md', snapshot: 'small' }]);
  });

  it('no API keys in payload; Settings Sync stays off', () => {
    const encoded = encodeExport(serializeBots([record()]), 'json');
    expect(encoded.toLowerCase()).not.toMatch(/api[_-]?key|secret|token/);
    expect(src('src/app/bot-export.ts')).not.toMatch(/setKeysForSync/);
    expect(src('src/extension.ts')).not.toMatch(/setKeysForSync/);
    expect(src('src/app/bot-registry.ts')).not.toMatch(/setKeysForSync/);
  });

  it('form Export: dirty modal three-way; export-self draft does not persist a New Bot', async () => {
    expect(COPY.dirtyExportPrompt).toBe('Save before export?');
    expect(interpretDirtyExportPick('Save')).toBe('save');
    expect(interpretDirtyExportPick('Export without saving')).toBe('export-without-saving');
    expect(interpretDirtyExportPick('Cancel')).toBe('cancel');
    expect(interpretDirtyExportPick(undefined)).toBe('cancel');
    const { app } = harness();
    const draft = {
      name: 'Drafty',
      handle: 'drafty',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      active: true,
    };
    const bots = botsForExportSelf(undefined, draft);
    expect(bots).toEqual([draft]);
    const dialogs = recordingDialogs();
    await exportBots({ bots, dialogs });
    expect(app.registry.list()).toEqual([]);
    expect(app.registry.getByHandle('drafty')).toBeUndefined();
    expect(botsForExportSelf(record(), undefined)[0]?.handle).toBe('alpha');
  });

  it('bots/export-self is the only new protocol member; no new HostToUi; no Swarm messages', () => {
    const proto = src('src/protocol/messages.ts');
    expect(proto).toMatch(/type: 'bots\/export-self'/);
    expect(proto).not.toMatch(/bots\/export-progress/);
    expect(proto).not.toMatch(/swarm\/export/);
    const hostStart = proto.indexOf('export type HostToUi');
    const hostEnd = proto.indexOf('export type UiToHost');
    const hostToUi = proto.slice(hostStart, hostEnd);
    expect(hostToUi).not.toMatch(/export-self|export-progress/);
    const uiToHost = proto.slice(hostEnd);
    expect(uiToHost.match(/type: '/g)?.length).toBeGreaterThan(0);
    expect((uiToHost.match(/bots\/export/g) ?? []).length).toBe(1);
    expect(src('src/adapters/chat-view.ts')).not.toMatch(/export-self/);
    expect(src('media/chat.js')).not.toMatch(/export-self|Export All|botRider\.bots\.export/);
    expect(src('src/adapters/bot-form-panel.ts')).toMatch(/bots\/export-self/);
    expect(src('src/app/application.ts')).toMatch(/case 'bots\/export-self'/);
  });

  it('tree canSelectMany selection (not checkboxes) feeds Export Selected', () => {
    expect(src('src/extension.ts')).toMatch(/canSelectMany:\s*true/);
    expect(src('src/extension.ts')).toMatch(/botsFromTreeSelection\(botsView\.selection\)/);
    expect(src('src/extension.ts')).not.toMatch(/exportSelected[\s\S]{0,200}checkboxState/);
    const selected = botsFromTreeSelection([
      { bot: record({ handle: 'sel', active: false }) },
      { bot: record({ handle: 'two', active: true }) },
    ]);
    expect(selected.map((b) => b.handle)).toEqual(['sel', 'two']);
    expect(selected[0]?.active).toBe(false);
  });

  it('registers locked camelCase commands', () => {
    const pkg = JSON.parse(src('package.json')) as {
      contributes: { commands: { command: string; title: string; icon?: string }[] };
    };
    const commands = pkg.contributes.commands;
    expect(BOT_EXPORT_COMMANDS).toEqual({
      export: 'botRider.bots.export',
      exportSelected: 'botRider.bots.exportSelected',
      exportAll: 'botRider.bots.exportAll',
      import: 'botRider.bots.import',
    });
    expect(commands.find((c) => c.command === 'botRider.bots.export')?.title).toBe('Export Bot');
    expect(commands.find((c) => c.command === 'botRider.bots.exportSelected')?.title).toBe('Export Selected');
    expect(commands.find((c) => c.command === 'botRider.bots.exportAll')?.title).toBe('Export All');
    expect(commands.find((c) => c.command === 'botRider.bots.import')).toMatchObject({
      title: 'Import',
      icon: '$(desktop-download)',
    });
    const ext = src('src/extension.ts');
    expect(ext).toContain("BOT_EXPORT_COMMANDS.export");
    expect(ext).toContain("BOT_EXPORT_COMMANDS.import");
  });
});

describe('leftovers and frozen slices stay out', () => {
  it('does not mention leftovers, Graphify, F7 Event Bus, or Swarm chrome', () => {
    const files = ['src/app/bot-export.ts', 'src/extension.ts', 'src/adapters/bot-form-panel.ts'];
    for (const file of files) {
      const text = src(file);
      expect(text, file).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
      expect(text, file).not.toMatch(/Graphify/i);
      expect(text, file).not.toMatch(/Event Bus/);
    }
  });

  it('source hygiene: no Settings Sync, no Copilot on export/import host module', () => {
    const files = listSrcTs(join(root, 'src'));
    const exportMod = files.find((f) => f === 'src/app/bot-export.ts');
    expect(exportMod).toBeTruthy();
    const text = src('src/app/bot-export.ts');
    expect(text).not.toMatch(/setKeysForSync/);
    expect(text).not.toMatch(/authentication\.getSession/);
    expect(text).not.toMatch(/vscode\.lm/);
    expect(text).not.toMatch(/apiKey|API_KEY/);
  });

  it('export-self through Application is a no-op (form hub owns it)', async () => {
    const { app } = harness();
    await app.handleUi({
      type: 'bots/export-self',
      draft: { name: 'Nope', handle: 'nope', persona: 'p', role: 'r', instructions: 'i', active: true },
    });
    expect(app.registry.list()).toEqual([]);
  });
});

describe('import create uses explicit handle (BR-3 create path)', () => {
  it('free handle is used as-is after trim/lowercase; create is not update', async () => {
    const { app } = harness();
    const creates: BotDraft[] = [];
    const ui = new RecordingUi();
    await importBotEntries({
      entries: [{ name: 'Gamma', handle: 'Gamma', persona: 'p', role: 'r', instructions: 'i', active: false }],
      existing: [],
      knownModelIds: [],
      create: async (draft) => {
        creates.push(draft);
        return app.createBot(draft);
      },
      ui,
    });
    expect(creates[0]?.handle).toBe('gamma');
    expect(app.registry.getByHandle('gamma')?.active).toBe(false);
    expect(src('src/app/bot-export.ts')).not.toMatch(/\.update\(/);
    expect(src('src/extension.ts')).toMatch(/app\.createBot/);
  });
});

describe('FAIL: persist then export-self without draft', () => {
  function queuedSchedule() {
    const ticks: Array<() => void> = [];
    return {
      ticks,
      schedule: (fn: () => void) => {
        ticks.push(fn);
        return {
          cancel() {
            const i = ticks.indexOf(fn);
            if (i >= 0) {
              ticks.splice(i, 1);
            }
          },
        };
      },
      flush() {
        const pending = ticks.splice(0, ticks.length);
        for (const tick of pending) {
          tick();
        }
      },
    };
  }

  it('Dirty New Save-then-export writes the new persisted bot, not an empty envelope', async () => {
    const { app } = harness();
    const exported: ReturnType<typeof serializeBots>[] = [];
    let disposed = 0;
    const q = queuedSchedule();
    const hub = new FormExportSession(undefined, () => {
      disposed += 1;
    }, q.schedule);
    expect(src('src/adapters/bot-form-panel.ts')).toMatch(/let currentBot = bot/);

    const persist = hub.runPersist(async () => {
      const created = await app.createBot({
        name: 'Newbie',
        handle: 'newbie',
        persona: 'fresh',
        role: 'lead',
        instructions: 'go',
      });
      return app.registry.getByHandle(created.handle) ?? created;
    });
    const exportP = hub.exportSelf({
      lookup: (held) => (held ? app.registry.getById(held.id) : undefined),
      exportBots: async (bots) => {
        exported.push(serializeBots(bots));
      },
    });
    await persist;
    await exportP;
    expect(exported).toHaveLength(1);
    expect(exported[0]!.format).toBe('botrider.bots.v1');
    expect(exported[0]!.bots).toHaveLength(1);
    expect(exported[0]!.bots[0]).toMatchObject({ name: 'Newbie', handle: 'newbie', persona: 'fresh' });
    expect(exported[0]!.bots[0]).not.toHaveProperty('id');
    expect(app.registry.getByHandle('newbie')?.id).not.toBe('FILE-ID');
    expect(disposed).toBe(1);
    expect(q.ticks).toEqual([]);
  });

  it('Dirty Edit Save-then-export writes the updated persisted bot, not the open() snapshot', async () => {
    const { app } = harness();
    const opened = await app.createBot({
      name: 'Old',
      handle: 'oldie',
      persona: 'before',
      role: 'lead',
      instructions: 'v1',
    });
    const exported: ReturnType<typeof serializeBots>[] = [];
    const q = queuedSchedule();
    const hub = new FormExportSession(opened, () => undefined, q.schedule);
    await hub.runPersist(async () => {
      await app.updateBot(opened.id, {
        name: 'Old',
        handle: 'oldie',
        persona: 'after',
        role: 'lead',
        instructions: 'v2',
        active: true,
      });
      return app.registry.getById(opened.id);
    });
    await hub.exportSelf({
      lookup: (held) => (held ? app.registry.getById(held.id) : undefined),
      exportBots: async (bots) => {
        exported.push(serializeBots(bots));
      },
    });
    expect(exported[0]!.bots[0]).toMatchObject({ persona: 'after', instructions: 'v2', handle: 'oldie' });
    expect(exported[0]!.bots[0]?.persona).not.toBe('before');
    expect(hub.currentBot?.persona).toBe('after');
  });

  it('persist that would dispose still yields a file when export-self follows in the same turn', async () => {
    const { app } = harness();
    const exported: number[] = [];
    let disposed = 0;
    const q = queuedSchedule();
    const hub = new FormExportSession(undefined, () => {
      disposed += 1;
    }, q.schedule);
    const persist = hub.runPersist(async () =>
      app.createBot({ name: 'Same', handle: 'same', persona: 'p', role: 'r', instructions: 'i' }),
    );
    expect(disposed).toBe(0);
    const exportP = hub.exportSelf({
      lookup: (held) => (held ? app.registry.getById(held.id) : undefined),
      exportBots: async (bots) => {
        exported.push(bots.length);
      },
    });
    await persist;
    await exportP;
    expect(exported).toEqual([1]);
    expect(disposed).toBe(1);
    q.flush();
    expect(disposed).toBe(1);
  });

  it('Export without saving (draft) does not persist and does not dispose', async () => {
    const { app } = harness();
    let disposed = 0;
    const hub = new FormExportSession(undefined, () => {
      disposed += 1;
    });
    const files: string[] = [];
    await hub.exportSelf({
      draft: { name: 'Drafty', handle: 'drafty', persona: 'p', role: 'r', instructions: 'i', active: true },
      lookup: () => undefined,
      exportBots: async (bots) => {
        files.push(bots[0]!.handle);
      },
    });
    expect(files).toEqual(['drafty']);
    expect(app.registry.list()).toEqual([]);
    expect(disposed).toBe(0);
  });

  it('invalid persist posts no export and does not dispose', async () => {
    const { app } = harness();
    let disposed = 0;
    const exported: unknown[] = [];
    const hub = new FormExportSession(undefined, () => {
      disposed += 1;
    });
    const persist = hub.runPersist(async () => {
      await app.createBot({ name: '', handle: 'x', persona: 'p', role: 'r', instructions: 'i' });
      return undefined;
    });
    const exportP = hub.exportSelf({
      lookup: (held) => (held ? app.registry.getById(held.id) : undefined),
      exportBots: async (bots) => {
        exported.push(bots);
      },
    });
    await expect(persist).rejects.toThrow(/name/i);
    await exportP;
    expect(exported).toEqual([]);
    expect(disposed).toBe(0);
    expect(app.registry.list()).toEqual([]);
  });

  it('import keeps known modelId from host cache and unsets unknown; runImport is not hardcoded []', async () => {
    const { app, gw } = harness();
    gw.cachedCopilotModelIds = ['copilot/gpt-4.1', 'copilot/gpt-5'];
    const known = knownModelIdsForImport(gw);
    expect(known).toEqual(['copilot/gpt-4.1', 'copilot/gpt-5']);
    const ui = new RecordingUi();
    await importBotEntries({
      entries: [
        {
          name: 'Keep',
          handle: 'keep2',
          persona: 'p',
          role: 'r',
          instructions: 'i',
          active: true,
          modelId: 'copilot/gpt-5',
        },
        {
          name: 'Gone',
          handle: 'gone2',
          persona: 'p',
          role: 'r',
          instructions: 'i',
          active: true,
          modelId: 'copilot/missing',
        },
      ],
      existing: [],
      knownModelIds: known,
      create: (draft) => app.createBot(draft),
      ui,
    });
    expect(app.registry.getByHandle('keep2')?.modelId).toBe('copilot/gpt-5');
    expect(app.registry.getByHandle('gone2')?.modelId).toBeUndefined();
    expect(gw.requestCount).toBe(0);
    expect(gw.ensureCalls).toBe(0);
    expect(src('src/extension.ts')).toContain('knownModelIdsForImport(app.gateway)');
    expect(src('src/extension.ts')).not.toMatch(/knownModelIds:\s*\[\s*\]/);
    expect(src('src/extension.ts')).not.toMatch(/selectChatModels/);
    expect(src('src/app/bot-export.ts')).not.toMatch(/selectChatModels|sendRequest/);
  });
});
