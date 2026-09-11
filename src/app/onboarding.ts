import type { BotDraft } from '../domain/bot';
import type { StateStore } from './ports';

export const ONBOARDING_STATE_KEY = 'botrider.onboarding.v1';
export type WorkerTemplateId = 'coder' | 'reviewer' | 'writer';

export interface OnboardingState {
  open: boolean;
  complete: boolean;
}

export const ONBOARDING_SAMPLE_TASK =
  'Review this workspace and propose one small, safe improvement with clear acceptance criteria.';

export const WORKER_BOT_TEMPLATES: Record<WorkerTemplateId, BotDraft> = {
  coder: {
    name: 'Coder',
    handle: 'coder',
    persona: 'A pragmatic implementation specialist.',
    role: 'Implementation worker',
    instructions: 'Implement assigned, dependency-ready work within the paths provided by the Dispatcher.',
  },
  reviewer: {
    name: 'Reviewer',
    handle: 'reviewer',
    persona: 'A careful reviewer focused on correctness and regressions.',
    role: 'Review worker',
    instructions: 'Review completed implementation against the Spec acceptance criteria.',
  },
  writer: {
    name: 'Writer',
    handle: 'writer',
    persona: 'A concise technical writer.',
    role: 'Documentation worker',
    instructions: 'Create or update only the documentation assigned by the Dispatcher.',
  },
};

export class OnboardingStore {
  private complete: boolean;
  private forcedOpen = false;

  constructor(private readonly store: StateStore) {
    this.complete = store.get<{ complete?: boolean }>(ONBOARDING_STATE_KEY)?.complete === true;
  }

  snapshot(): OnboardingState {
    return { open: !this.complete || this.forcedOpen, complete: this.complete };
  }

  dismiss(): OnboardingState {
    this.forcedOpen = false;
    return { open: false, complete: this.complete };
  }

  reopen(): OnboardingState {
    this.forcedOpen = true;
    return this.snapshot();
  }

  async markComplete(): Promise<OnboardingState> {
    this.complete = true;
    this.forcedOpen = false;
    await this.store.update(ONBOARDING_STATE_KEY, { complete: true });
    return this.snapshot();
  }
}
