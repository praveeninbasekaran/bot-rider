import { describe, expect, it } from 'vitest';
import { CancelSource } from '../src/app/cancel';
import { CopilotRequestScheduler, normalizeCopilotConcurrency } from '../src/app/copilot-scheduler';

describe('PU-3 bounded Copilot scheduler', () => {
  it('normalizes the user setting and queues above the active cap', async () => {
    expect(normalizeCopilotConcurrency(0)).toBe(1);
    expect(normalizeCopilotConcurrency(99)).toBe(16);
    expect(normalizeCopilotConcurrency(Number.NaN)).toBe(4);
    const scheduler = new CopilotRequestScheduler(2);
    const tokens = [new CancelSource(), new CancelSource(), new CancelSource()];
    const first = await scheduler.acquire(tokens[0]!.token, { handle: 'a' });
    const second = await scheduler.acquire(tokens[1]!.token, { handle: 'b' });
    const thirdPromise = scheduler.acquire(tokens[2]!.token, { handle: 'c' });
    expect(scheduler.snapshot().requests.map((item) => item.state)).toEqual([
      'inFlight',
      'inFlight',
      'queued',
    ]);
    first!();
    const third = await thirdPromise;
    expect(scheduler.snapshot().requests.find((item) => item.handle === 'c')?.state).toBe('inFlight');
    second!();
    third!();
  });

  it('uses a bounded priority lane without starving FIFO normal work', async () => {
    const scheduler = new CopilotRequestScheduler(1);
    const source = new CancelSource();
    const blocker = await scheduler.acquire(source.token, { handle: 'blocker' });
    const order: string[] = [];
    const releases: Array<() => void> = [];
    const enqueue = (handle: string, priority: 'user' | 'normal') => {
      void scheduler.acquire(source.token, { handle, priority }).then((release) => {
        if (release) {
          order.push(handle);
          releases.push(release);
        }
      });
    };
    enqueue('normal-1', 'normal');
    enqueue('normal-2', 'normal');
    enqueue('priority-1', 'user');
    enqueue('priority-2', 'user');
    enqueue('priority-3', 'user');
    enqueue('priority-4', 'user');
    blocker!();
    for (let index = 0; index < 5; index++) {
      await Promise.resolve();
      releases.shift()?.();
    }
    await Promise.resolve();
    expect(order.slice(0, 5)).toEqual([
      'priority-1',
      'priority-2',
      'priority-3',
      'normal-1',
      'priority-4',
    ]);
  });

  it('removes a cancelled queued request without consuming a lease', async () => {
    const scheduler = new CopilotRequestScheduler(1);
    const active = new CancelSource();
    const queued = new CancelSource();
    const release = await scheduler.acquire(active.token, { handle: 'active' });
    const waiting = scheduler.acquire(queued.token, { handle: 'queued' });
    queued.cancel();
    expect(await waiting).toBeUndefined();
    expect(scheduler.snapshot().requests.map((item) => item.handle)).toEqual(['active']);
    release!();
  });
});
