import { describe, expect, it } from 'vitest';
import type { BotRecord } from '../src/domain/bot';
import { idleRunState } from '../src/domain/run-state';
import { debateReachedConsensus, planDebateSlots } from '../src/app/debate-policy';
import { routeSend, routeStop, runningState } from '../src/app/run-lifecycle';
import { finalizeReviewFiles, pendingReviewState } from '../src/app/review-finalization';
import {
  collisionClaimants,
  decideWorkUnion,
  hasExactlyOneWorkPair,
  selectWorkRoles,
} from '../src/app/work-policy';

function bot(id: string, overrides: Partial<BotRecord> = {}): BotRecord {
  return {
    id,
    handle: id,
    name: id,
    persona: '',
    role: '',
    instructions: '',
    active: true,
    colorIndex: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('P1 orchestration policy boundaries', () => {
  it('routes lifecycle gates and stop behavior without performing effects', () => {
    const idle = idleRunState();
    expect(routeSend(idle, { loopActive: false, workBatchActive: false, argueActive: false })).toBe('start');
    expect(routeSend({ ...idle, splitOpen: true }, { loopActive: false, workBatchActive: false, argueActive: false })).toBe('blocked');
    expect(routeSend({ ...idle, deliverableAsk: true }, { loopActive: false, workBatchActive: false, argueActive: false })).toBe('deliverable-answer');
    expect(routeStop({ ...idle, debateRunning: true }, false, false)).toBe('pause-debate');
    expect(routeStop({ ...idle, debateRunning: true, runType: 'work' }, true, false)).toBe('abort-work');
    expect(routeStop({ ...idle, debateRunning: true, runType: 'work' }, true, true)).toBe('wait-argue');
    expect(runningState('work', ['s', 'd'], false)).toMatchObject({
      phase: 'work',
      runType: 'work',
      frozenBotIds: ['s', 'd'],
    });
  });

  it('owns Debate slot and consensus decisions as pure policy', () => {
    const bots = [bot('a'), bot('b')];
    const slots = planDebateSlots(bots, 1, 1);
    expect(slots).toHaveLength(7);
    expect(slots.at(-1)).toEqual({ botId: 'a', turn: 'implement' });
    expect(debateReachedConsensus(bots, new Map([['a', 'AGREE'], ['b', 'AGREE']]))).toBe(true);
    expect(debateReachedConsensus(bots, new Map([['a', 'AGREE'], ['b', 'DISSENT']]))).toBe(false);
  });

  it('keeps Dispatcher output advisory while host policy selects roles and validates union routing', () => {
    const spec = bot('spec', { spec: true, coreKind: 'spec' });
    const dispatcher = bot('dispatcher', { dispatcher: true, coreKind: 'dispatcher' });
    const worker = bot('worker');
    expect(hasExactlyOneWorkPair([spec, dispatcher, worker])).toBe(true);
    expect(selectWorkRoles([spec, dispatcher, worker])).toEqual({ spec, dispatcher });
    expect(decideWorkUnion([])).toEqual({ route: 'idle' });
    expect(decideWorkUnion([{ botId: 'worker', files: [{ path: 'a.ts', op: 'create', content: 'a' }] }])).toMatchObject({
      route: 'review',
    });
    const collision = {
      path: 'a.ts',
      claimants: [
        { botId: 'spec', file: { path: 'a.ts', op: 'create' as const, content: 'spec' } },
        { botId: 'worker', file: { path: 'a.ts', op: 'create' as const, content: 'worker' } },
      ],
    };
    expect(decideWorkUnion([
      { botId: 'spec', files: [collision.claimants[0]!.file] },
      { botId: 'worker', files: [collision.claimants[1]!.file] },
    ])).toMatchObject({ route: 'argue' });
    expect(collisionClaimants(collision, [spec, worker], [{ botId: 'worker', handle: 'worker', paths: ['a.ts'] }]).map((item) => item.bot.id)).toEqual(['worker']);
  });

  it('finalizes review data and state without owning workspace writes', () => {
    const files = finalizeReviewFiles(
      [{ path: 'a.ts', op: 'create', content: 'Implements PU-1.' }],
      [{ id: 'PU-1', body: 'Protected core bots' }],
    );
    expect(files[0]?.specIds).toEqual(['PU-1']);
    expect(pendingReviewState({ round: 2, runType: 'work' }, [bot('a')])).toEqual({
      phase: 'pendingReview',
      round: 2,
      splitOpen: false,
      debateRunning: false,
      applyFailed: false,
      frozenBotIds: ['a'],
      runType: 'work',
    });
  });
});
