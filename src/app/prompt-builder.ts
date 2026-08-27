import type { TurnKind } from '../domain/run-state';
import { TokenGovernor, type PackRequest, type PackResult } from './token-governor';

export type { TokenCounter, PackRequest, PackResult } from './token-governor';
export { personaBlock } from './token-governor';

export interface HistoryTurn {
  handle: string;
  text: string;
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
  readonly governor: TokenGovernor;

  constructor(governor: TokenGovernor = new TokenGovernor()) {
    this.governor = governor;
  }

  async pack(args: PackRequest): Promise<PackResult> {
    return this.governor.pack(args);
  }
}
