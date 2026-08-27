import { describe, expect, it } from 'vitest';
import { PromptBuilder, personaBlock, turnInstruction } from '../src/app/prompt-builder';
import { TokenGovernor, implementerFilesBlock, packKindFor } from '../src/app/token-governor';
import type { BotRecord } from '../src/domain/bot';
import type { TokenCounter } from '../src/app/token-governor';
import { defaultWorkspace } from './fakes';
import { boardPackText, emptyBoard } from '../src/app/run-board';

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

const board = { ...emptyBoard(), goal: 'build the feature' };

function lenCounter(max = 1_000_000): TokenCounter {
  return {
    maxInputTokens: max,
    countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
  };
}

function joined(messages: { content: string }[]): string {
  return messages.map((m) => m.content).join('\n');
}

describe('TokenGovernor pack', () => {
  it('debate puts persona first, includes board + LSP slice + tab paths, omits full buffer and history', async () => {
    const builder = new PromptBuilder();
    const packed = await builder.pack({
      bot,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'build the feature'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
      lspSlice: {
        path: 'src/app.ts',
        diagnostics: [{ message: 'diag-x', severity: 'error', range: { startLine: 0, endLine: 0 } }],
        symbols: [{ name: 'n', kind: 'Constant', range: { startLine: 0, endLine: 0 } }],
        enclosingRange: { startLine: 0, endLine: 0, text: 'n = 1' },
      },
    });
    expect(packed.ok).toBe(true);
    if (!packed.ok) {
      return;
    }
    expect(packed.messages[0]?.content).toBe(personaBlock(bot));
    expect(packed.messages[0]?.content).toContain('PERSONA-UNIQUE');
    const text = joined(packed.messages);
    expect(text).toContain('Run board:');
    expect(text).toContain('Goal: build the feature');
    expect(text).toContain('LSP slice of active file: src/app.ts');
    expect(text).toContain('n = 1');
    expect(text).toContain('Open tabs (paths only):');
    expect(text).toContain('src/other.ts');
    expect(text).toContain('README.md');
    expect(text).not.toContain('Active editor contents:');
    expect(text).not.toContain('export const n = 1;');
    expect(text).not.toContain('Files in play (full contents):');
    expect(packed.messages.every((m) => m.role === 'user')).toBe(true);
    expect(packed.messages.some((m) => m.handle)).toBe(false);
  });

  it('drops MCP excerpts first and never drops persona, slice, goal, or tab paths', async () => {
    const builder = new PromptBuilder();
    const mcpNote = 'MCP-UNIQUE-NOTE-' + 'X'.repeat(80);
    const workspace = {
      folderFsPath: '/tmp/bot-rider-ws',
      activeEditor: {
        path: 'src/app.ts',
        content: 'UNIQUE-EDITOR-BODY\n',
        selection: 'UNIQUE-SELECTION',
      },
      otherTabPaths: ['TAB-UNIQUE-AAAA-' + 'T'.repeat(40), 'TAB-UNIQUE-BBBB'],
    };
    const counter = lenCounter();
    const full = await builder.pack({
      bot,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace,
      counter,
      mcpContext: [mcpNote],
    });
    expect(full.ok).toBe(true);
    if (!full.ok) {
      return;
    }
    expect(joined(full.messages)).toContain('MCP-UNIQUE-NOTE');
    expect(joined(full.messages)).toContain('TAB-UNIQUE-AAAA');
    expect(joined(full.messages)).toContain('UNIQUE-SELECTION');
    expect(joined(full.messages)).not.toContain('UNIQUE-EDITOR-BODY');

    const withoutMcp = await builder.pack({
      bot,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace,
      counter,
    });
    expect(withoutMcp.ok).toBe(true);
    if (!withoutMcp.ok) {
      return;
    }
    const withoutMcpLen = await counter.countTokens(withoutMcp.messages);
    const dropMcpOnly = lenCounter(withoutMcpLen);
    const afterMcp = await builder.pack({
      bot,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace,
      counter: dropMcpOnly,
      mcpContext: [mcpNote],
    });
    expect(afterMcp.ok).toBe(true);
    if (!afterMcp.ok) {
      return;
    }
    const afterMcpJoined = joined(afterMcp.messages);
    expect(afterMcpJoined).not.toContain('MCP-UNIQUE-NOTE');
    expect(afterMcpJoined).toContain('TAB-UNIQUE-AAAA');
    expect(afterMcpJoined).toContain('UNIQUE-SELECTION');
    expect(afterMcpJoined).toContain('PERSONA-UNIQUE');
    expect(afterMcpJoined).toContain('Goal: build the feature');
  });

  it('overflows instead of dropping the LSP slice or tab paths', async () => {
    const gov = new TokenGovernor();
    const tiny = lenCounter(1);
    const result = await gov.pack({
      bot,
      kind: 'debate',
      instruction: turnInstruction('propose', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: tiny,
      lspSlice: {
        path: 'src/app.ts',
        diagnostics: [],
        symbols: [],
        enclosingRange: { text: 'SLICE-MUST-STAY' },
      },
      mcpContext: ['MCP-DROP-ME-' + 'Z'.repeat(50)],
    });
    expect(result.ok).toBe(false);
  });

  it('implementer includes full files and does not replace them with an LSP slice', async () => {
    const gov = new TokenGovernor();
    const packed = await gov.pack({
      bot,
      kind: 'implement',
      instruction: turnInstruction('implement', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
      lspSlice: {
        path: 'src/app.ts',
        diagnostics: [],
        symbols: [],
        enclosingRange: { text: 'SLICE-ONLY-SHOULD-NOT-APPEAR' },
      },
      implementerFiles: [{ path: 'src/app.ts', content: 'export const n = 1;\n' }],
    });
    expect(packed.ok).toBe(true);
    if (!packed.ok) {
      return;
    }
    const text = joined(packed.messages);
    expect(text).toContain('Files in play (full contents):');
    expect(text).toContain('export const n = 1;');
    expect(text).toContain(implementerFilesBlock([{ path: 'src/app.ts', content: 'export const n = 1;\n' }]));
    expect(text).not.toContain('SLICE-ONLY-SHOULD-NOT-APPEAR');
    expect(text).not.toContain('LSP slice of active file');
    expect(text).toContain('Open tabs (paths only):');
  });

  it('vote pack is board + instruction with no file body and no transcript', async () => {
    const gov = new TokenGovernor();
    const packed = await gov.pack({
      bot,
      kind: 'vote',
      instruction: turnInstruction('consensus', 1, 'go'),
      board,
      workspace: defaultWorkspace,
      counter: lenCounter(),
      lspSlice: {
        path: 'src/app.ts',
        diagnostics: [],
        symbols: [],
        enclosingRange: { text: 'VOTE-SLICE' },
      },
      implementerFiles: [{ path: 'src/app.ts', content: 'VOTE-FILE-BODY' }],
      mcpContext: ['VOTE-MCP'],
    });
    expect(packed.ok).toBe(true);
    if (!packed.ok) {
      return;
    }
    const text = joined(packed.messages);
    expect(text).toContain(boardPackText(board));
    expect(text).toContain('Role: vote');
    expect(text).toContain('AGREE or DISSENT');
    expect(text).not.toContain('VOTE-SLICE');
    expect(text).not.toContain('VOTE-FILE-BODY');
    expect(text).not.toContain('VOTE-MCP');
    expect(text).not.toContain('export const n = 1;');
    expect(text).not.toContain('Files in play (full contents):');
    expect(text).not.toContain('LSP slice');
    expect(packed.messages.every((m) => m.role === 'user')).toBe(true);
  });

  it('packKindFor maps turns', () => {
    expect(packKindFor('propose')).toBe('debate');
    expect(packKindFor('critique')).toBe('debate');
    expect(packKindFor('direct')).toBe('debate');
    expect(packKindFor('consensus')).toBe('vote');
    expect(packKindFor('implement')).toBe('implement');
  });
});
