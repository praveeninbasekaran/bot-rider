export interface ThreadTurn {
  id: string;
  role: 'user' | 'assistant' | 'notice';
  text: string;
  handle?: string;
  botId?: string;
  createdAt: string;
}

export class ThreadStore {
  private turns: ThreadTurn[] = [];

  list(): ThreadTurn[] {
    return this.turns.slice();
  }

  append(turn: Omit<ThreadTurn, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): ThreadTurn {
    const full: ThreadTurn = {
      id: turn.id ?? crypto.randomUUID(),
      createdAt: turn.createdAt ?? new Date().toISOString(),
      role: turn.role,
      text: turn.text,
      handle: turn.handle,
      botId: turn.botId,
    };
    this.turns.push(full);
    return full;
  }

  clear(): void {
    this.turns = [];
  }
}
