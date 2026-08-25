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

    const fullLen = (await (async () => {
      const c: TokenCounter = {
        maxInputTokens: 1_000_000,
        countTokens: async (m) => m.reduce((n, x) => n + x.content.length, 0),
      };
      const msgs = await builder.build({ bot, workspace: defaultWorkspace, history, instruction, counter: c });
      return c.countTokens(msgs);
    })());

    const tight: TokenCounter = {
      maxInputTokens: fullLen - 20,
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
    expect(trimmed[trimmed.length - 1]?.content).toContain(instruction);
    expect(trimmed.filter((m) => m.role === 'assistant').every((m) => m.handle)).toBe(true);
  });
});
