import type { RunStateDto, RunType } from '../domain/run-state';

export type SendRoute = 'blocked' | 'deliverable-answer' | 'work-batch-message' | 'start';
export type StopRoute = 'none' | 'abort-work' | 'wait-argue' | 'pause-debate' | 'close-split';

export function routeSend(
  state: RunStateDto,
  flags: { loopActive: boolean; workBatchActive: boolean; argueActive: boolean },
): SendRoute {
  if (state.splitOpen) {
    return 'blocked';
  }
  if (state.deliverableAsk) {
    return 'deliverable-answer';
  }
  if (flags.workBatchActive || flags.argueActive) {
    return 'work-batch-message';
  }
  if (state.debateRunning || flags.loopActive || state.phase === 'pendingReview' || state.phase === 'implement') {
    return 'blocked';
  }
  return 'start';
}

export function routeStop(state: RunStateDto, isWorkRun: boolean, argueActive: boolean): StopRoute {
  if (state.debateRunning && isWorkRun) {
    return argueActive ? 'wait-argue' : 'abort-work';
  }
  if (state.debateRunning) {
    return 'pause-debate';
  }
  if (state.splitOpen) {
    return 'close-split';
  }
  return 'none';
}

export function runningState(
  runType: RunType | 'direct',
  frozenBotIds: string[],
  applyFailed: boolean,
): RunStateDto {
  if (runType === 'direct') {
    return {
      phase: 'direct',
      round: 1,
      splitOpen: false,
      debateRunning: true,
      applyFailed,
      frozenBotIds,
      currentBotId: frozenBotIds[0],
      turn: 'direct',
    };
  }
  return {
    phase: runType,
    round: runType === 'work' ? 1 : 0,
    splitOpen: false,
    debateRunning: true,
    applyFailed,
    frozenBotIds,
    runType: runType === 'work' ? 'work' : undefined,
  };
}
