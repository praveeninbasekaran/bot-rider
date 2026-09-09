import type { BotRecord } from '../domain/bot';
import type { TurnKind } from '../domain/run-state';

export interface DebateSlot {
  botId: string;
  turn: TurnKind;
}

export function planDebateSlots(
  bots: readonly Pick<BotRecord, 'id'>[],
  fromRound: number,
  toRound: number,
): DebateSlot[] {
  const slots: DebateSlot[] = [];
  for (let round = fromRound; round <= toRound; round++) {
    for (const turn of ['propose', 'critique', 'consensus'] as const) {
      for (const bot of bots) {
        slots.push({ botId: bot.id, turn });
      }
    }
  }
  const implementer = bots[0];
  if (implementer) {
    slots.push({ botId: implementer.id, turn: 'implement' });
  }
  return slots;
}

export function debateReachedConsensus(
  bots: readonly Pick<BotRecord, 'id'>[],
  votes: ReadonlyMap<string, 'AGREE' | 'DISSENT'>,
): boolean {
  return bots.length > 0 && bots.every((bot) => votes.get(bot.id) === 'AGREE');
}

export const NO_CONSENSUS_REASON =
  'The swarm did not reach AGREE. Continue for another round or pick a bot to decide.';

export interface DebatePolicyConfig {
  quorumPercent: number;
  maxAutomaticRounds: number;
  blockingClasses: string[];
  highRiskKeywords: string[];
}

export const DEFAULT_DEBATE_POLICY: DebatePolicyConfig = {
  quorumPercent: 60,
  maxAutomaticRounds: 2,
  blockingClasses: ['security', 'privacy', 'data-loss'],
  highRiskKeywords: ['security', 'credential', 'payment', 'privacy', 'delete', 'migration'],
};

export interface BlockingObjection {
  handle: string;
  className: string;
  criterion: string;
  reason: string;
  fingerprint: string;
}

export interface DebateDecision {
  accepted: boolean;
  highRisk: boolean;
  quorumMet: boolean;
  quorumRequired: number;
  validVotes: number;
  agreeVotes: number;
  blockedBy: BlockingObjection[];
}

export function normalizeDebatePolicy(
  value: Partial<DebatePolicyConfig> | undefined,
): DebatePolicyConfig {
  const quorum = Number(value?.quorumPercent);
  const rounds = Number(value?.maxAutomaticRounds);
  return {
    quorumPercent: Number.isFinite(quorum) ? Math.max(1, Math.min(100, Math.round(quorum))) : 60,
    maxAutomaticRounds: Number.isFinite(rounds) ? Math.max(1, Math.min(5, Math.round(rounds))) : 2,
    blockingClasses: normalizeWords(value?.blockingClasses, DEFAULT_DEBATE_POLICY.blockingClasses),
    highRiskKeywords: normalizeWords(value?.highRiskKeywords, DEFAULT_DEBATE_POLICY.highRiskKeywords),
  };
}

export function synthesisOwner(bots: readonly BotRecord[]): BotRecord | undefined {
  return (
    bots.find((bot) => bot.dispatcher || bot.coreKind === 'dispatcher') ??
    bots.find((bot) => bot.spec || bot.coreKind === 'spec') ??
    bots[0]
  );
}

export function selectDebateObjectors(
  bots: readonly BotRecord[],
  synthesizerId: string,
): BotRecord[] {
  const peers = bots.filter((bot) => bot.id !== synthesizerId);
  const relevant = peers.filter((bot) =>
    /\b(review|qa|test|security|privacy|risk|architect|compliance|critic)\b/i.test(
      `${bot.role} ${bot.persona} ${bot.instructions}`,
    ),
  );
  return relevant.length > 0 ? relevant : peers;
}

export function parseBlockingObjection(handle: string, text: string): BlockingObjection | undefined {
  const first = text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? '';
  const match = first.match(
    /^BLOCKING\s+([a-z][a-z0-9_-]{1,31})\s*:\s*([^\u2014-]{3,120})\s*(?:\u2014|--)\s*(.{3,240})$/i,
  );
  if (!match) {
    return undefined;
  }
  const className = match[1]!.toLowerCase();
  const criterion = compact(match[2]!);
  const reason = compact(match[3]!);
  return {
    handle,
    className,
    criterion,
    reason,
    fingerprint: `${className}:${criterion.toLowerCase()}:${reason.toLowerCase()}`,
  };
}

export function isHighRiskDebate(text: string, config: DebatePolicyConfig): boolean {
  const value = text.toLowerCase();
  return config.highRiskKeywords.some((keyword) => value.includes(keyword.toLowerCase()));
}

export function evaluateDebateDecision(args: {
  botIds: readonly string[];
  votes: ReadonlyMap<string, 'AGREE' | 'DISSENT'>;
  objections: readonly BlockingObjection[];
  highRisk: boolean;
  config: DebatePolicyConfig;
}): DebateDecision {
  const valid = args.botIds.filter((id) => {
    const vote = args.votes.get(id);
    return vote === 'AGREE' || vote === 'DISSENT';
  });
  const agreeVotes = valid.filter((id) => args.votes.get(id) === 'AGREE').length;
  const quorumRequired = Math.max(1, Math.ceil(args.botIds.length * args.config.quorumPercent / 100));
  const quorumMet = valid.length >= quorumRequired;
  const enabled = new Set(args.config.blockingClasses.map((item) => item.toLowerCase()));
  const blockedBy = args.objections.filter((item) => enabled.has(item.className));
  const votePassed = args.highRisk
    ? valid.length === args.botIds.length && agreeVotes === args.botIds.length
    : agreeVotes > valid.length / 2;
  return {
    accepted: quorumMet && votePassed && blockedBy.length === 0,
    highRisk: args.highRisk,
    quorumMet,
    quorumRequired,
    validVotes: valid.length,
    agreeVotes,
    blockedBy,
  };
}

export function unchangedObjections(
  previous: readonly BlockingObjection[],
  current: readonly BlockingObjection[],
): boolean {
  if (previous.length === 0 || previous.length !== current.length) {
    return false;
  }
  const left = previous.map((item) => item.fingerprint).sort();
  const right = current.map((item) => item.fingerprint).sort();
  return left.every((item, index) => item === right[index]);
}

export function conciseDissentSummary(
  objections: readonly BlockingObjection[],
  votes: ReadonlyMap<string, 'AGREE' | 'DISSENT'>,
  handles: ReadonlyMap<string, string>,
): string {
  const concrete = [...new Map(objections.map((item) => [item.fingerprint, item])).values()]
    .slice(0, 3)
    .map((item) => `@${item.handle}: ${item.className} — ${item.criterion}`);
  if (concrete.length > 0) {
    return concrete.join('\n');
  }
  const dissenters = [...votes]
    .filter(([, vote]) => vote === 'DISSENT')
    .map(([id]) => `@${handles.get(id) ?? id}`)
    .sort();
  return dissenters.length ? `Unresolved dissent: ${dissenters.join(', ')}` : 'Quorum was not met.';
}

function normalizeWords(value: readonly string[] | undefined, fallback: readonly string[]): string[] {
  const words = (value ?? fallback).map((item) => item.trim().toLowerCase()).filter(Boolean);
  return [...new Set(words)].sort();
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
