import yaml from 'js-yaml';
import {
  ATTACH_MAX_BYTES,
  agentKindCount,
  attachmentsOf,
  isAttachmentKind,
  isValidHandle,
  normalizeModelId,
  type AttachmentKind,
  type BotAttachment,
  type BotDraft,
  type BotRecord,
} from '../domain/bot';
import { COPY } from './copy';

export const BOT_EXPORT_FORMAT = 'botrider.bots.v1';

export const BOT_EXPORT_COMMANDS = {
  export: 'botRider.bots.export',
  exportSelected: 'botRider.bots.exportSelected',
  exportAll: 'botRider.bots.exportAll',
  import: 'botRider.bots.import',
} as const;

export type ExportFormat = 'json' | 'yaml';

export type BotExportAttachment = {
  kind?: AttachmentKind;
  path: string;
  name: string;
  snapshot: string;
};

export type BotExportEntry = {
  name: string;
  handle: string;
  persona: string;
  role: string;
  instructions: string;
  active: boolean;
  modelId?: string | null;
  attachments?: BotExportAttachment[];
};

export type BotExportFileV1 = {
  format: typeof BOT_EXPORT_FORMAT;
  bots: BotExportEntry[];
};

export type ExportableBot = {
  name: string;
  handle: string;
  persona: string;
  role: string;
  instructions: string;
  active: boolean;
  modelId?: string | null;
  attachments?: BotAttachment[];
};

export type ImportGate =
  | { kind: 'empty-name' }
  | { kind: 'invalid-handle'; handle: string }
  | { kind: 'handle-taken'; handle: string }
  | { kind: 'name-taken'; name: string };

export type DirtyExportChoice = 'save' | 'export-without-saving' | 'cancel';

export const EXPORT_FORMAT_PICKS: { label: 'JSON' | 'YAML'; format: ExportFormat }[] = [
  { label: 'JSON', format: 'json' },
  { label: 'YAML', format: 'yaml' },
];

export const IMPORT_OPEN_DIALOG_OPTIONS: {
  canSelectFiles: true;
  canSelectFolders: false;
  canSelectMany: false;
  filters: { JSON: string[]; YAML: string[] };
} = {
  canSelectFiles: true,
  canSelectFolders: false,
  canSelectMany: false,
  filters: {
    JSON: ['json'],
    YAML: ['yaml', 'yml'],
  },
};

const YAML_DUMP_OPTS: yaml.DumpOptions = {
  schema: yaml.CORE_SCHEMA,
  noRefs: true,
  lineWidth: -1,
};

const YAML_LOAD_OPTS: yaml.LoadOptions = {
  schema: yaml.CORE_SCHEMA,
  json: true,
};

export function exportEntryFromBot(bot: ExportableBot): BotExportEntry {
  const entry: BotExportEntry = {
    name: bot.name,
    handle: bot.handle,
    persona: bot.persona,
    role: bot.role,
    instructions: bot.instructions,
    active: bot.active,
  };
  const modelId = normalizeModelId(bot.modelId);
  if (modelId) {
    entry.modelId = modelId;
  }
  const attachments = serializeAttachments(bot.attachments);
  if (attachments.length > 0) {
    entry.attachments = attachments;
  }
  return entry;
}

export function serializeBots(bots: ExportableBot[]): BotExportFileV1 {
  return {
    format: BOT_EXPORT_FORMAT,
    bots: bots.map(exportEntryFromBot),
  };
}

export function encodeExport(file: BotExportFileV1, format: ExportFormat): string {
  if (format === 'yaml') {
    return yaml.dump(file, YAML_DUMP_OPTS);
  }
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function defaultExportFilename(bots: ExportableBot[], format: ExportFormat): string {
  const ext = format === 'json' ? 'json' : 'yaml';
  if (bots.length === 1 && bots[0]?.handle) {
    return `${bots[0].handle}.bot.${ext}`;
  }
  return `bots.export.${ext}`;
}

export function exportSaveFilters(format: ExportFormat): Record<string, string[]> {
  return format === 'json' ? { JSON: ['json'] } : { YAML: ['yaml'] };
}

export function botsFromTreeSelection<T extends { bot: ExportableBot }>(selection: readonly T[]): ExportableBot[] {
  return selection.map((item) => item.bot);
}

/** Form Export: draft serializes only; omitted draft uses the persisted panel bot. */
export function botsForExportSelf(
  persisted: ExportableBot | undefined,
  draft?: ExportableBot,
): ExportableBot[] {
  if (draft) {
    return [draft];
  }
  return persisted ? [persisted] : [];
}

export type ScheduleMacrotask = (fn: () => void) => { cancel(): void };

export function scheduleMacrotask(fn: () => void): { cancel(): void } {
  const timer = setTimeout(fn, 0);
  return {
    cancel() {
      clearTimeout(timer);
    },
  };
}

export function knownModelIdsForImport(gateway: { cachedCopilotModelIds: readonly string[] }): readonly string[] {
  return gateway.cachedCopilotModelIds;
}

/**
 * Form hub persist → export-self without draft.
 * Save defers dispose so a same-click export-self can run first.
 * Draft export (Export without saving) does not persist and does not dispose.
 */
export class FormExportSession {
  currentBot: BotRecord | undefined;
  private persistTail: Promise<void> = Promise.resolve();
  private persistFailed = false;
  private pendingSaveDispose = false;
  private deferred: { cancel(): void } | undefined;

  constructor(
    initial: BotRecord | undefined,
    private readonly disposePanel: () => void,
    private readonly schedule: ScheduleMacrotask = scheduleMacrotask,
  ) {
    this.currentBot = initial;
  }

  async runPersist(work: () => Promise<BotRecord | undefined>): Promise<BotRecord | undefined> {
    this.persistFailed = false;
    let created: BotRecord | undefined;
    const run = this.persistTail.then(async () => {
      try {
        created = await work();
        if (created) {
          this.currentBot = created;
          this.deferDispose();
        }
      } catch (err) {
        this.persistFailed = true;
        throw err;
      }
    });
    this.persistTail = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
    return created;
  }

  async exportSelf(args: {
    draft?: ExportableBot;
    lookup: (bot: BotRecord | undefined) => BotRecord | undefined;
    exportBots: (bots: ExportableBot[]) => Promise<void>;
  }): Promise<void> {
    if (args.draft) {
      const bots = botsForExportSelf(undefined, args.draft);
      if (bots.length > 0) {
        await args.exportBots(bots);
      }
      return;
    }
    await this.persistTail;
    if (this.persistFailed) {
      return;
    }
    const closeAfter = this.pendingSaveDispose;
    this.cancelDeferred();
    const persisted = args.lookup(this.currentBot);
    const bots = botsForExportSelf(persisted, undefined);
    if (bots.length > 0) {
      await args.exportBots(bots);
    }
    if (closeAfter) {
      this.disposePanel();
    }
  }

  cancelImmediate(): void {
    this.cancelDeferred();
    this.disposePanel();
  }

  dropDeferred(): void {
    this.cancelDeferred();
  }

  private deferDispose(): void {
    this.cancelDeferred();
    this.pendingSaveDispose = true;
    this.deferred = this.schedule(() => {
      this.pendingSaveDispose = false;
      this.deferred = undefined;
      this.disposePanel();
    });
  }

  private cancelDeferred(): void {
    this.deferred?.cancel();
    this.deferred = undefined;
    this.pendingSaveDispose = false;
  }
}

export type ParseBotExportResult =
  | { ok: true; entries: unknown[] }
  | { ok: false; error: 'unreadable' };

export function parseBotExportText(text: string): ParseBotExportResult {
  const parsed = parseDocument(text);
  if (parsed === undefined) {
    return { ok: false, error: 'unreadable' };
  }
  return readExportShapes(parsed);
}

function parseDocument(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const loaded = yaml.load(text, YAML_LOAD_OPTS);
      if (loaded === undefined) {
        return undefined;
      }
      return loaded;
    } catch {
      return undefined;
    }
  }
}

export function readExportShapes(parsed: unknown): ParseBotExportResult {
  if (Array.isArray(parsed)) {
    return { ok: true, entries: parsed };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'unreadable' };
  }
  const obj = parsed as Record<string, unknown>;
  if (hasFormatKey(obj)) {
    if (obj.format !== BOT_EXPORT_FORMAT) {
      return { ok: false, error: 'unreadable' };
    }
    if (!Array.isArray(obj.bots)) {
      return { ok: false, error: 'unreadable' };
    }
    return { ok: true, entries: obj.bots };
  }
  if (typeof obj.name === 'string' && typeof obj.handle === 'string') {
    return { ok: true, entries: [obj] };
  }
  return { ok: false, error: 'unreadable' };
}

function hasFormatKey(obj: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(obj, 'format') && obj.format != null;
}

export function skipLine(gate: ImportGate): string {
  switch (gate.kind) {
    case 'handle-taken':
      return COPY.skipHandleTaken(gate.handle);
    case 'name-taken':
      return COPY.skipNameTaken(gate.name);
    case 'invalid-handle':
      return COPY.skipInvalidHandle(gate.handle);
    case 'empty-name':
      return COPY.skipNameRequired;
  }
}

export function collisionChoicePrompt(gate: ImportGate): string {
  switch (gate.kind) {
    case 'handle-taken':
      return `@${gate.handle} is already taken.`;
    case 'name-taken':
      return `A bot named "${gate.name}" already exists.`;
    case 'invalid-handle':
      return 'Use a–z, 0–9, hyphen, or underscore. Start with a letter or number.';
    case 'empty-name':
      return 'Name is required.';
  }
}

export function detectImportGate(
  entry: { name: string; handle: string },
  taken: { handles: Set<string>; names: Set<string> },
): ImportGate | undefined {
  if (!entry.name.trim()) {
    return { kind: 'empty-name' };
  }
  const handle = entry.handle.trim().toLowerCase();
  if (!isValidHandle(handle)) {
    return { kind: 'invalid-handle', handle: entry.handle.trim() };
  }
  if (taken.handles.has(handle)) {
    return { kind: 'handle-taken', handle };
  }
  if (taken.names.has(entry.name.trim().toLowerCase())) {
    return { kind: 'name-taken', name: entry.name.trim() };
  }
  return undefined;
}

export function interpretDirtyExportPick(pick: string | undefined): DirtyExportChoice {
  if (pick === COPY.dirtyExportSave) {
    return 'save';
  }
  if (pick === COPY.dirtyExportWithoutSaving) {
    return 'export-without-saving';
  }
  return 'cancel';
}

export function resolveImportModelId(
  raw: unknown,
  knownModelIds: readonly string[],
): string | undefined {
  const id = normalizeModelId(raw);
  if (!id) {
    return undefined;
  }
  return knownModelIds.includes(id) ? id : undefined;
}

export type ImportAttachmentResult = {
  attachments: BotAttachment[];
  skips: string[];
};

export function attachmentsFromExport(
  raw: unknown,
  notifyName = 'attachment',
): ImportAttachmentResult {
  if (!Array.isArray(raw)) {
    return { attachments: [], skips: [] };
  }
  const attachments: BotAttachment[] = [];
  const skips: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (row.kind !== undefined && row.kind !== null && !isAttachmentKind(row.kind)) {
      continue;
    }
    const name = typeof row.name === 'string' && row.name.trim() ? row.name : notifyName;
    const snapshot = typeof row.snapshot === 'string' ? row.snapshot : '';
    if (utf8Bytes(snapshot) > ATTACH_MAX_BYTES) {
      skips.push(COPY.attachSkipTooLarge(name));
      continue;
    }
    const pathLabel = typeof row.path === 'string' ? row.path : '';
    const next: BotAttachment = {
      path: pathLabel,
      name: typeof row.name === 'string' && row.name ? row.name : pathLabel || name,
      snapshot,
    };
    if (isAttachmentKind(row.kind)) {
      next.kind = row.kind;
    }
    attachments.push(next);
  }
  return { attachments: capAgentAttachments(attachments), skips };
}

function capAgentAttachments(attachments: BotAttachment[]): BotAttachment[] {
  if (agentKindCount(attachments) <= 1) {
    return attachments;
  }
  let seenAgent = false;
  return attachments.filter((item) => {
    if (item.kind !== 'agent') {
      return true;
    }
    if (seenAgent) {
      return false;
    }
    seenAgent = true;
    return true;
  });
}

export function takenFromBots(bots: { name: string; handle: string }[]): {
  handles: Set<string>;
  names: Set<string>;
} {
  return {
    handles: new Set(bots.map((b) => b.handle.trim().toLowerCase())),
    names: new Set(bots.map((b) => b.name.trim().toLowerCase())),
  };
}

function serializeAttachments(items?: BotAttachment[]): BotExportAttachment[] {
  return attachmentsOf({ attachments: items }).map((item) => {
    const next: BotExportAttachment = {
      path: item.path,
      name: item.name,
      snapshot: item.snapshot,
    };
    if (item.kind) {
      next.kind = item.kind;
    }
    return next;
  });
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export type ImportUi = {
  chooseSkipOrRename(gate: ImportGate): Promise<'skip' | 'rename'>;
  promptHandle(
    current: string,
    validate: (value: string) => string | undefined,
  ): Promise<string | undefined>;
  promptName(
    current: string,
    validate: (value: string) => string | undefined,
  ): Promise<string | undefined>;
  notifySkip(message: string): void;
};

export type ImportResult = {
  imported: number;
  skipped: number;
};

export async function importBotEntries(args: {
  entries: unknown[];
  existing: { name: string; handle: string }[];
  knownModelIds: readonly string[];
  create: (draft: BotDraft) => Promise<BotRecord>;
  ui: ImportUi;
}): Promise<ImportResult> {
  const taken = takenFromBots(args.existing);
  let imported = 0;
  let skipped = 0;
  for (const raw of args.entries) {
    const prepared = prepareImportEntry(raw, args.knownModelIds);
    for (const line of prepared.attachmentSkips) {
      args.ui.notifySkip(line);
    }
    const outcome = await resolveAndCreate(prepared.draft, taken, args.ui, args.create);
    if (outcome === 'imported') {
      imported += 1;
    } else {
      skipped += 1;
    }
  }
  return { imported, skipped };
}

type PreparedEntry = {
  draft: BotDraft;
  attachmentSkips: string[];
};

function prepareImportEntry(raw: unknown, knownModelIds: readonly string[]): PreparedEntry {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mapped = attachmentsFromExport(obj.attachments, typeof obj.name === 'string' ? obj.name : 'attachment');
  const draft: BotDraft = {
    name: typeof obj.name === 'string' ? obj.name : '',
    handle: typeof obj.handle === 'string' ? obj.handle.trim() : '',
    persona: typeof obj.persona === 'string' ? obj.persona : '',
    role: typeof obj.role === 'string' ? obj.role : '',
    instructions: typeof obj.instructions === 'string' ? obj.instructions : '',
    active: typeof obj.active === 'boolean' ? obj.active : true,
    attachments: mapped.attachments,
  };
  const modelId = resolveImportModelId(obj.modelId, knownModelIds);
  if (modelId) {
    draft.modelId = modelId;
  }
  return { draft, attachmentSkips: mapped.skips };
}

async function resolveAndCreate(
  draft: BotDraft,
  taken: { handles: Set<string>; names: Set<string> },
  ui: ImportUi,
  create: (draft: BotDraft) => Promise<BotRecord>,
): Promise<'imported' | 'skipped'> {
  let current = { ...draft };
  for (let i = 0; i < 32; i++) {
    const gate = detectImportGate(
      { name: current.name, handle: current.handle ?? '' },
      taken,
    );
    if (!gate) {
      const created = await create({
        ...current,
        handle: (current.handle ?? '').trim().toLowerCase(),
      });
      taken.handles.add(created.handle.toLowerCase());
      taken.names.add(created.name.toLowerCase());
      return 'imported';
    }
    const choice = await ui.chooseSkipOrRename(gate);
    if (choice !== 'rename') {
      ui.notifySkip(skipLine(gate));
      return 'skipped';
    }
    const renamed = await promptRename(gate, current, taken, ui);
    if (!renamed) {
      ui.notifySkip(skipLine(gate));
      return 'skipped';
    }
    current = renamed;
  }
  ui.notifySkip(skipLine({ kind: 'empty-name' }));
  return 'skipped';
}

async function promptRename(
  gate: ImportGate,
  draft: BotDraft,
  taken: { handles: Set<string>; names: Set<string> },
  ui: ImportUi,
): Promise<BotDraft | undefined> {
  let next = { ...draft };
  if (gate.kind === 'empty-name' || gate.kind === 'name-taken') {
    const name = await ui.promptName(draft.name, (value) => validateImportedName(value, taken));
    if (name === undefined) {
      return undefined;
    }
    next = { ...next, name };
  }
  if (gate.kind === 'invalid-handle' || gate.kind === 'handle-taken') {
    const handle = await ui.promptHandle(draft.handle ?? '', (value) =>
      validateImportedHandle(value, taken),
    );
    if (handle === undefined) {
      return undefined;
    }
    next = { ...next, handle };
  }
  return next;
}

export function validateImportedHandle(
  value: string,
  taken: { handles: Set<string> },
): string | undefined {
  const handle = value.trim().toLowerCase();
  if (!handle) {
    return 'Handle is required.';
  }
  if (!isValidHandle(handle)) {
    return 'Use a–z, 0–9, hyphen, or underscore. Start with a letter or number.';
  }
  if (taken.handles.has(handle)) {
    return `@${handle} is already taken.`;
  }
  return undefined;
}

export function validateImportedName(
  value: string,
  taken: { names: Set<string> },
): string | undefined {
  const name = value.trim();
  if (!name) {
    return 'Name is required.';
  }
  if (taken.names.has(name.toLowerCase())) {
    return `A bot named "${name}" already exists.`;
  }
  return undefined;
}

export type ExportDialogs = {
  pickFormat(): Promise<ExportFormat | undefined>;
  saveFile(opts: { defaultName: string; format: ExportFormat; content: string }): Promise<boolean>;
  showExported(n: number): void;
};

export async function exportBots(args: {
  bots: ExportableBot[];
  dialogs: ExportDialogs;
}): Promise<{ exported: number }> {
  if (args.bots.length === 0) {
    return { exported: 0 };
  }
  const format = await args.dialogs.pickFormat();
  if (!format) {
    return { exported: 0 };
  }
  const file = serializeBots(args.bots);
  const content = encodeExport(file, format);
  const saved = await args.dialogs.saveFile({
    defaultName: defaultExportFilename(args.bots, format),
    format,
    content,
  });
  if (!saved) {
    return { exported: 0 };
  }
  args.dialogs.showExported(file.bots.length);
  return { exported: file.bots.length };
}

export function importedToast(imported: number, skipped: number): string | undefined {
  if (imported === 0 && skipped === 0) {
    return undefined;
  }
  return COPY.imported(imported, skipped);
}
