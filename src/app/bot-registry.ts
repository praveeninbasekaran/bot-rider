import {
  agentKindCount,
  attachmentsOf,
  copyBotRecord,
  copyDesignationFlag,
  normalizeModelId,
  type BotAttachment,
  type BotDraft,
  type BotRecord,
  deriveHandle,
  isValidHandle,
} from '../domain/bot';
import { CORE_BOT_PROFILES, type CoreBotKind } from '../domain/core-bot';
import { BOTS_STATE_KEY } from './copy';
import type { StateStore } from './ports';

export class BotRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotRegistryError';
  }
}

export class BotRegistry {
  private bots: BotRecord[] = [];

  constructor(
    private readonly store: StateStore,
    private readonly idFactory: () => string = () => crypto.randomUUID(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    const loaded = store.get<BotRecord[]>(BOTS_STATE_KEY);
    this.bots = Array.isArray(loaded) ? loaded.map((b) => copyBotRecord(b)) : [];
  }

  list(): BotRecord[] {
    return this.bots.map((b) => copyBotRecord(b));
  }

  snapshotActive(): BotRecord[] {
    return this.bots.filter((b) => b.active).map((b) => copyBotRecord(b));
  }

  getById(id: string): BotRecord | undefined {
    const found = this.bots.find((b) => b.id === id);
    return found ? copyBotRecord(found) : undefined;
  }

  getByHandle(handle: string): BotRecord | undefined {
    const key = handle.toLowerCase();
    const found = this.bots.find((b) => b.handle.toLowerCase() === key);
    return found ? copyBotRecord(found) : undefined;
  }

  async ensureCoreBots(): Promise<void> {
    const before = JSON.stringify(this.bots);
    const claimed = new Set<string>();
    for (const kind of ['spec', 'dispatcher'] as const) {
      const profile = CORE_BOT_PROFILES[kind];
      const candidate =
        this.bots.find((bot) => bot.coreKind === kind && !claimed.has(bot.id)) ??
        this.bots.find(
          (bot) =>
            !bot.coreKind &&
            !claimed.has(bot.id) &&
            (kind === 'spec' ? bot.spec === true : bot.dispatcher === true),
        ) ??
        this.bots.find(
          (bot) =>
            !bot.coreKind &&
            !claimed.has(bot.id) &&
            (bot.handle.toLowerCase() === profile.handle || bot.name.trim().toLowerCase() === profile.name.toLowerCase()),
        );
      const core = candidate ?? this.seedCoreBot(kind);
      claimed.add(core.id);
      core.coreKind = kind;
      core.active = true;
      core.role = profile.role;
      core.instructions = profile.instructions;
      if (kind === 'spec') {
        core.spec = true;
        delete core.dispatcher;
      } else {
        core.dispatcher = true;
        delete core.spec;
      }
    }
    for (const bot of this.bots) {
      if (claimed.has(bot.id)) {
        continue;
      }
      delete bot.coreKind;
      delete bot.spec;
      delete bot.dispatcher;
    }
    if (JSON.stringify(this.bots) !== before) {
      await this.persist();
    }
  }

  async create(draft: BotDraft): Promise<BotRecord> {
    const name = draft.name.trim();
    if (!name) {
      throw new BotRegistryError('Name is required.');
    }
    this.assertDesignationAvailable(draft.dispatcher, draft.spec);
    const handle = this.resolveCreateHandle(name, draft.handle);
    const ts = this.now();
    const bot: BotRecord = {
      id: this.idFactory(),
      handle,
      name,
      persona: draft.persona.trim(),
      role: draft.role.trim(),
      instructions: draft.instructions.trim(),
      active: draft.active ?? true,
      colorIndex: this.nextColorIndex(),
      createdAt: ts,
      updatedAt: ts,
      attachments: copyAttachments(draft.attachments),
    };
    const modelId = copyModelId(draft.modelId);
    if (modelId) {
      bot.modelId = modelId;
    }
    applyDesignation(bot, draft.dispatcher, draft.spec);
    this.bots.push(bot);
    await this.persist();
    return { ...bot };
  }

  async update(id: string, draft: BotDraft & { handle: string; active: boolean }): Promise<BotRecord> {
    const index = this.bots.findIndex((b) => b.id === id);
    if (index < 0) {
      throw new BotRegistryError('Bot not found.');
    }
    const handle = draft.handle.trim().toLowerCase();
    if (!isValidHandle(handle)) {
      throw new BotRegistryError(`Invalid handle "${handle}".`);
    }
    if (this.handleTaken(handle, id)) {
      throw new BotRegistryError(`Handle @${handle} is already in use.`);
    }
    const prev = this.bots[index]!;
    if (prev.coreKind) {
      const profile = CORE_BOT_PROFILES[prev.coreKind];
      const next: BotRecord = {
        ...prev,
        persona: draft.persona.trim(),
        attachments:
          draft.attachments !== undefined ? copyAttachments(draft.attachments) : attachmentsOf(prev),
        updatedAt: this.now(),
        active: true,
        role: profile.role,
        instructions: profile.instructions,
        dispatcher: prev.coreKind === 'dispatcher' ? true : undefined,
        spec: prev.coreKind === 'spec' ? true : undefined,
      };
      if (draft.modelId !== undefined) {
        const modelId = copyModelId(draft.modelId);
        if (modelId) {
          next.modelId = modelId;
        } else {
          delete next.modelId;
        }
      }
      this.bots[index] = next;
      await this.persist();
      return copyBotRecord(next);
    }
    this.assertDesignationAvailable(draft.dispatcher, draft.spec, id);
    const next: BotRecord = {
      ...prev,
      name: draft.name.trim(),
      handle,
      persona: draft.persona.trim(),
      role: draft.role.trim(),
      instructions: draft.instructions.trim(),
      active: draft.active,
      attachments:
        draft.attachments !== undefined ? copyAttachments(draft.attachments) : attachmentsOf(prev),
      updatedAt: this.now(),
    };
    if (draft.modelId !== undefined) {
      const modelId = copyModelId(draft.modelId);
      if (modelId) {
        next.modelId = modelId;
      } else {
        delete next.modelId;
      }
    }
    applyDesignation(next, draft.dispatcher, draft.spec);
    this.bots[index] = next;
    await this.persist();
    return { ...next };
  }

  async toggle(id: string, active?: boolean): Promise<BotRecord> {
    const index = this.bots.findIndex((b) => b.id === id);
    if (index < 0) {
      throw new BotRegistryError('Bot not found.');
    }
    const prev = this.bots[index]!;
    const wanted = active ?? !prev.active;
    if (prev.coreKind && !wanted) {
      throw new BotRegistryError(`${CORE_BOT_PROFILES[prev.coreKind].name} is a protected core bot and must stay active.`);
    }
    const next: BotRecord = {
      ...prev,
      active: wanted,
      updatedAt: this.now(),
    };
    this.bots[index] = next;
    await this.persist();
    return { ...next };
  }

  async delete(id: string): Promise<void> {
    const found = this.bots.find((bot) => bot.id === id);
    if (found?.coreKind) {
      throw new BotRegistryError(`${CORE_BOT_PROFILES[found.coreKind].name} is a protected core bot and cannot be deleted.`);
    }
    const next = this.bots.filter((b) => b.id !== id);
    if (next.length === this.bots.length) {
      throw new BotRegistryError('Bot not found.');
    }
    this.bots = next;
    await this.persist();
  }

  private handleTaken(handle: string, exceptId?: string): boolean {
    return this.bots.some(
      (b) => b.handle.toLowerCase() === handle.toLowerCase() && b.id !== exceptId,
    );
  }

  private resolveCreateHandle(name: string, raw?: string): string {
    if (raw?.trim()) {
      const handle = raw.trim().toLowerCase();
      if (!isValidHandle(handle)) {
        throw new BotRegistryError(`Invalid handle "${handle}".`);
      }
      if (this.handleTaken(handle)) {
        throw new BotRegistryError(`@${handle} is already taken.`);
      }
      return handle;
    }
    const handle = this.uniqueHandle(deriveHandle(name));
    if (!isValidHandle(handle)) {
      throw new BotRegistryError(`Invalid handle "${handle}".`);
    }
    return handle;
  }

  uniqueHandle(base: string): string {
    let candidate = base.toLowerCase();
    if (!isValidHandle(candidate)) {
      candidate = deriveHandle(candidate);
    }
    if (!this.handleTaken(candidate)) {
      return candidate;
    }
    for (let n = 2; n < 10_000; n++) {
      const suffix = `-${n}`;
      const trimmed = candidate.slice(0, Math.max(1, 32 - suffix.length));
      let next = `${trimmed}${suffix}`;
      if (!isValidHandle(next)) {
        next = `bot${suffix}`.slice(0, 32);
      }
      if (!this.handleTaken(next) && isValidHandle(next)) {
        return next;
      }
    }
    throw new BotRegistryError('Could not allocate a unique handle.');
  }

  private nextColorIndex(): number {
    return this.bots.length;
  }

  private seedCoreBot(kind: CoreBotKind): BotRecord {
    const profile = CORE_BOT_PROFILES[kind];
    const ts = this.now();
    const bot: BotRecord = {
      id: this.idFactory(),
      handle: this.uniqueHandle(profile.handle),
      name: profile.name,
      persona: profile.persona,
      role: profile.role,
      instructions: profile.instructions,
      active: true,
      colorIndex: this.nextColorIndex(),
      createdAt: ts,
      updatedAt: ts,
      coreKind: kind,
      dispatcher: kind === 'dispatcher' ? true : undefined,
      spec: kind === 'spec' ? true : undefined,
    };
    this.bots.push(bot);
    return bot;
  }

  private assertDesignationAvailable(dispatcher?: boolean, spec?: boolean, exceptId?: string): void {
    if (
      (spec && this.bots.some((bot) => bot.id !== exceptId && bot.coreKind === 'spec')) ||
      (dispatcher && this.bots.some((bot) => bot.id !== exceptId && bot.coreKind === 'dispatcher'))
    ) {
      throw new BotRegistryError('Spec and Dispatcher designations belong to the protected core bots.');
    }
  }

  private async persist(): Promise<void> {
    await this.store.update(BOTS_STATE_KEY, this.list());
  }
}

function copyAttachments(items?: BotAttachment[]): BotAttachment[] {
  const next = attachmentsOf({ attachments: items });
  if (agentKindCount(next) > 1) {
    throw new BotRegistryError('A bot can have at most one Agent file.');
  }
  return next;
}

function copyModelId(value: unknown): string | undefined {
  return normalizeModelId(value) ?? undefined;
}

function applyDesignation(bot: BotRecord, dispatcher: unknown, spec: unknown): void {
  if (dispatcher !== undefined) {
    if (copyDesignationFlag(dispatcher)) {
      bot.dispatcher = true;
    } else {
      delete bot.dispatcher;
    }
  }
  if (spec !== undefined) {
    if (copyDesignationFlag(spec)) {
      bot.spec = true;
    } else {
      delete bot.spec;
    }
  }
}
