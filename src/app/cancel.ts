import type { CancelToken, DisposableLike } from './ports';

export class CancelSource {
  private cancelled = false;
  private readonly listeners = new Set<() => void>();
  readonly token: CancelToken;

  constructor() {
    const source = this;
    this.token = {
      get isCancellationRequested() {
        return source.cancelled;
      },
      onCancellationRequested: (listener: () => void): DisposableLike => {
        if (source.cancelled) {
          listener();
        } else {
          source.listeners.add(listener);
        }
        return {
          dispose: () => {
            source.listeners.delete(listener);
          },
        };
      },
    };
  }

  cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

export function waitForCancel(token: CancelToken): Promise<void> {
  if (token.isCancellationRequested) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    token.onCancellationRequested(() => resolve());
  });
}
