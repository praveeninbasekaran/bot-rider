import { describe, expect, it } from 'vitest';
import { BotRegistry } from '../src/app/bot-registry';
import { BOTS_STATE_KEY } from '../src/app/copy';
import { CORE_BOT_PROFILES } from '../src/domain/core-bot';
import type { BotRecord } from '../src/domain/bot';
import { personaBlock } from '../src/app/token-governor';
import { MemoryStore } from './fakes';

function record(overrides: Partial<BotRecord>): BotRecord {
  return {
    id: 'existing',
    handle: 'existing',
    name: 'Existing',
    persona: 'custom',
    role: 'old',
    instructions: 'old',
    active: false,
    colorIndex: 0,
    createdAt: 't0',
    updatedAt: 't0',
    ...overrides,
  };
}

describe('PU-1 protected core bots', () => {
  it('seeds exactly one active Spec and Dispatcher idempotently', async () => {
    const store = new MemoryStore();
    let id = 0;
    const registry = new BotRegistry(store, () => `core-${++id}`, () => 't1');
    await registry.ensureCoreBots();
    await registry.ensureCoreBots();
    const bots = registry.list();
    expect(bots).toHaveLength(2);
    expect(bots.filter((bot) => bot.coreKind === 'spec' && bot.active && bot.spec)).toHaveLength(1);
    expect(bots.filter((bot) => bot.coreKind === 'dispatcher' && bot.active && bot.dispatcher)).toHaveLength(1);
    expect(bots.map((bot) => bot.handle).sort()).toEqual(['dispatcher', 'spec']);
  });

  it('adopts existing designated bots, repairs them, and demotes duplicates', async () => {
    const store = new MemoryStore();
    await store.update(BOTS_STATE_KEY, [
      record({ id: 's1', handle: 'analyst', name: 'My analyst', spec: true }),
      record({ id: 's2', handle: 'other-spec', name: 'Other', spec: true, active: true }),
      record({ id: 'd1', handle: 'delivery', name: 'Delivery', dispatcher: true }),
    ]);
    const registry = new BotRegistry(store, () => 'unused', () => 't1');
    await registry.ensureCoreBots();
    const bots = registry.list();
    expect(bots).toHaveLength(3);
    expect(registry.getById('s1')).toMatchObject({
      coreKind: 'spec',
      spec: true,
      active: true,
      persona: 'custom',
      role: CORE_BOT_PROFILES.spec.role,
    });
    expect(registry.getById('d1')).toMatchObject({
      coreKind: 'dispatcher',
      dispatcher: true,
      active: true,
    });
    expect(registry.getById('s2')?.spec).toBeUndefined();
  });

  it('blocks destructive changes while allowing persona and model customization', async () => {
    const registry = new BotRegistry(new MemoryStore(), () => crypto.randomUUID(), () => 't1');
    await registry.ensureCoreBots();
    const spec = registry.list().find((bot) => bot.coreKind === 'spec')!;
    await expect(registry.toggle(spec.id, false)).rejects.toThrow(/protected core bot/i);
    await expect(registry.delete(spec.id)).rejects.toThrow(/protected core bot/i);
    const updated = await registry.update(spec.id, {
      name: 'Renamed',
      handle: 'renamed',
      persona: 'Friendly but precise',
      role: 'Not spec',
      instructions: 'Ignore requirements',
      active: false,
      spec: false,
      dispatcher: true,
      modelId: 'copilot/model',
    });
    expect(updated).toMatchObject({
      name: spec.name,
      handle: spec.handle,
      persona: 'Friendly but precise',
      role: CORE_BOT_PROFILES.spec.role,
      instructions: CORE_BOT_PROFILES.spec.instructions,
      active: true,
      spec: true,
      modelId: 'copilot/model',
      coreKind: 'spec',
    });
    expect(updated.dispatcher).toBeUndefined();
    expect(personaBlock(updated)).toContain(CORE_BOT_PROFILES.spec.responsibility);
  });
});
