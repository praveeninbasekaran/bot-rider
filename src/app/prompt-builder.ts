import type { TurnKind } from '../domain/run-state';
import { COPY } from './copy';
import { TokenGovernor, type PackRequest, type PackResult } from './token-governor';

export type { TokenCounter, PackRequest, PackResult } from './token-governor';
export { personaBlock } from './token-governor';

export interface HistoryTurn {
  handle: string;
  text: string;
  turn: TurnKind;
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
    case 'synthesis':
      return `${user}${extraLine}\n\nRound ${round}. Role: synthesis. Reconcile the settled proposals into one concrete recommendation. State the recommendation first, then the rationale and trade-offs. Do not vote or emit file changes. ${speakingVoice()}`;
    case 'objection':
      return `${user}${extraLine}\n\nRound ${round}. Role: targeted objection. Review the settled synthesis. If it has no decision-blocking issue, reply exactly NO_BLOCKER. Otherwise the first non-empty line MUST be BLOCKING <class>: <criterion> — <reason>. Use a concrete acceptance criterion or risk; vague disagreement is non-blocking. Do not emit file changes. ${speakingVoice()}`;
    case 'critique':
      return `${user}${extraLine}\n\nRound ${round}. Role: critique. Review the other bots' proposals. ${speakingVoice()}`;
    case 'consensus':
      return `${user}${extraLine}\n\nRound ${round}. Role: vote. The first token of your reply MUST be AGREE or DISSENT (case-insensitive). The rest is your conversational reason. Do not emit file bodies, diffs, or JSON changesets. ${voiceLines()}`;
    case 'direct':
      return `${user}${extraLine}\n\nAnswer the user directly. ${speakingVoice('After your answer, the last non-empty line MUST be exactly NEED_EDIT or NO_EDIT depending on whether workspace files must change.')}`;
    case 'implement':
      return `${user}${extraLine}\n\nEmit a JSON changeset with shape {"files":[{"path":"relative/path","op":"create"|"update"|"delete"}]}. Use a fenced JSON block. Creates add "content". Text updates add "patch":"--- a/relative/path\\n+++ b/relative/path\\n@@ ..." and may add "sourceHash":"sha256:..."; the host captures an omitted hash. Deletes omit content. Unified hunks must contain exact context and both header paths must match path. Paths must stay inside the workspace. Extra prose is ignored.`;
    case 'spec':
      return `${user}${extraLine}\n\nRole: spec. BA-phase. Write the work specification for this request. Other workers wait. ${speakingVoice('Give the spec.')}`;
    case 'dispatch':
      return `${user}${extraLine}\n\nRole: dispatch. Propose a typed dependency graph for remaining worker handles. Emit a fenced JSON block with shape {"tasks":[{"id":"task-id","owner":"worker-handle","kind":"architecture"|"implementation"|"qa"|"documentation","dependsOn":[],"requiredArtifacts":["spec"],"producesArtifacts":["artifact-id"],"paths":["relative/path"],"maxRetries":0}]}. Every implementation task requires "spec"; architecture-dependent implementation names that architecture artifact and depends on its producer; QA depends on implementation and requires its artifact. Unordered tasks need pairwise-disjoint paths. Do not schedule, execute, approve, or invent handles. Extra prose is ignored.`;
    case 'work':
      return `${user}${extraLine}\n\nRole: work. Work-batch on your assigned paths only. Emit a fenced JSON changeset. Creates use content; text updates use a unified patch in patch (with optional sourceHash); deletes omit content. Patch headers and every path must stay inside the workspace and inside your assignment. Extra prose is ignored.`;
    case 'argue':
      return `${user}${extraLine}\n\nArgue round ${round}. Role: argue. Sequential ping-pong for this path. The first token of your reply MUST be AGREE @handle or DISSENT. AGREE names exactly one claimant handle as the writer for this path. Yield is AGREE on a peer handle. DISSENT is not a win. Do not emit file bodies, diffs, or JSON changesets. ${speakingVoice()}`;
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
