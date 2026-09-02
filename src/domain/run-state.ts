export type TurnKind =
  | 'propose'
  | 'critique'
  | 'consensus'
  | 'direct'
  | 'implement'
  | 'spec'
  | 'dispatch'
  | 'work'
  | 'argue';

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
  /** True while sequential Argue is in flight after Work-batch collision. */
  argue?: boolean;
  /** Workspace-relative path currently being argued. Header `ARGUE · {path}`. */
  arguePath?: string;
  /** Argue round 1 or 2 for this path. Not F7 `ROUND n · CRITIQUE`. */
  argueRound?: 1 | 2;
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
