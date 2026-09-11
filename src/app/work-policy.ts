import type { BotRecord } from '../domain/bot';
import type { ChangeFile } from '../domain/changeset';
import {
  workPathClaims,
  type CollisionClaim,
  type ValidatedAssignment,
} from './work-split';

export function hasExactlyOneWorkPair(bots: readonly BotRecord[]): boolean {
  const active = bots.filter((bot) => bot.active);
  return active.filter((bot) => bot.dispatcher).length === 1 && active.filter((bot) => bot.spec).length === 1;
}

export function selectWorkRoles(
  bots: readonly BotRecord[],
): { spec: BotRecord; dispatcher: BotRecord } | undefined {
  const active = bots.filter((bot) => bot.active);
  const specs = active.filter((bot) => bot.spec);
  const dispatchers = active.filter((bot) => bot.dispatcher);
  if (specs.length !== 1 || dispatchers.length !== 1) {
    return undefined;
  }
  return { spec: specs[0]!, dispatcher: dispatchers[0]! };
}

export type WorkUnionDecision =
  | { route: 'idle' }
  | { route: 'review'; files: ChangeFile[] }
  | { route: 'argue'; remainder: ChangeFile[]; collisions: CollisionClaim[] };

export function decideWorkUnion(
  byWorker: readonly { botId: string; files: ChangeFile[] }[],
): WorkUnionDecision {
  const claims = workPathClaims([...byWorker]);
  if (claims.collisions.length > 0) {
    return { route: 'argue', remainder: claims.remainder, collisions: claims.collisions };
  }
  return claims.remainder.length > 0
    ? { route: 'review', files: claims.remainder }
    : { route: 'idle' };
}

export function collisionClaimants(
  collision: CollisionClaim,
  bots: readonly BotRecord[],
  assignments: readonly ValidatedAssignment[],
): { bot: BotRecord; file: ChangeFile }[] {
  const assigned = (botId: string, path: string): boolean =>
    assignments.some((item) => item.botId === botId && item.paths.includes(path));
  return collision.claimants
    .flatMap((claim) => {
      const bot = bots.find((item) => item.id === claim.botId);
      if (!bot || ((bot.dispatcher || bot.spec) && !assigned(bot.id, collision.path))) {
        return [];
      }
      return [{ bot, file: claim.file }];
    })
    .sort((left, right) => left.bot.handle.localeCompare(right.bot.handle));
}
