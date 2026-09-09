import type { CancelToken, DisposableLike } from './ports';

export type CopilotRequestState = 'queued' | 'inFlight' | 'retrying';

export interface CopilotRequestStatus {
  id: number;
  botId?: string;
  handle?: string;
  state: CopilotRequestState;
  priority: 'user' | 'normal';
  attempt: number;
  nextRetryAt?: number;
}

export interface CopilotSchedulerSnapshot {
  maxConcurrent: number;
  requests: CopilotRequestStatus[];
}

type Waiting = {
  status: CopilotRequestStatus;
  token: CancelToken;
  resolve: (release: (() => void) | undefined) => void;
  subscription?: DisposableLike;
};

export class CopilotRequestScheduler {
  private maxConcurrent: number;
  private active = 0;
  private nextId = 1;
  private priorityBurst = 0;
  private readonly waiting: Waiting[] = [];
  private readonly activeRequests = new Map<number, CopilotRequestStatus>();
  private readonly retrying = new Map<number, CopilotRequestStatus>();

  constructor(
    maxConcurrent = 4,
    private readonly onChange: (snapshot: CopilotSchedulerSnapshot) => void = () => undefined,
  ) {
    this.maxConcurrent = normalizeCopilotConcurrency(maxConcurrent);
  }

  setMaxConcurrent(value: number): void {
    this.maxConcurrent = normalizeCopilotConcurrency(value);
    this.drain();
    this.emit();
  }

  snapshot(): CopilotSchedulerSnapshot {
    const requests = [
      ...this.activeRequests.values(),
      ...this.waiting.map((item) => item.status),
      ...this.retrying.values(),
    ]
      .map((item) => ({ ...item }))
      .sort((left, right) => left.id - right.id);
    return { maxConcurrent: this.maxConcurrent, requests };
  }

  acquire(
    token: CancelToken,
    meta: { botId?: string; handle?: string; priority?: 'user' | 'normal'; attempt?: number } = {},
  ): Promise<(() => void) | undefined> {
    if (token.isCancellationRequested) {
      return Promise.resolve(undefined);
    }
    const status: CopilotRequestStatus = {
      id: this.nextId++,
      state: 'queued',
      priority: meta.priority ?? 'normal',
      attempt: meta.attempt ?? 0,
    };
    if (meta.botId) status.botId = meta.botId;
    if (meta.handle) status.handle = meta.handle;
    return new Promise((resolve) => {
      const entry: Waiting = { status, token, resolve };
      this.waiting.push(entry);
      let subscription: DisposableLike = { dispose: () => undefined };
      subscription = token.onCancellationRequested(() => {
        const index = this.waiting.indexOf(entry);
        if (index >= 0) {
          this.waiting.splice(index, 1);
          subscription.dispose();
          resolve(undefined);
          this.emit();
        }
      });
      entry.subscription = subscription;
      this.drain();
      this.emit();
    });
  }

  markRetrying(
    request: Omit<CopilotRequestStatus, 'id' | 'state'>,
    delayMs: number,
  ): { id: number; clear: () => void } {
    const id = this.nextId++;
    const status: CopilotRequestStatus = {
      ...request,
      id,
      state: 'retrying',
      nextRetryAt: Date.now() + delayMs,
    };
    this.retrying.set(id, status);
    this.emit();
    return {
      id,
      clear: () => {
        if (this.retrying.delete(id)) this.emit();
      },
    };
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.waiting.length > 0) {
      const index = this.nextWaitingIndex();
      const entry = this.waiting.splice(index, 1)[0]!;
      entry.subscription?.dispose();
      if (entry.token.isCancellationRequested) {
        entry.resolve(undefined);
        continue;
      }
      entry.status.state = 'inFlight';
      this.active += 1;
      this.activeRequests.set(entry.status.id, entry.status);
      let released = false;
      entry.resolve(() => {
        if (released) return;
        released = true;
        this.active -= 1;
        this.activeRequests.delete(entry.status.id);
        this.drain();
        this.emit();
      });
    }
  }

  private nextWaitingIndex(): number {
    const normal = this.waiting.findIndex((item) => item.status.priority === 'normal');
    const priority = this.waiting.findIndex((item) => item.status.priority === 'user');
    if (priority >= 0 && (normal < 0 || this.priorityBurst < 3)) {
      this.priorityBurst += 1;
      return priority;
    }
    this.priorityBurst = 0;
    return normal >= 0 ? normal : 0;
  }

  private emit(): void {
    this.onChange(this.snapshot());
  }
}

export function normalizeCopilotConcurrency(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(16, Math.floor(value))) : 4;
}
