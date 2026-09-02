export type TurnKind =
  | 'propose'
  | 'critique'
  | 'consensus'
  | 'direct'
  | 'implement'
  | 'spec'
  | 'dispatch'
  | 'work';

export type RunPhase =
  | 'idle'
  | 'debate'
  | 'direct'
  | 'implement'
  | 'work'
  | 'split'
  | 'pendingReview'
  | 'error';

export type RunType = 'debate' | 'work';

export interface RunStateDto {
  phase: RunPhase;
  round: number;
  splitOpen: boolean;
  debateRunning: boolean;
  applyFailed: boolean;
  frozenBotIds: string[];
  currentBotId?: string;
  turn?: TurnKind;
  /** Composer stays enabled for the SD ask. Does not override Split lock. */
  deliverableAsk?: boolean;
  /** Absent on Debate (default Send). Set for Work. */
  runType?: RunType;
  /** True only while a Work-batch is in flight. Debate composer-lock ignores this. */
  workBatch?: boolean;
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
