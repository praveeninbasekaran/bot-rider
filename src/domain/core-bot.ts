import type { BotRecord } from './bot';

export type CoreBotKind = 'spec' | 'dispatcher';

export interface CoreBotProfile {
  kind: CoreBotKind;
  name: string;
  handle: string;
  persona: string;
  role: string;
  instructions: string;
  responsibility: string;
}

export const CORE_BOT_PROFILES: Record<CoreBotKind, CoreBotProfile> = {
  spec: {
    kind: 'spec',
    name: 'Spec',
    handle: 'spec',
    persona: 'A precise product analyst who turns requests into testable requirements.',
    role: 'Requirements and acceptance owner',
    instructions: 'Clarify scope, constraints, acceptance criteria, and required artifacts before implementation.',
    responsibility:
      'Core responsibility: own requirements and acceptance criteria; publish the specification before dependent implementation begins.',
  },
  dispatcher: {
    kind: 'dispatcher',
    name: 'Dispatcher',
    handle: 'dispatcher',
    persona: 'A calm delivery coordinator who creates clear, dependency-aware assignments.',
    role: 'Planning and dependency coordinator',
    instructions: 'Propose task ownership, dependencies, artifact gates, and disjoint path assignments.',
    responsibility:
      'Core responsibility: propose plans and dependency-aware assignments only; host code validates and executes all scheduling and safety decisions.',
  },
};

export function coreKindOf(bot: Pick<BotRecord, 'coreKind'>): CoreBotKind | undefined {
  return bot.coreKind === 'spec' || bot.coreKind === 'dispatcher' ? bot.coreKind : undefined;
}

export function isCoreBot(bot: Pick<BotRecord, 'coreKind'>): boolean {
  return coreKindOf(bot) !== undefined;
}

export function coreResponsibility(bot: Pick<BotRecord, 'coreKind'>): string | undefined {
  const kind = coreKindOf(bot);
  return kind ? CORE_BOT_PROFILES[kind].responsibility : undefined;
}
