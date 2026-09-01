import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import {
  botsModelsMessage,
  buildCopilotModelOptions,
  copilotModelLabel,
  discoverCopilotModels,
  shortIdTail,
  usesPerBotModel,
  watchFormCopilotModels,
} from '../src/app/bot-models';
import { CopilotGateway } from '../src/app/copilot-gateway';
import { BotRegistry } from '../src/app/bot-registry';
import { COPY, BOTS_STATE_KEY } from '../src/app/copy';
import { normalizeModelId, type BotRecord } from '../src/domain/bot';
import type { HostToUi } from '../src/protocol/messages';
import type { CancelToken, LmModel, LmSendOptions } from '../src/app/ports';
import type { PromptMessage } from '../src/protocol/messages';
import {
  changesetFence,
  defaultWorkspace,
  FakeGateway,
  FakeLm,
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

function idle(): CancelToken {
  return { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
}

function lmModel(overrides: Partial<LmModel> & { sendHits?: string[] } = {}): LmModel {
  const sendHits = overrides.sendHits;
  const { sendHits: _drop, ...rest } = overrides;
  void _drop;
  return {
    id: 'copilot/default',
    vendor: 'copilot',
    maxInputTokens: 1000,
    countTokens: async () => 1,
    sendRequest: async (_m: PromptMessage[], _o: LmSendOptions, _t: CancelToken) => {
      sendHits?.push(rest.id ?? 'copilot/default');
      return { text: (async function* () { yield 'ok'; })() };
    },
    ...rest,
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

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitUntil(pred: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (pred()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${label}`);
}

describe('MS-1 labels and discovery', () => {
  it('builds display labels: name, then family · short id tail if ambiguous, else id', () => {
    expect(shortIdTail('copilot/gpt-4.1')).toBe('gpt-4.1');
    expect(shortIdTail('gpt-4.1')).toBe('gpt-4.1');
    const counts = new Map<string, number>([
      ['gpt', 2],
      ['claude', 1],
    ]);
    expect(copilotModelLabel({ id: 'copilot/a', name: 'GPT 4.1' }, counts)).toBe('GPT 4.1');
    expect(copilotModelLabel({ id: 'copilot/a', name: '  ' , family: 'claude' }, counts)).toBe('claude');
    expect(copilotModelLabel({ id: 'copilot/gpt-4.1', family: 'gpt' }, counts)).toBe('gpt · gpt-4.1');
    expect(copilotModelLabel({ id: 'copilot/only' }, counts)).toBe('copilot/only');
  });

  it('discovers selectChatModels({ vendor: copilot }) only and never lists other vendors', async () => {
    const lm = new FakeLm();
    lm.leakOtherVendors = true;
    lm.models = [
      lmModel({ id: 'copilot/gpt-4.1', name: 'GPT 4.1' }),
      lmModel({ id: 'openai/gpt', vendor: 'openai', name: 'Not Copilot' }),
    ];
    const discovered = await discoverCopilotModels(lm);
    expect(lm.lastSelector).toEqual({ vendor: 'copilot' });
    expect(discovered.map((m) => m.id)).toEqual(['copilot/gpt-4.1']);
    expect(buildCopilotModelOptions(discovered).every((m) => m.id !== 'openai/gpt')).toBe(true);
  });

  it('emits bots/models loading then ready/unavailable; saved missing id → selectedId null', async () => {
    const lm = new FakeLm();
    const hits: string[] = [];
    lm.models = [
      lmModel({ id: 'copilot/a', name: 'Alpha', sendHits: hits }),
      lmModel({ id: 'copilot/b', family: 'gpt', sendHits: hits }),
    ];
    const msgs: HostToUi[] = [];
    const watch = watchFormCopilotModels({
      lm,
      savedModelId: 'copilot/gone',
      emit: (m) => msgs.push(m),
    });
    expect(msgs[0]).toEqual({ type: 'bots/models', models: [], selectedId: null, status: 'loading' });
    await flush();
    const ready = msgs.filter((m) => m.type === 'bots/models' && m.status === 'ready');
    expect(ready[0]).toEqual({
      type: 'bots/models',
      models: [
        { id: 'copilot/a', label: 'Alpha' },
        { id: 'copilot/b', label: 'gpt' },
      ],
      selectedId: null,
      status: 'ready',
    });
    expect(hits).toEqual([]);

    lm.models = [];
    lm.fireModels();
    await flush();
    expect(msgs.some((m) => m.type === 'bots/models' && m.status === 'unavailable' && m.selectedId === null)).toBe(
      true,
    );

    const n = msgs.length;
    watch.dispose();
    lm.fireModels();
    await flush();
    expect(msgs.length).toBe(n);
  });

  it('selectedId is the saved modelId when it is in the current copilot list', () => {
    expect(
      botsModelsMessage([{ id: 'copilot/a', label: 'A' }], 'copilot/a', 'ready').selectedId,
    ).toBe('copilot/a');
    expect(botsModelsMessage([{ id: 'copilot/a', label: 'A' }], 'copilot/gone', 'ready').selectedId).toBe(null);
    expect(botsModelsMessage([], 'copilot/a', 'unavailable')).toEqual({
      type: 'bots/models',
      models: [],
      selectedId: null,
      status: 'unavailable',
    });
    expect(botsModelsMessage([{ id: 'x', label: 'X' }], 'x', 'loading')).toEqual({
      type: 'bots/models',
      models: [],
      selectedId: null,
      status: 'loading',
    });
  });
});

describe('MS-2 persist LanguageModelChat.id only', () => {
  it('persists modelId string and never persists a label', async () => {
    const { app, store } = harness();
    await app.handleUi({
      type: 'bots/create',
      draft: {
        name: 'Alpha',
        handle: 'alpha',
        persona: 'p',
        role: 'r',
        instructions: 'i',
        active: true,
        modelId: 'copilot/gpt-4.1',
        modelLabel: 'GPT 4.1',
      } as never,
    });
    const created = app.registry.list()[0]!;
    expect(created.modelId).toBe('copilot/gpt-4.1');
    expect(created).not.toHaveProperty('modelLabel');
    const persisted = store.get<BotRecord[]>(BOTS_STATE_KEY);
    expect(persisted?.[0]?.modelId).toBe('copilot/gpt-4.1');
    expect(JSON.stringify(persisted)).not.toMatch(/GPT 4\.1/);
    expect(JSON.stringify(persisted)).not.toMatch(/modelLabel/);

    await store.update(BOTS_STATE_KEY, [
      { ...created, modelId: 'copilot/gpt-4.1', modelLabel: 'GPT 4.1' } as BotRecord & { modelLabel: string },
    ]);
    const reloaded = new BotRegistry(store).list()[0]!;
    expect(reloaded.modelId).toBe('copilot/gpt-4.1');
    expect(reloaded).not.toHaveProperty('modelLabel');

    await app.handleUi({
      type: 'bots/update',
      id: created.id,
      patch: { modelId: 'copilot/gpt-5', name: 'Alpha' },
    });
    expect(app.registry.getById(created.id)?.modelId).toBe('copilot/gpt-5');
  });

  it('empty / unset / omit / null modelId is host default', async () => {
    const { app, gw } = harness();
    const empty = await app.createBot({
      name: 'Empty',
      handle: 'empty',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      modelId: '',
    });
    const nulled = await app.createBot({
      name: 'Null',
      handle: 'nulled',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      modelId: null,
    });
    const omitted = await app.createBot({
      name: 'Omit',
      handle: 'omit',
      persona: 'p',
      role: 'r',
      instructions: 'i',
    });
    expect(empty.modelId).toBeUndefined();
    expect(nulled.modelId).toBeUndefined();
    expect(omitted.modelId).toBeUndefined();
    expect(normalizeModelId('')).toBeNull();
    expect(normalizeModelId(null)).toBeNull();
    expect(normalizeModelId(undefined)).toBeNull();
    expect(normalizeModelId({ id: 'x', label: 'L' })).toBeNull();

    gw.script = ({ turn }) => (turn === 'direct' ? 'hi\nNO_EDIT' : 'x');
    await app.send('@empty ping');
    expect(gw.prepareCalls[0] == null || gw.prepareCalls[0] === '').toBe(true);
    expect(gw.resolvedModelIds[0]).toBeNull();
    expect(gw.requestCount).toBe(1);
  });

  it('does not bump BotStoreFile.version; old records without modelId use host default', async () => {
    expect(BOTS_STATE_KEY).toBe('botrider.bots.v1');
    const store = new MemoryStore();
    await store.update(BOTS_STATE_KEY, [
      {
        id: 'legacy',
        handle: 'legacy',
        name: 'Legacy',
        persona: 'p',
        role: 'r',
        instructions: 'i',
        active: true,
        colorIndex: 0,
        createdAt: 't',
        updatedAt: 't',
      },
    ]);
    const registry = new BotRegistry(store);
    expect(registry.list()[0]?.modelId).toBeUndefined();
    expect(src('src/app/bot-registry.ts')).not.toMatch(/BotStoreFile/);
    expect(src('src/domain/bot.ts')).not.toMatch(/BotStoreFile/);
    expect(src('src/app/bot-models.ts')).not.toMatch(/BotStoreFile/);
  });
});

describe('MS-3 per-turn resolve', () => {
  it('missing saved id uses host default that turn, emits chat/notice once, and does not block', async () => {
    const { app, gw, msgs } = harness();
    gw.unavailableModelIds.add('copilot/gone');
    await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      modelId: 'copilot/gone',
    });
    gw.script = ({ turn }) => (turn === 'direct' ? 'still ran\nNO_EDIT' : 'x');
    await app.send('@alpha ping');
    const notices = msgs.filter((m) => m.type === 'chat/notice');
    expect(notices).toContainEqual({ type: 'chat/notice', text: COPY.savedModelUnavailable });
    expect(notices.filter((m) => m.type === 'chat/notice' && m.text === COPY.savedModelUnavailable)).toHaveLength(1);
    expect(msgs.filter((m) => m.type === 'error')).toEqual([]);
    expect(gw.requestCount).toBe(1);
    expect(gw.resolvedModelIds[0]).toBeNull();
    expect(app.orchestrator.getRunState().phase).not.toBe('error');
  });

  it('saved id present is used for propose / critique / direct / implement', async () => {
    const hits: string[] = [];
    const lm = new FakeLm();
    const picked = lmModel({ id: 'copilot/picked', name: 'Picked', sendHits: hits });
    const other = lmModel({ id: 'copilot/other', name: 'Other', sendHits: hits });
    lm.models = [other, picked];
    const gw = new CopilotGateway(lm);
    expect(await gw.ensureAvailable()).toBe('ready');
    const prepared = await gw.prepareTurn('copilot/picked');
    expect(prepared.usedFallback).toBe(false);
    await gw.send([{ role: 'user', content: 'hi' }], idle(), () => undefined, { modelId: 'copilot/picked' });
    expect(hits).toEqual(['copilot/picked']);

    const { app, gw: fake } = harness();
    await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'lead',
      instructions: 'i',
      modelId: 'copilot/picked',
    });
    await app.createBot({
      name: 'Beta',
      handle: 'beta',
      persona: 'p',
      role: 'review',
      instructions: 'i',
      modelId: 'copilot/other',
    });
    fake.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'out.ts', op: 'create', content: 'ok' }]);
      }
      return 'talk';
    };
    await app.send('ship it');
    const byTurn = fake.turns.map((turn, i) => ({ turn, modelId: fake.lastSendOpts[i]?.modelId }));
    expect(byTurn.filter((t) => t.turn === 'propose').map((t) => t.modelId)).toEqual([
      'copilot/picked',
      'copilot/other',
    ]);
    expect(byTurn.filter((t) => t.turn === 'critique').map((t) => t.modelId)).toEqual([
      'copilot/picked',
      'copilot/other',
    ]);
    expect(byTurn.filter((t) => t.turn === 'implement').map((t) => t.modelId)).toEqual(['copilot/picked']);
    expect(byTurn.filter((t) => t.turn === 'consensus').every((t) => t.modelId === undefined)).toBe(true);
    expect(usesPerBotModel('consensus')).toBe(false);
    expect(fake.prepareCalls).toHaveLength(fake.turns.filter((t) => t !== 'consensus').length);

    await app.reject();
    fake.prepareCalls.length = 0;
    fake.lastSendOpts.length = 0;
    fake.turns.length = 0;
    fake.script = ({ turn }) => (turn === 'direct' ? 'solo\nNO_EDIT' : 'x');
    await app.send('@alpha lock');
    expect(fake.lastSendOpts[0]?.modelId).toBe('copilot/picked');
    expect(fake.turns[0]).toBe('direct');
  });

  it('vote / consensus does not require per-bot resolve', async () => {
    const { app, gw } = harness();
    await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'lead',
      instructions: 'i',
      modelId: 'copilot/a',
    });
    await app.createBot({
      name: 'Beta',
      handle: 'beta',
      persona: 'p',
      role: 'review',
      instructions: 'i',
      modelId: 'copilot/b',
    });
    gw.script = ({ turn }) => {
      if (turn === 'consensus') {
        return 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'v.ts', op: 'create', content: 'v' }]);
      }
      return 'talk';
    };
    await app.send('vote path');
    const consensusOpts = gw.lastSendOpts.filter((_, i) => gw.turns[i] === 'consensus');
    expect(consensusOpts.length).toBe(2);
    expect(consensusOpts.every((o) => o.modelId === undefined)).toBe(true);
    expect(gw.prepareCalls.every((id) => id === 'copilot/a' || id === 'copilot/b')).toBe(true);
  });

  it('Continue extra debate rounds resolve per bot', async () => {
    const { app, gw } = harness();
    await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'lead',
      instructions: 'i',
      modelId: 'copilot/a',
    });
    await app.createBot({
      name: 'Beta',
      handle: 'beta',
      persona: 'p',
      role: 'review',
      instructions: 'i',
      modelId: 'copilot/b',
    });
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round >= 3 ? 'AGREE' : 'DISSENT';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'c.ts', op: 'create', content: 'c' }]);
      }
      return 'talk';
    };
    await app.send('debate this');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    gw.lastSendOpts.length = 0;
    gw.turns.length = 0;
    await app.continueDebate();
    const continued = gw.turns.map((turn, i) => ({ turn, modelId: gw.lastSendOpts[i]?.modelId }));
    expect(continued.filter((t) => t.turn === 'propose').map((t) => t.modelId)).toEqual(['copilot/a', 'copilot/b']);
    expect(continued.filter((t) => t.turn === 'critique').map((t) => t.modelId)).toEqual(['copilot/a', 'copilot/b']);
  });

  it('mid-run Edit of modelId does not hot-swap the in-flight stream', async () => {
    const hits: string[] = [];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lm = new FakeLm();
    lm.models = [
      lmModel({
        id: 'copilot/a',
        sendRequest: async () => {
          hits.push('a-start');
          await blocked;
          hits.push('a-end');
          return { text: (async function* () { yield 'ok'; })() };
        },
      }),
      lmModel({
        id: 'copilot/b',
        sendRequest: async () => {
          hits.push('b');
          return { text: (async function* () { yield 'other'; })() };
        },
      }),
    ];
    const gw = new CopilotGateway(lm);
    await gw.ensureAvailable();
    await gw.prepareTurn('copilot/a');
    const sendP = gw.send([{ role: 'user', content: 'hi' }], idle(), () => undefined, { modelId: 'copilot/a' });
    await waitUntil(() => hits.includes('a-start'), 'stream start');
    await gw.prepareTurn('copilot/b');
    release();
    await sendP;
    expect(hits).toEqual(['a-start', 'a-end']);

    const { app, gw: fake } = harness();
    const alpha = await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      modelId: 'copilot/a',
    });
    let unlock!: () => void;
    fake.gate = new Promise((resolve) => {
      unlock = resolve;
    });
    fake.script = ({ turn }) => (turn === 'direct' ? 'hi\nNO_EDIT' : 'x');
    const run = app.send('@alpha ping');
    await waitUntil(() => fake.lastSendOpts.length === 1, 'send started');
    expect(fake.lastSendOpts[0]?.modelId).toBe('copilot/a');
    await app.updateBot(alpha.id, {
      name: 'Alpha',
      handle: 'alpha',
      persona: 'p',
      role: 'r',
      instructions: 'i',
      active: true,
      modelId: 'copilot/b',
    });
    expect(app.registry.getById(alpha.id)?.modelId).toBe('copilot/b');
    unlock();
    await run;
    expect(fake.lastSendOpts[0]?.modelId).toBe('copilot/a');
    expect(fake.requestCount).toBe(1);
  });
});

describe('MS host emit contract scans', () => {
  it('UI never imports vscode.lm; discovery is host-side only', () => {
    for (const file of ['media/bot-form.js', 'media/chat.js', 'media/bot-form.css', 'media/chat.css']) {
      expect(src(file), file).not.toMatch(/vscode\.lm/);
    }
    expect(src('src/app/bot-models.ts')).not.toMatch(/sendRequest/);
    expect(src('src/adapters/bot-form-panel.ts')).toContain('watchFormModels');
    expect(src('src/adapters/bot-form-panel.ts')).not.toMatch(/sendRequest/);
    expect(src('src/adapters/vscode-lm-gateway.ts')).toContain('vscode.lm.selectChatModels');
  });

  it('tree has no model subtitle and host does not emit one', () => {
    const tree = src('src/adapters/bots-tree.ts');
    expect(tree).toContain('bot.active ? bot.role : `${bot.role} · Inactive`');
    expect(tree).not.toMatch(/modelId/);
    expect(tree).not.toMatch(/model subtitle/i);
    expect(src('src/protocol/messages.ts')).not.toMatch(/bots\/tree/);
  });

  it('§20 attach ports are unchanged', () => {
    const proto = src('src/protocol/messages.ts');
    expect(proto).toContain("type: 'bots/attach-added'; slot: AttachmentKind; files: { path: string; name: string }[]");
    expect(proto).toContain("type: 'bots/attach-skipped'");
    expect(proto).toContain("type: 'bots/attach-mapped'; name?: string; handle?: string; persona?: string");
    expect(proto).toContain("type: 'bots/attach-pick'; slot: AttachmentKind");
    expect(proto).toContain("type: 'bots/attach-remove'; slot: AttachmentKind; path: string");
    expect(proto).toContain("type: 'bots/models'");
    expect(src('src/domain/bot.ts')).toContain('modelId?: string | null');
    expect(proto).toContain("| 'modelId'");
    const uiToHost = proto.slice(proto.indexOf('export type UiToHost'), proto.indexOf('export interface WorkspaceContext'));
    expect(uiToHost).not.toMatch(/bots\/models/);
  });

  it('Settings Sync stays off; leftovers / Graphify / F7 stay out', () => {
    const files = [
      'src/app/bot-models.ts',
      'src/app/bot-registry.ts',
      'src/app/copilot-gateway.ts',
      'src/app/orchestrator.ts',
      'src/domain/bot.ts',
      'src/extension.ts',
      'src/adapters/bot-form-panel.ts',
    ];
    for (const file of files) {
      const text = src(file);
      expect(text, file).not.toMatch(/setKeysForSync/);
      expect(text, file).not.toMatch(/BotStoreFile/);
      expect(text, file).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
      expect(text, file).not.toMatch(/Graphify/i);
      expect(text, file).not.toMatch(/Event Bus|F7 parallel/i);
    }
    for (const file of listSrcTs(join(root, 'src'))) {
      expect(src(file), file).not.toMatch(/setKeysForSync/);
    }
  });

  it('fallback notice copy is exact and not a new protocol member', () => {
    expect(COPY.savedModelUnavailable).toBe('Saved model is unavailable. Using extension default.');
    expect(src('src/protocol/messages.ts')).toContain("type: 'chat/notice'; text: string");
    expect(src('src/app/orchestrator.ts')).toContain('COPY.savedModelUnavailable');
    expect(src('src/app/orchestrator.ts')).toContain("type: 'chat/notice'");
  });
});
