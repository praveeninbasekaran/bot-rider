import { describe, expect, it } from 'vitest';
import type { BotRecord } from '../src/domain/bot';
import {
  DEFAULT_DEBATE_POLICY,
  evaluateDebateDecision,
  isHighRiskDebate,
  normalizeDebatePolicy,
  parseBlockingObjection,
  selectDebateObjectors,
  synthesisOwner,
  unchangedObjections,
} from '../src/app/debate-policy';

function bot(id: string, role = 'worker', extra: Partial<BotRecord> = {}): BotRecord {
  return {
    id,
    name: id,
    handle: id,
    persona: '',
    role,
    instructions: '',
    active: true,
    colorIndex: 0,
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

describe('PU-5 deterministic Debate convergence policy', () => {
  it('prefers Dispatcher synthesis and targets decision-review roles', () => {
    const bots = [
      bot('coder'),
      bot('reviewer', 'security reviewer'),
      bot('dispatcher', 'coordinator', { dispatcher: true }),
    ];
    expect(synthesisOwner(bots)?.id).toBe('dispatcher');
    expect(selectDebateObjectors(bots, 'dispatcher').map((item) => item.id)).toEqual(['reviewer']);
  });

  it('validates concrete blockers and fingerprints unchanged objections', () => {
    const blocker = parseBlockingObjection(
      'reviewer',
      'BLOCKING security: authentication acceptance — credentials can leak',
    );
    expect(blocker).toMatchObject({ className: 'security', handle: 'reviewer' });
    expect(parseBlockingObjection('reviewer', 'I do not like it.')).toBeUndefined();
    expect(unchangedObjections([blocker!], [{ ...blocker! }])).toBe(true);
  });

  it('accepts an ordinary majority only after quorum', () => {
    const config = normalizeDebatePolicy({ quorumPercent: 60 });
    const accepted = evaluateDebateDecision({
      botIds: ['a', 'b', 'c'],
      votes: new Map([['a', 'AGREE'], ['b', 'AGREE'], ['c', 'DISSENT']]),
      objections: [],
      highRisk: false,
      config,
    });
    expect(accepted).toMatchObject({ accepted: true, quorumMet: true, agreeVotes: 2 });
    const noQuorum = evaluateDebateDecision({
      botIds: ['a', 'b', 'c'],
      votes: new Map([['a', 'AGREE']]),
      objections: [],
      highRisk: false,
      config,
    });
    expect(noQuorum).toMatchObject({ accepted: false, quorumMet: false });
  });

  it('lets configured blockers veto and reserves unanimity for high risk', () => {
    const blocker = parseBlockingObjection('reviewer', 'BLOCKING security: auth AC — token is exposed')!;
    const votes = new Map<string, 'AGREE' | 'DISSENT'>([
      ['a', 'AGREE'],
      ['b', 'AGREE'],
      ['c', 'DISSENT'],
    ]);
    expect(evaluateDebateDecision({
      botIds: ['a', 'b', 'c'],
      votes,
      objections: [blocker],
      highRisk: false,
      config: DEFAULT_DEBATE_POLICY,
    }).accepted).toBe(false);
    expect(evaluateDebateDecision({
      botIds: ['a', 'b', 'c'],
      votes,
      objections: [],
      highRisk: true,
      config: DEFAULT_DEBATE_POLICY,
    }).accepted).toBe(false);
    expect(isHighRiskDebate('Delete credential records', DEFAULT_DEBATE_POLICY)).toBe(true);
  });

  it('bounds policy settings', () => {
    expect(normalizeDebatePolicy({ quorumPercent: 200, maxAutomaticRounds: 20 })).toMatchObject({
      quorumPercent: 100,
      maxAutomaticRounds: 5,
    });
  });
});
