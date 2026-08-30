import type { TurnKind } from '../domain/run-state';
import { COPY } from './copy';
import { TokenGovernor, type PackRequest, type PackResult } from './token-governor';

export type { TokenCounter, PackRequest, PackResult } from './token-governor';
export { personaBlock } from './token-governor';

export interface HistoryTurn {
  handle: string;
  text: string;
}

function voiceLines(): string {
  return `${COPY.voiceOverlay} ${COPY.voiceKeepTight}`;
}

function speakingVoice(role?: string): string {
  const parts = [
    'Conversational chat. Short paragraphs.',
    'Do not use #, ##, or ### headings.',
    'No bullet-wall unless the user request on this Send asked for a list.',
    'Do not emit file bodies, diffs, or JSON changesets.',
  ];
  if (role) {
    parts.push(role);
  }
  parts.push(voiceLines());
  return parts.join(' ');
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
      return `${user}${extraLine}\n\nRound ${round}. Role: propose. ${speakingVoice('Give your proposal.')}`;
    case 'critique':
      return `${user}${extraLine}\n\nRound ${round}. Role: critique. Review the other bots' proposals. ${speakingVoice()}`;
    case 'consensus':
      return `${user}${extraLine}\n\nRound ${round}. Role: vote. The first token of your reply MUST be AGREE or DISSENT (case-insensitive). The rest is your conversational reason. Do not emit file bodies, diffs, or JSON changesets. ${voiceLines()}`;
    case 'direct':
      return `${user}${extraLine}\n\nAnswer the user directly. ${speakingVoice('After your answer, the last non-empty line MUST be exactly NEED_EDIT or NO_EDIT depending on whether workspace files must change.')}`;
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
