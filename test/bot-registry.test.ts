import { describe, expect, it } from 'vitest';
import { BotRegistry } from '../src/app/bot-registry';
import { FakeGateway, MemoryStore } from './fakes';
import { Application } from '../src/app/application';
import { MemoryFs, FixedWorkspace, defaultWorkspace } from './fakes';

describe('BotRegistry', () => {
  it('CRUD, unique handles, and freeze snapshots', async () => {
    const registry = new BotRegistry(new MemoryStore(), () => crypto.randomUUID(), () => 't0');
    const alpha = await registry.create({
      name: 'Alpha Bot',
      persona: 'calm',
      role: 'architect',
      instructions: 'be precise',
    });
    expect(alpha.handle).toBe('alpha-bot');
    expect(alpha.active).toBe(true);

    const alpha2 = await registry.create({
      name: 'Alpha Bot',
      persona: 'also calm',
      role: 'reviewer',
      instructions: 'nits',
    });
    expect(alpha2.handle).toBe('alpha-bot-2');

    await expect(
      registry.update(alpha.id, {
        name: 'Alpha Bot',
        handle: 'alpha-bot-2',
        persona: 'x',
        role: 'y',
        instructions: 'z',
        active: true,
      }),
    ).rejects.toThrow(/already in use/i);

    const found = registry.getByHandle('ALPHA-BOT');
    expect(found?.id).toBe(alpha.id);

    await registry.toggle(alpha.id, false);
    const freeze = registry.snapshotActive();
    expect(freeze.map((b) => b.handle)).toEqual(['alpha-bot-2']);
    await registry.toggle(alpha.id, true);
    expect(freeze.map((b) => b.handle)).toEqual(['alpha-bot-2']);
    expect(registry.snapshotActive().map((b) => b.handle).sort()).toEqual(['alpha-bot', 'alpha-bot-2']);

    await registry.delete(alpha2.id);
    expect(registry.list()).toHaveLength(1);
  });

  it('does not call the Copilot gateway on CRUD', async () => {
    const gw = new FakeGateway();
    const app = new Application(
      new MemoryStore(),
      gw,
      new MemoryFs(),
      new MemoryFs(),
      new FixedWorkspace(defaultWorkspace),
      () => undefined,
    );
    await app.createBot({ name: 'Rho', persona: 'p', role: 'r', instructions: 'i' });
    await app.toggleBot(app.registry.list()[0]!.id, false);
    await app.updateBot(app.registry.list()[0]!.id, {
      name: 'Rho',
      handle: 'rho',
      persona: 'p2',
      role: 'r',
      instructions: 'i',
      active: true,
    });
    await app.deleteBot(app.registry.list()[0]!.id);
    expect(gw.requestCount).toBe(0);
    expect(gw.ensureCalls).toBe(0);
  });
});
