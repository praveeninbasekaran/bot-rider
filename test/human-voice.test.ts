import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import { COPY } from '../src/app/copy';
import { PromptBuilder, personaBlock, turnInstruction } from '../src/app/prompt-builder';
import { TokenGovernor } from '../src/app/token-governor';
import type { HostToUi } from '../src/protocol/messages';
import { changesetFence, defaultWorkspace, FakeGateway, FixedWorkspace, MemoryFs, MemoryStore } from './fakes';

const SPEC_PERSONA = 'Write a spec in markdown with ## headings and a bullet list.';

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

function joined(messages: { content: string }[]): string {
  return messages.map((m) => m.content).join('\n');
}

function lastTurnEnd(msgs: HostToUi[], turn?: string) {
  return [...msgs]
    .reverse()
    .find((m) => m.type === 'chat/turn-end' && (turn ? m.turn === turn : true));
}

function lastBoard(msgs: HostToUi[]) {
  return [...msgs].reverse().find((m) => m.type === 'chat/board');
}

function assertNoDocAsk(text: string): void {
  expect(text).not.toMatch(/respond in markdown/i);
  expect(text).not.toMatch(/write a README/i);
  expect(text).not.toMatch(/write a spec/i);
  expect(text).not.toContain('markdown spec');
  expect(text).not.toMatch(/max \d+ words/i);
}

describe('HV-1 turnInstruction voice', () => {
  it('propose / critique / @ contain the overlay and do not ask for a document', () => {
    const propose = turnInstruction('propose', 1, 'fix the bug');
    const critique = turnInstruction('critique', 1, 'fix the bug');
    const direct = turnInstruction('direct', 1, '@alpha ping');
    for (const text of [propose, critique, direct]) {
      expect(text).toContain(COPY.voiceOverlay);
      expect(text).toContain(COPY.voiceKeepTight);
      expect(text).toContain('Conversational chat');
      expect(text).toContain('even if the persona asks for a document');
      assertNoDocAsk(text);
    }
    expect(propose).toContain('Role: propose');
    expect(critique).toContain('Role: critique');
    expect(direct).toContain('NEED_EDIT');
  });

  it('vote keeps AGREE/DISSENT as first token and uses the same overlay', () => {
    const vote = turnInstruction('consensus', 1, 'fix the bug');
    expect(vote).toContain('Role: vote');
    expect(vote).toContain('AGREE or DISSENT');
    expect(vote).toContain('conversational reason');
    expect(vote).toContain(COPY.voiceOverlay);
    expect(vote).toContain(COPY.voiceKeepTight);
    assertNoDocAsk(vote);
  });

  it('implementer stays a JSON fence instruction with no human-voice overlay', () => {
    const impl = turnInstruction('implement', 1, 'fix the bug');
    expect(impl).toContain('Emit a JSON changeset');
    expect(impl).toContain('{"files":[{"path":"relative/path"');
    expect(impl).not.toContain(COPY.voiceOverlay);
    expect(impl).not.toContain('Conversational chat');
    expect(impl).not.toContain(COPY.voiceKeepTight);
  });

  it('new draft defaults do not ask for markdown documents; they are not a persona rewrite', () => {
    assertNoDocAsk(COPY.defaultNewBotPersona);
    assertNoDocAsk(COPY.defaultNewBotInstructions);
    expect(COPY.defaultNewBotPersona).toMatch(/teammate|person|conversational/i);
  });
});

describe('HV-1 stored persona stays as-is', () => {
  it('persists a spec-writing persona and still overlays + strips the visible turn', async () => {
    const { app, gw, msgs } = harness();
    const bot = await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: SPEC_PERSONA,
      role: 'lead',
      instructions: 'one',
    });
    expect(app.registry.getById(bot.id)?.persona).toBe(SPEC_PERSONA);
    gw.script = ({ turn }) => {
      if (turn === 'direct') {
        return '## Heading\n- one\n- two\nNO_EDIT';
      }
      return 'x';
    };
    await app.send('@alpha please advise');
    expect(app.registry.getById(bot.id)?.persona).toBe(SPEC_PERSONA);
    const persona = gw.lastMessages[0]?.[0]?.content ?? '';
    expect(persona).toBe(personaBlock(app.registry.getByHandle('alpha')!));
    expect(persona).toContain(SPEC_PERSONA);
    const instruction = gw.lastMessages[0]?.[gw.lastMessages[0]!.length - 1]?.content ?? '';
    expect(instruction).toContain(COPY.voiceOverlay);
    const ended = lastTurnEnd(msgs, 'direct');
    expect(ended && ended.type === 'chat/turn-end' && ended.text).toBe('Heading\none\ntwo');
    expect(ended && ended.type === 'chat/turn-end' && ended.text?.includes('##')).toBe(false);
    expect(app.thread.list().some((t) => t.role === 'assistant' && t.text === 'Heading\none\ntwo')).toBe(true);
  });
});

describe('HV-2 host strip on turn-end / Split / board', () => {
  it('strips vote token, keeps the reason, and still parseVote', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
    gw.script = ({ turn }) => (turn === 'consensus' ? 'DISSENT we differ' : 'talk');
    await app.send('fix the bug');
    const voteEnds = msgs.filter((m) => m.type === 'chat/turn-end' && m.turn === 'consensus');
    expect(voteEnds.length).toBeGreaterThan(0);
    expect(voteEnds.every((m) => m.type === 'chat/turn-end' && m.vote === 'DISSENT')).toBe(true);
    expect(
      voteEnds.every(
        (m) =>
          m.type === 'chat/turn-end' &&
          !/\bAGREE\b/i.test(m.text ?? '') &&
          !/\bDISSENT\b/i.test(m.text ?? '') &&
          (m.text ?? '').includes('we differ'),
      ),
    ).toBe(true);
  });

  it('strips NEED_EDIT / NO_EDIT and starts implementer only on NEED_EDIT', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    gw.script = ({ turn }) => (turn === 'direct' ? "I wouldn't change files.\nNO_EDIT" : 'x');
    await app.send('@alpha ping');
    const noEdit = lastTurnEnd(msgs, 'direct');
    expect(noEdit && noEdit.type === 'chat/turn-end' && noEdit.trailer).toBe('NO_EDIT');
    expect(noEdit && noEdit.type === 'chat/turn-end' && noEdit.text).toBe("I wouldn't change files.");
    expect(gw.turns.includes('implement')).toBe(false);

    msgs.length = 0;
    gw.turns = [];
    gw.lastMessages = [];
    gw.lastSendOpts = [];
    gw.script = ({ turn }) => {
      if (turn === 'direct') {
        return 'I would change the file.\nNEED_EDIT';
      }
      return changesetFence([{ path: 'solo.ts', op: 'create', content: 's' }]);
    };
    await app.send('@alpha please edit');
    const need = lastTurnEnd(msgs, 'direct');
    expect(need && need.type === 'chat/turn-end' && need.trailer).toBe('NEED_EDIT');
    expect(need && need.type === 'chat/turn-end' && need.text).toBe('I would change the file.');
    expect(gw.turns.includes('implement')).toBe(true);
  });

  it('merges parseable todos to the board and drops them from turn-end and ThreadStore', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
    gw.script = ({ turn }) => {
      if (turn === 'propose') {
        return 'Ship it.\n- [ ] add cache\n- [x] write tests';
      }
      if (turn === 'consensus') {
        return 'DISSENT';
      }
      return 'talk';
    };
    await app.send('fix the bug');
    const board = lastBoard(msgs);
    expect(board && board.type === 'chat/board' && board.board.todos.map((t) => t.text)).toEqual([
      'add cache',
      'write tests',
    ]);
    const ended = msgs.find((m) => m.type === 'chat/turn-end' && m.turn === 'propose');
    expect(ended && ended.type === 'chat/turn-end' && ended.text).toBe('Ship it.');
    expect(ended && ended.type === 'chat/turn-end' && ended.text?.includes('- [ ]')).toBe(false);
    expect(app.thread.list().some((t) => t.role === 'assistant' && t.text === 'Ship it.')).toBe(true);
  });

  it('turns ## Heading into Heading on debate turns', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
    gw.script = ({ turn }) => {
      if (turn === 'propose') {
        return '## Heading\nThe cache is the cut.';
      }
      if (turn === 'consensus') {
        return 'DISSENT';
      }
      return 'talk';
    };
    await app.send('fix the bug');
    const propose = msgs.find((m) => m.type === 'chat/turn-end' && m.turn === 'propose');
    expect(propose && propose.type === 'chat/turn-end' && propose.text).toBe('Heading\nThe cache is the cut.');
    expect(propose && propose.type === 'chat/turn-end' && propose.text?.includes('##')).toBe(false);
  });

  it('flattens unsolicited consecutive dashes and keeps a list when userText asks for one', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    gw.script = ({ turn }) => (turn === 'direct' ? 'Risks:\n- one\n- two\nNO_EDIT' : 'x');
    await app.send('@alpha fix the bug');
    const flat = lastTurnEnd(msgs, 'direct');
    expect(flat && flat.type === 'chat/turn-end' && flat.text).toBe('Risks:\none\ntwo');

    msgs.length = 0;
    await app.send('@alpha list the risks');
    const listed = lastTurnEnd(msgs, 'direct');
    expect(listed && listed.type === 'chat/turn-end' && listed.text).toBe('Risks:\n- one\n- two');
  });

  it('does not flatten list-looking lines inside a fence at the stripper; debate sanitize still drops file bodies', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    gw.script = ({ turn }) =>
      turn === 'direct' ? 'See\n```md\n# README\n- item\n```\nNO_EDIT' : 'x';
    await app.send('@alpha write README.md please');
    const ended = lastTurnEnd(msgs, 'direct');
    expect(ended && ended.type === 'chat/turn-end' && ended.text?.includes('# README')).toBe(false);
    expect(ended && ended.type === 'chat/turn-end' && ended.text?.includes('- item')).toBe(false);
    expect(ended && ended.type === 'chat/turn-end' && (ended.text ?? '')).toContain('```md');
  });

  it('Split one-liners and dissents[] come from already-stripped text', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
    gw.script = ({ turn }) => {
      if (turn === 'propose') {
        return '## Cache the layer now.';
      }
      if (turn === 'critique') {
        return '## Cache is the right cut.';
      }
      return 'DISSENT we differ';
    };
    await app.send('fix the bug');
    const split = msgs.find((m) => m.type === 'chat/split');
    expect(split && split.type === 'chat/split' && split.positions[0]?.text).toBe('we differ');
    expect(split && split.type === 'chat/split' && split.positions.every((p) => !p.text.includes('##'))).toBe(true);
    const board = lastBoard(msgs);
    expect(board && board.type === 'chat/board' && board.board.dissents[0]?.text).toBe('we differ');
    expect(
      board && board.type === 'chat/board' && board.board.dissents.every((d) => !/^DISSENT\b/i.test(d.text)),
    ).toBe(true);
  });

  it('streams raw tokens then emits the stripped article; never mid-turn truncates', async () => {
    const { app, gw, msgs } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    const body = `${'word '.repeat(80)}don't stop here.`;
    gw.script = ({ turn }) => (turn === 'direct' ? `## Title\n${body}\nNO_EDIT` : 'x');
    await app.send('@alpha fix the bug');
    const tokens = msgs.filter((m) => m.type === 'chat/token');
    expect(tokens.some((m) => m.type === 'chat/token' && m.delta.includes('##'))).toBe(true);
    expect(tokens.every((m) => m.type === 'chat/token' && typeof m.botId === 'string' && typeof m.delta === 'string')).toBe(
      true,
    );
    const ended = lastTurnEnd(msgs, 'direct');
    expect(ended && ended.type === 'chat/turn-end' && ended.text?.startsWith('Title\n')).toBe(true);
    expect(ended && ended.type === 'chat/turn-end' && ended.text?.includes(body.trim())).toBe(true);
    expect(ended && ended.type === 'chat/turn-end' && ended.text?.includes('…')).toBe(false);
    expect(ended && ended.type === 'chat/turn-end' && ended.text?.includes("don't")).toBe(true);
  });
});

describe('HV packs / protocol / WM stay frozen', () => {
  it('QC-2 debate is slice not full buffer; extra tabs paths-only; implementer bodies = in-play + changeset', async () => {
    const builder = new PromptBuilder(new TokenGovernor());
    const bot = {
      id: '1',
      handle: 'alpha',
      name: 'Alpha',
      persona: SPEC_PERSONA,
      role: 'lead',
      instructions: 'one',
      active: true,
      colorIndex: 0,
      createdAt: 't',
      updatedAt: 't',
    };
    const board = {
      goal: 'build',
      todos: [],
      decisions: [],
      dissents: [],
      files: [
        { path: 'src/app.ts', inChangeset: false },
        { path: 'lib/in-play.ts', inChangeset: true },
      ],
    };
    const debate = await builder.pack({
      bot,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'fix the bug'),
      board,
      workspace: defaultWorkspace,
      counter: {
        maxInputTokens: 1_000_000,
        countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
      },
      lspSlice: {
        path: 'src/app.ts',
        diagnostics: [],
        symbols: [],
        enclosingRange: { text: 'n = 1' },
      },
    });
    expect(debate.ok).toBe(true);
    if (!debate.ok) {
      return;
    }
    expect(debate.messages[0]?.content).toBe(personaBlock(bot));
    const debateText = joined(debate.messages);
    expect(debateText).toContain(COPY.voiceOverlay);
    expect(debateText).toContain('LSP slice of active file');
    expect(debateText).toContain('Open tabs (paths only):');
    expect(debateText).not.toContain('Active editor contents:');
    expect(debateText).not.toContain('Files in play (full contents):');
    expect(debateText).not.toContain('export const n = 1;');

    const impl = await builder.pack({
      bot,
      kind: 'implement',
      instruction: turnInstruction('implement', 1, 'fix the bug'),
      board,
      workspace: defaultWorkspace,
      counter: {
        maxInputTokens: 1_000_000,
        countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
      },
      implementerFiles: [
        { path: 'src/app.ts', content: 'export const n = 1;\n' },
        { path: 'lib/in-play.ts', content: 'CHANGESET-IN-PLAY-BODY\n' },
      ],
    });
    expect(impl.ok).toBe(true);
    if (!impl.ok) {
      return;
    }
    const implText = joined(impl.messages);
    expect(implText).toContain('Files in play (full contents):');
    expect(implText).toContain('export const n = 1;');
    expect(implText).toContain('CHANGESET-IN-PLAY-BODY');
    expect(implText).not.toContain(COPY.voiceOverlay);
    expect(implText).not.toContain('OTHER-TAB-FULL-BODY');
  });

  it('adds no HostToUi / UiToHost members and no protocol rev', () => {
    const proto = readFileSync(join(__dirname, '..', 'src/protocol/messages.ts'), 'utf8');
    expect(proto).toContain("type: 'chat/turn-end'");
    expect(proto).toContain("type: 'chat/token'; botId: string; delta: string");
    expect(proto).toContain("type: 'chat/split'");
    expect(proto).not.toMatch(/HostToUiVoice|humanVoice|articleStrip|voiceCap/);
    expect(proto).not.toMatch(/protocolRev|protocolVersion/);
    const host = proto.slice(proto.indexOf('export type HostToUi'), proto.indexOf('export type UiToHost'));
    expect(host).toContain("type: 'chat/board'");
    expect(host).not.toContain('voice');
    const ui = proto.slice(proto.indexOf('export type UiToHost'));
    expect(ui).not.toMatch(/chat\/board/);
  });

  it('WM tools stay none on vote and implementer', async () => {
    const { app, gw } = harness();
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round === 1 ? 'DISSENT' : 'AGREE';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'n.ts', op: 'create', content: 'n' }]);
      }
      return 'talk';
    };
    await app.send('build it');
    const paired = gw.turns.map((turn, i) => ({ turn, tools: gw.lastSendOpts[i]?.tools ?? 'none' }));
    expect(paired.filter((p) => p.turn === 'consensus').every((p) => p.tools === 'none')).toBe(true);
    expect(paired.filter((p) => p.turn === 'implement').every((p) => p.tools === 'none')).toBe(true);
  });
});
