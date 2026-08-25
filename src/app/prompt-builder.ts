import type { BotRecord } from '../domain/bot';
import type { PromptMessage, WorkspaceContext } from '../protocol/messages';
import type { TurnKind } from '../domain/run-state';

export interface TokenCounter {
  countTokens(messages: PromptMessage[]): Promise<number>;
  readonly maxInputTokens: number;
}

export interface HistoryTurn {
  handle: string;
  text: string;
}

export function personaBlock(bot: BotRecord): string {
  return [
    `You are ${bot.name} (@${bot.handle}).`,
    `Role: ${bot.role}`,
    `Persona: ${bot.persona}`,
    `Instructions: ${bot.instructions}`,
  ].join('\n');
}

export function workspaceBlock(ctx: WorkspaceContext): string {
  const lines: string[] = [];
  lines.push(`Workspace folder: ${ctx.folderFsPath ?? '(none)'}`);
  if (ctx.activeEditor) {
    lines.push(`Active editor path: ${ctx.activeEditor.path}`);
    if (ctx.activeEditor.selection) {
      lines.push('Active selection:');
      lines.push(ctx.activeEditor.selection);
    } else {
      lines.push('Active selection: (none)');
    }
    lines.push('Active editor contents:');
    lines.push(ctx.activeEditor.content);
  } else {
    lines.push('Active editor: (none)');
  }
  if (ctx.otherTabPaths.length > 0) {
    lines.push('Other open tabs (paths only):');
    for (const p of ctx.otherTabPaths) {
      lines.push(`- ${p}`);
    }
  } else {
    lines.push('Other open tabs: (none)');
  }
  return lines.join('\n');
}

export function turnInstruction(
  turn: TurnKind,
  round: number,
  userText: string,
  extra?: string,
): string {
  const user = `User request:\n${userText}`;
  const extraLine = extra ? `\n${extra}` : '';
  switch (turn) {
    case 'propose':
      return `${user}${extraLine}\n\nRound ${round}. Role: propose. Reply in natural language only. Do not emit file bodies, diffs, or JSON changesets. Give your proposal.`;
    case 'critique':
      return `${user}${extraLine}\n\nRound ${round}. Role: critique. Review the other bots' proposals. Natural language only. Do not emit file bodies, diffs, or JSON changesets.`;
    case 'consensus':
      return `${user}${extraLine}\n\nRound ${round}. Role: vote. The first token of your reply MUST be AGREE or DISSENT (case-insensitive). The rest is your reason. Natural language only; no file bodies or JSON changesets.`;
    case 'direct':
      return `${user}${extraLine}\n\nAnswer the user directly in natural language only. Do not emit file bodies, diffs, or JSON changesets. After your answer, the last non-empty line MUST be exactly NEED_EDIT or NO_EDIT depending on whether workspace files must change.`;
    case 'implement':
      return `${user}${extraLine}\n\nEmit a JSON changeset. Use a fenced code block containing JSON with shape {"files":[{"path":"relative/path","op":"create"|"update"|"delete","content":"..."}]}. delete omits content. Paths must stay inside the workspace. Extra prose is ignored.`;
  }
}

export class PromptBuilder {
  async build(args: {
    bot: BotRecord;
    workspace: WorkspaceContext;
    history: HistoryTurn[];
    instruction: string;
    counter: TokenCounter;
  }): Promise<PromptMessage[]> {
    const persona: PromptMessage = { role: 'user', content: personaBlock(args.bot) };
    const workspace: PromptMessage = { role: 'user', content: workspaceBlock(args.workspace) };
    const instruction: PromptMessage = { role: 'user', content: args.instruction };
    const history = args.history.map((h) => ({
      role: 'assistant' as const,
      content: h.text,
      handle: h.handle,
    }));

    let messages = assemble(persona, workspace, history, instruction);
    while (
      history.length > 0 &&
      (await args.counter.countTokens(messages)) > args.counter.maxInputTokens
    ) {
      history.shift();
      messages = assemble(persona, workspace, history, instruction);
    }

    if ((await args.counter.countTokens(messages)) > args.counter.maxInputTokens) {
      const truncatedWorkspace: PromptMessage = {
        role: 'user',
        content: trimToBudget(
          workspace.content,
          Math.max(0, args.counter.maxInputTokens - (await args.counter.countTokens([persona, instruction]))),
          args.counter,
        ),
      };
      messages = assemble(persona, truncatedWorkspace, [], instruction);
    }
    return messages;
  }
}

function assemble(
  persona: PromptMessage,
  workspace: PromptMessage,
  history: PromptMessage[],
  instruction: PromptMessage,
): PromptMessage[] {
  return [persona, workspace, ...history, instruction];
}

function trimToBudget(
  text: string,
  budget: number,
  _counter: TokenCounter,
): string {
  if (budget <= 0) {
    return '';
  }
  if (text.length <= budget) {
    return text;
  }
  return text.slice(0, budget);
}
