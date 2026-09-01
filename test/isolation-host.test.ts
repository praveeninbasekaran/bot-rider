import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import {
  BotSessionStore,
  buildIsolationPacket,
  packetToMessage,
  type IsolationPacket,
} from '../src/app/bot-session-store';
import { COPY, BOTS_STATE_KEY } from '../src/app/copy';
import { turnInstruction } from '../src/app/prompt-builder';
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

describe('SI-1 per-bot session store', () => {
  it("each bot's Copilot pack does not include other bots' full HV articles as transcript restuff", async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction, messages }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'propose' && messages[0]?.content.includes('@alpha')) {
        return 'ALPHA-HV-ARTICLE-FULL-PROSE';
      }
      if (turn === 'propose' && messages[0]?.content.includes('@beta')) {
        return 'BETA-HV-ARTICLE-FULL-PROSE';
      }
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT not yet' : 'AGREE ship it';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'src/out.ts', op: 'create', content: 'ok' }]);
      }
      return 'language only';
    };
    await app.send('build the feature');
    const alphaId = app.registry.getByHandle('alpha')!.id;
    const betaId = app.registry.getByHandle('beta')!.id;
    expect(gw.requestCount).toBeGreaterThan(0);
    for (let i = 0; i < gw.turns.length; i++) {
      const botId = gw.lastSendOpts[i]?.botId;
      const text = joined(gw.lastMessages[i]!);
      const isolation = isolationText(gw.lastMessages[i]!);
      expect(isolation).not.toContain('ALPHA-HV-ARTICLE-FULL-PROSE');
      expect(isolation).not.toContain('BETA-HV-ARTICLE-FULL-PROSE');
      if (botId === alphaId) {
        expect(text).not.toContain('BETA-HV-ARTICLE-FULL-PROSE');
      }
      if (botId === betaId) {
        expect(text).not.toContain('ALPHA-HV-ARTICLE-FULL-PROSE');
      }
    }
  });

  it('sessions are session-only; BR-3 / BotStoreFile.version unchanged', async () => {
    const { app, gw, store } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'a.ts', op: 'create', content: 'n' }]);
      }
      return 'talk';
    };
    await app.send('build');
    const alphaId = app.registry.getByHandle('alpha')!.id;
    expect(app.orchestrator.sessions.messagesOf(alphaId).length).toBeGreaterThan(0);
    expect(store.get(BOTS_STATE_KEY)).toBeDefined();
    expect(JSON.stringify(store.get(BOTS_STATE_KEY))).not.toMatch(/Isolation packet|inbox|sessionMessages/);
    expect(BOTS_STATE_KEY).toBe('botrider.bots.v1');
    expect(src('src/app/bot-registry.ts')).not.toMatch(/BotStoreFile/);
    expect(src('src/domain/bot.ts')).not.toMatch(/BotStoreFile/);
    expect(src('src/app/bot-session-store.ts')).not.toMatch(/BotStoreFile|BOTS_STATE_KEY|setKeysForSync/);
    expect(src('src/app/bot-session-store.ts')).not.toMatch(/memento|workspaceState/);
    expect(src('src/app/bot-session-store.ts')).not.toMatch(/version:\s*[2-9]/);
  });

  it('reload / Approve / Reject / run end clear sessions', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'a.ts', op: 'create', content: 'n' }]);
      }
      return 'talk';
    };
    await app.send('build');
    const alphaId = app.registry.getByHandle('alpha')!.id;
    expect(app.orchestrator.sessions.peek(alphaId)?.messages.length).toBeGreaterThan(0);

    await app.reject();
    expect(app.orchestrator.sessions.peek(alphaId)).toBeUndefined();

    await app.send('build again');
    expect(app.orchestrator.sessions.peek(alphaId)?.messages.length).toBeGreaterThan(0);
    await app.approve();
    expect(app.orchestrator.sessions.peek(alphaId)).toBeUndefined();

    const store = new BotSessionStore();
    store.append('x', [{ role: 'user', content: 'hi' }]);
    store.enqueue('x', packet());
    expect(store.peek('x')).toBeDefined();
    store.clear();
    expect(store.peek('x')).toBeUndefined();
  });
});

describe('SI-2 controlled ingest', () => {
  it('published packet fields appear verbatim in downstream bot packs', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction, messages }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'propose' && messages[0]?.content.includes('@alpha')) {
        return '- [ ] ACCEPT-CRITERIA-VERBATIM-SI2\nBANTER-ONLY-XYZ lunch ramble.';
      }
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'a.ts', op: 'create', content: 'n' }]);
      }
      return 'language only';
    };
    await app.send('Must keep ACCEPT-CRITERIA-VERBATIM-SI2');
    const betaId = app.registry.getByHandle('beta')!.id;
    const betaPacks = gw.lastMessages.filter((_, i) => gw.lastSendOpts[i]?.botId === betaId);
    expect(betaPacks.length).toBeGreaterThan(0);
    const isolation = betaPacks.map(isolationText).join('\n');
    expect(isolation).toContain('ACCEPT-CRITERIA-VERBATIM-SI2');
    expect(isolation).toContain('- ACCEPT-CRITERIA-VERBATIM-SI2');
    expect(isolation).toContain('Must keep ACCEPT-CRITERIA-VERBATIM-SI2');
    expect(isolation).not.toContain('BANTER-ONLY-XYZ');
  });

  it('banter / failed drafts are not published as requirements', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    gw.script = ({ turn }) => {
      if (turn === 'direct') {
        return 'BANTER-FAILED-DRAFT please ignore\nNEED_EDIT';
      }
      return 'not-a-changeset FAILED-DRAFT-JSON';
    };
    await app.send('@alpha please edit');
    expect(msgs.some((m) => m.type === 'error' && m.code === 'parse-failed')).toBe(true);
    const isolation = gw.lastMessages.map(isolationText).join('\n');
    expect(isolation).not.toContain('BANTER-FAILED-DRAFT');
    expect(isolation).not.toContain('FAILED-DRAFT-JSON');
    const built = buildIsolationPacket({
      at: 'turn-end',
      fromBotId: 'alpha',
      board: { ...emptyBoard(), goal: 'ship it' },
    });
    expect(built.requirements).toEqual(['ship it']);
    expect(JSON.stringify(built)).not.toContain('BANTER');
  });

  it('inactive bots do not receive inbox packets; not fan-out', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const gamma = await app.createBot({
      name: 'Gamma',
      handle: 'gamma',
      persona: 'g',
      role: 'g',
      instructions: 'g',
    });
    await app.toggleBot(gamma.id, false);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'a.ts', op: 'create', content: 'n' }]);
      }
      return 'talk';
    };
    await app.send('build');
    expect(app.orchestrator.sessions.peek(gamma.id)).toBeUndefined();
    expect(gw.lastSendOpts.every((opts) => opts.botId !== gamma.id)).toBe(true);
    expect(gw.lastMessages.every((pack) => !pack[0]?.content.includes('@gamma'))).toBe(true);
    const alphaId = app.registry.getByHandle('alpha')!.id;
    const betaId = app.registry.getByHandle('beta')!.id;
    expect(gw.lastSendOpts.some((opts) => opts.botId === alphaId)).toBe(true);
    expect(gw.lastSendOpts.some((opts) => opts.botId === betaId)).toBe(true);
  });

  it('implementer receives packets before implement pack', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'a.ts', op: 'create', content: 'n' }]);
      }
      return 'talk';
    };
    await app.send('build the feature');
    const impl = gw.turns.findIndex((t) => t === 'implement');
    expect(impl).toBeGreaterThanOrEqual(0);
    const isolation = isolationText(gw.lastMessages[impl]!);
    expect(isolation).toContain('Isolation packet:');
    expect(isolation).toContain('At: consensus');
    expect(isolation).toContain('build the feature');
    expect(isolation).toContain('Consensus');
  });

  it('@ solo inactive bot is the downstream for its own implement pack', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    const alpha = app.registry.getByHandle('alpha')!;
    await app.toggleBot(alpha.id, false);
    gw.script = ({ turn }) => {
      if (turn === 'direct') {
        return 'I would change the file.\nNEED_EDIT';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'solo.ts', op: 'create', content: 's' }]);
      }
      return 'x';
    };
    await app.send('@alpha please edit');
    const impl = gw.turns.findIndex((t) => t === 'implement');
    expect(impl).toBeGreaterThanOrEqual(0);
    expect(gw.lastSendOpts[impl]?.botId).toBe(alpha.id);
    const isolation = isolationText(gw.lastMessages[impl]!);
    expect(isolation).toContain('Isolation packet:');
    expect(isolation).toContain('At: turn-end');
    const beta = app.registry.getByHandle('beta')!;
    expect(app.orchestrator.sessions.peek(beta.id)).toBeUndefined();
  });
});

describe('SI-3 sequential orchestrator / zero chrome', () => {
  it('does not overlap sendRequest', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'a.ts', op: 'create', content: 'n' }]);
      }
      return 'talk';
    };
    await app.send('build');
    expect(gw.requestCount).toBeGreaterThan(1);
    expect(gw.maxInflight).toBe(1);
    const orch = src('src/app/orchestrator.ts');
    expect(orch).not.toMatch(/Promise\.all\s*\(/);
    expect(orch).not.toMatch(/Event Bus/);
    expect(orch).not.toMatch(/F7 parallel/);
  });

  it('adds no new HostToUi / UiToHost members', () => {
    const proto = src('src/protocol/messages.ts');
    expect(proto).not.toMatch(/IsolationPacket|BotSession|chat\/isolat|inbox/);
    const host = proto.slice(proto.indexOf('export type HostToUi'), proto.indexOf('export type UiToHost'));
    const ui = proto.slice(proto.indexOf('export type UiToHost'), proto.indexOf('export interface WorkspaceContext'));
    expect(host).not.toMatch(/isolation|sessionStore|packet/i);
    expect(ui).not.toMatch(/isolation|sessionStore|packet/i);
    expect(host).toContain("type: 'chat/board'");
    expect(host).toContain("type: 'bots/models'");
    expect(ui).toContain("type: 'bots/attach-pick'");
    const chatJs = src('media/chat.js');
    const formJs = src('media/bot-form.js');
    expect(chatJs).not.toMatch(/Isolation packet|BotSessionStore/);
    expect(formJs).not.toMatch(/Isolation packet|BotSessionStore/);
  });
});

describe('SI-4 TokenGovernor required packets', () => {
  it('required packets that cannot fit cause pack-overflow and no Copilot call', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    const original = gw.stream.bind(gw);
    gw.stream = async (messages, token, onText) => {
      const result = await original(messages, token, onText);
      gw.maxInputTokens = await gw.countTokens(messages);
      return result;
    };
    await app.send('build the feature');
    expect(gw.requestCount).toBe(1);
    expect(gw.turns).toEqual(['propose']);
    const err = msgs.find((m) => m.type === 'error' && m.code === 'pack-overflow');
    expect(err && err.type === 'error' && err.message).toBe(COPY.packOverflow);
    expect(msgs.some((m) => m.type === 'chat/turn-start' && m.round === 1 && m.turn === 'propose')).toBe(true);
    expect(msgs.filter((m) => m.type === 'chat/turn-start')).toHaveLength(1);

    const gov = new TokenGovernor();
    const huge: IsolationPacket = packet({
      requirements: ['REQ-' + 'Z'.repeat(400)],
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

  it('attachment extras still trim silent while required packets stay', async () => {
    const gov = new TokenGovernor();
    const attached: BotRecord = {
      ...bot,
      attachments: [
        { path: 'keep.md', name: 'keep.md', snapshot: 'SNAP-KEEP', kind: 'skills' },
        { path: 'tail.md', name: 'tail.md', snapshot: 'SNAP-TAIL', kind: 'hooks' },
      ],
    };
    const required = packet({ requirements: ['REQ-VERBATIM-KEEP'] });
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
    expect(joined(withPacket.messages)).toContain('REQ-VERBATIM-KEEP');
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
    expect(text).toContain('REQ-VERBATIM-KEEP');
    expect(text).toContain('Isolation packet:');
    expect(text).toContain('SNAP-KEEP');
    expect(text).not.toContain('SNAP-TAIL');
    expect(text).not.toContain('MCP-NOTE');
  });
});

describe('isolation packet helpers', () => {
  it('formats fields verbatim and never copies HV speech into requirements', () => {
    const built = buildIsolationPacket({
      at: 'turn-end',
      fromBotId: 'bot-1',
      board: {
        goal: 'Must keep ACCEPT-CRITERIA',
        todos: [{ id: 't1', text: 'todo-one', status: 'pending' }],
        decisions: ['Consensus'],
        dissents: [{ handle: 'alpha', text: 'Need a split.' }],
        files: [{ path: 'a.ts', inChangeset: true }],
      },
      trailer: 'NEED_EDIT',
    });
    expect(built.requirements).toEqual(['Must keep ACCEPT-CRITERIA', 'todo-one']);
    expect(built.decisions).toEqual(['Consensus']);
    expect(built.constraints).toContain('a.ts (in changeset)');
    expect(built.constraints).toContain('NEED_EDIT');
    expect(built.openQuestions).toEqual(['@alpha — Need a split.']);
    const msg = packetToMessage(built);
    expect(msg.role).toBe('user');
    expect(msg.content).toContain('- Must keep ACCEPT-CRITERIA');
    expect(msg.content).toContain('- todo-one');
    expect(msg.content).toContain('- Consensus');
    expect(msg.content).not.toContain('ALPHA-HV-ARTICLE');
  });
});

describe('isolation leftovers stay out', () => {
  it('does not mention leftovers 002/003/009/014 or Graphify in the host isolation slice', () => {
    const files = ['src/app/bot-session-store.ts', 'src/app/token-governor.ts', 'src/app/orchestrator.ts'];
    for (const file of files) {
      const text = src(file);
      expect(text, file).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
      expect(text, file).not.toMatch(/Graphify/i);
    }
    for (const file of listSrcTs(join(root, 'src'))) {
      expect(src(file), file).not.toMatch(/setKeysForSync/);
    }
  });
});
