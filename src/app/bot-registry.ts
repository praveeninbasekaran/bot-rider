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

  async create(draft: BotDraft): Promise<BotRecord> {
    const name = draft.name.trim();
    if (!name) {
      throw new BotRegistryError('Name is required.');
    }
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
    const next: BotRecord = {
      ...prev,
      active: active ?? !prev.active,
      updatedAt: this.now(),
    };
    this.bots[index] = next;
    await this.persist();
    return { ...next };
  }

  async delete(id: string): Promise<void> {
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
