import { describe, expect, it } from 'vitest';
import { PromptBuilder, personaBlock } from '../src/app/prompt-builder';
import type { BotRecord } from '../src/domain/bot';
import type { TokenCounter } from '../src/app/prompt-builder';
import { defaultWorkspace } from './fakes';

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

describe('PromptBuilder', () => {
  it('puts persona first, keeps it while dropping oldest history, and includes editor body plus other-tab paths', async () => {
    const builder = new PromptBuilder();
    const history = [
      { handle: 'alpha', text: 'OLD-TURN-AAAAAAAA' },
      { handle: 'beta', text: 'MID-TURN-BBBBBBBB' },
      { handle: 'alpha', text: 'NEW-TURN-CCCCCCCC' },
    ];
    const instruction = 'Role: propose now';
    const probe = await builder.build({
      bot,
      workspace: defaultWorkspace,
      history,
      instruction,
      counter: { maxInputTokens: 1_000_000, countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0) },
    });
    expect(probe[0]?.content).toContain('PERSONA-UNIQUE');
    expect(probe[0]?.content).toBe(personaBlock(bot));
    expect(probe[1]?.content).toContain('export const n = 1;');
    expect(probe[1]?.content).toContain('src/other.ts');
    expect(probe[1]?.content).toContain('README.md');
    expect(probe[1]?.content).toContain('n = 1');

    const withoutTabs: TokenCounter = {
      maxInputTokens: 1_000_000,
      countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
    };
    const afterTabs = await builder.build({
      bot,
      workspace: { ...defaultWorkspace, otherTabPaths: [] },
      history,
      instruction,
      counter: withoutTabs,
    });
    const afterTabsLen = await withoutTabs.countTokens(afterTabs);

    const tight: TokenCounter = {
      maxInputTokens: afterTabsLen - 20,
      countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
    };
    const trimmed = await builder.build({
      bot,
      workspace: defaultWorkspace,
      history,
      instruction,
      counter: tight,
    });
    expect(trimmed[0]?.content).toContain('PERSONA-UNIQUE');
    const joined = trimmed.map((m) => m.content).join('\n');
    expect(joined).not.toContain('OLD-TURN-AAAAAAAA');
    expect(joined).toContain('export const n = 1;');
    expect(joined).toContain('n = 1');
    expect(trimmed[trimmed.length - 1]?.content).toContain(instruction);
    expect(trimmed.filter((m) => m.role === 'assistant').every((m) => m.handle)).toBe(true);
  });

  it('drops MCP excerpts first, then extra open tabs, never editor or selection (WM-Q7)', async () => {
    const builder = new PromptBuilder();
    const mcpNote = 'MCP-UNIQUE-NOTE-' + 'X'.repeat(80);
    const history = [{ handle: 'alpha', text: 'KEEP-HISTORY-TURN' }];
    const instruction = 'Role: propose now';
    const workspace = {
      folderFsPath: '/tmp/bot-rider-ws',
      activeEditor: {
        path: 'src/app.ts',
        content: 'UNIQUE-EDITOR-BODY\n',
        selection: 'UNIQUE-SELECTION',
      },
      otherTabPaths: ['TAB-UNIQUE-AAAA-' + 'T'.repeat(120), 'TAB-UNIQUE-BBBB-' + 'U'.repeat(120)],
    };
    const counter: TokenCounter = {
      maxInputTokens: 1_000_000,
      countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
    };
    const full = await builder.build({
      bot,
      workspace,
      history,
      instruction,
      counter,
      mcpContext: [mcpNote],
    });
    expect(full.some((m) => m.content.includes('MCP-UNIQUE-NOTE'))).toBe(true);
    expect(full.some((m) => m.content.includes('TAB-UNIQUE-AAAA'))).toBe(true);

    const withoutMcp = await builder.build({
      bot,
      workspace,
      history,
      instruction,
      counter,
    });
    const withoutMcpLen = await counter.countTokens(withoutMcp);
    const dropMcpOnly: TokenCounter = {
      maxInputTokens: withoutMcpLen,
      countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
    };
    const afterMcp = await builder.build({
      bot,
      workspace,
      history,
      instruction,
      counter: dropMcpOnly,
      mcpContext: [mcpNote],
    });
    const afterMcpJoined = afterMcp.map((m) => m.content).join('\n');
    expect(afterMcpJoined).not.toContain('MCP-UNIQUE-NOTE');
    expect(afterMcpJoined).toContain('KEEP-HISTORY-TURN');
    expect(afterMcpJoined).toContain('UNIQUE-EDITOR-BODY');
    expect(afterMcpJoined).toContain('UNIQUE-SELECTION');
    expect(afterMcpJoined).toContain('TAB-UNIQUE-AAAA');

    const core = await builder.build({
      bot,
      workspace: { ...workspace, otherTabPaths: [] },
      history,
      instruction,
      counter,
    });
    const coreLen = await counter.countTokens(core);
    const dropTabs: TokenCounter = {
      maxInputTokens: coreLen,
      countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
    };
    const afterTabs = await builder.build({
      bot,
      workspace,
      history,
      instruction,
      counter: dropTabs,
      mcpContext: [mcpNote],
    });
    const afterTabsJoined = afterTabs.map((m) => m.content).join('\n');
    expect(afterTabsJoined).not.toContain('MCP-UNIQUE-NOTE');
    expect(afterTabsJoined).not.toContain('TAB-UNIQUE-AAAA');
    expect(afterTabsJoined).toContain('UNIQUE-EDITOR-BODY');
    expect(afterTabsJoined).toContain('UNIQUE-SELECTION');
    expect(afterTabsJoined).toContain('KEEP-HISTORY-TURN');

    const tiny: TokenCounter = {
      maxInputTokens: 1,
      countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
    };
    const still = await builder.build({
      bot,
      workspace,
      history,
      instruction,
      counter: tiny,
      mcpContext: [mcpNote],
    });
    const stillJoined = still.map((m) => m.content).join('\n');
    expect(stillJoined).toContain('UNIQUE-EDITOR-BODY');
    expect(stillJoined).toContain('UNIQUE-SELECTION');
    expect(still.length).toBeGreaterThan(0);
  });
});
