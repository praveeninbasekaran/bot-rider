import type { BotRecord } from '../domain/bot';
import type { ChangeFile } from '../domain/changeset';
import type { RunStateDto } from '../domain/run-state';
import { attachFileCites, type OpenSpecEntry } from './openspec-catalog';

export function finalizeReviewFiles(
  files: readonly ChangeFile[],
  catalog: readonly OpenSpecEntry[],
): ChangeFile[] {
  return files.map((file) => attachFileCites(file, catalog));
}

export function pendingReviewState(
  current: Pick<RunStateDto, 'round' | 'runType'>,
  frozen: readonly Pick<BotRecord, 'id'>[],
): RunStateDto {
  return {
    phase: 'pendingReview',
    round: current.round,
    splitOpen: false,
    debateRunning: false,
    applyFailed: false,
    frozenBotIds: frozen.map((bot) => bot.id),
    runType: current.runType,
  };
}
