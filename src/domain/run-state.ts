export type TurnKind = 'propose' | 'critique' | 'consensus' | 'direct' | 'implement';

export type RunPhase =
  | 'idle'
  | 'debate'
  | 'direct'
  | 'implement'
  | 'split'
  | 'pendingReview'
  | 'error';

export interface RunStateDto {
  phase: RunPhase;
  round: number;
  splitOpen: boolean;
  debateRunning: boolean;
  applyFailed: boolean;
  frozenBotIds: string[];
  currentBotId?: string;
  turn?: TurnKind;
}

export function idleRunState(): RunStateDto {
  return {
    phase: 'idle',
    round: 0,
    splitOpen: false,
    debateRunning: false,
    applyFailed: false,
    frozenBotIds: [],
  };
}
