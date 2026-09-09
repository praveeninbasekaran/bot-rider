import type { RunBoardDto } from '../protocol/messages';

export type TodoStatus = 'pending' | 'current' | 'done';

export function emptyBoard(): RunBoardDto {
  return { todos: [], decisions: [], dissents: [], files: [] };
}

export function isBoardEmpty(board: RunBoardDto): boolean {
  return (
    !board.goal &&
    board.todos.length === 0 &&
    board.decisions.length === 0 &&
    board.dissents.length === 0 &&
    board.files.length === 0
  );
}

const TODO_LINE = /^\s*[-*]\s*\[([ xX>])\]\s+(.+)$/;

export function isParseableTodoLine(line: string): boolean {
  const match = line.match(TODO_LINE);
  return !!match && !!(match[2] ?? '').trim();
}

export function parseTodoLines(text: string): { text: string; status: TodoStatus }[] {
  const out: { text: string; status: TodoStatus }[] = [];
  let fence = false;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence) {
      continue;
    }
    const match = raw.match(TODO_LINE);
    if (!match) {
      continue;
    }
    const mark = match[1] ?? ' ';
    const item = (match[2] ?? '').trim();
    if (!item) {
      continue;
    }
    const status: TodoStatus = mark === '>' ? 'current' : /x/i.test(mark) ? 'done' : 'pending';
    out.push({ text: item, status });
  }
  return out;
}

export function boardPackText(board: RunBoardDto): string {
  const lines: string[] = ['Run board:'];
  if (board.goal) {
    lines.push(`Goal: ${board.goal}`);
  }
  if (board.todos.length > 0) {
    lines.push('Todos:');
    for (const todo of board.todos) {
      const mark = todo.status === 'done' ? 'x' : todo.status === 'current' ? '>' : ' ';
      lines.push(`- [${mark}] ${todo.text}`);
    }
  }
  if (board.decisions.length > 0) {
    lines.push('Decisions:');
    for (const decision of board.decisions) {
      lines.push(`- ${decision}`);
    }
  }
  if (board.dissents.length > 0) {
    lines.push('Dissents:');
    for (const dissent of board.dissents) {
      lines.push(`- @${dissent.handle} — ${dissent.text}`);
    }
  }
  if (board.files.length > 0) {
    lines.push('Files in play:');
    for (const file of board.files) {
      lines.push(file.inChangeset ? `- ${file.path} (in changeset)` : `- ${file.path}`);
    }
  }
  if (lines.length === 1) {
    lines.push('(empty)');
  }
  return lines.join('\n');
}

function normalizeTodo(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Session-only host facts. Dies with the extension host, like ThreadStore. */
export class RunBoardStore {
  private goal: string | undefined;
  private todos: { id: string; text: string; status: TodoStatus }[] = [];
  private decisions: string[] = [];
  private dissents: { handle: string; text: string }[] = [];
  private files: { path: string; inChangeset: boolean }[] = [];
  private nextTodo = 1;

  snapshot(): RunBoardDto {
    return {
      goal: this.goal,
      todos: this.todos.map((t) => ({ ...t })),
      decisions: [...this.decisions],
      dissents: this.dissents.map((d) => ({ ...d })),
      files: this.files.map((f) => ({ ...f })),
    };
  }

  restore(snapshot: RunBoardDto): void {
    this.goal = snapshot.goal;
    this.todos = snapshot.todos.map((todo) => ({ ...todo }));
    this.decisions = snapshot.decisions.slice();
    this.dissents = snapshot.dissents.map((dissent) => ({ ...dissent }));
    this.files = snapshot.files.map((file) => ({ ...file }));
  }

  clear(): void {
    this.goal = undefined;
    this.todos = [];
    this.decisions = [];
    this.dissents = [];
    this.files = [];
    this.nextTodo = 1;
  }

  setGoal(text: string): void {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    this.goal = trimmed || undefined;
  }

  addDecision(line: string): void {
    const text = line.replace(/\s+/g, ' ').trim();
    if (!text) {
      return;
    }
    const key = normalizeTodo(text);
    const existing = this.decisions.findIndex((decision) => normalizeTodo(decision) === key);
    if (existing >= 0) {
      if (text < this.decisions[existing]!) {
        this.decisions[existing] = text;
        this.decisions.sort((left, right) => normalizeTodo(left).localeCompare(normalizeTodo(right)));
      }
      return;
    }
    this.decisions.push(text);
    this.decisions.sort((left, right) => normalizeTodo(left).localeCompare(normalizeTodo(right)));
  }

  setDissents(items: { handle: string; text: string }[]): void {
    this.dissents = items.map((d) => ({
      handle: d.handle,
      text: d.text.replace(/\s+/g, ' ').trim(),
    }));
  }

  clearDissents(): void {
    this.dissents = [];
  }

  setFiles(paths: string[], changesetPaths: string[] = []): void {
    const seen = new Set<string>();
    const inSet = new Set(changesetPaths);
    this.files = [];
    for (const path of paths) {
      if (!path || seen.has(path)) {
        continue;
      }
      seen.add(path);
      this.files.push({ path, inChangeset: inSet.has(path) });
    }
    for (const path of changesetPaths) {
      if (!path || seen.has(path)) {
        continue;
      }
      seen.add(path);
      this.files.push({ path, inChangeset: true });
    }
  }

  setTaskGraph(
    tasks: readonly {
      id: string;
      owner: string;
      readiness: 'blocked' | 'ready' | 'running' | 'settled';
      outcome: 'completed' | 'failed' | 'cancelled' | 'skipped' | null;
      blockedBy: readonly string[];
    }[],
  ): void {
    this.todos = tasks.map((task) => {
      const reason = task.readiness === 'blocked' && task.blockedBy.length
        ? ` · blocked: ${task.blockedBy.join(', ')}`
        : '';
      return {
        id: task.id,
        text: `${task.id} · @${task.owner}${reason}`,
        status:
          task.outcome === 'completed'
            ? 'done'
            : task.readiness === 'running'
              ? 'current'
              : 'pending',
      };
    });
  }

  mergeParseableTodos(text: string): void {
    const parsed = parseTodoLines(text);
    if (parsed.length === 0) {
      return;
    }
    for (const item of parsed) {
      const key = normalizeTodo(item.text);
      const existing = this.todos.find((t) => normalizeTodo(t.text) === key);
      if (existing) {
        existing.status = strongerStatus(existing.status, item.status);
        continue;
      }
      this.todos.push({
        id: `t${this.nextTodo}`,
        text: item.text,
        status: item.status,
      });
      this.nextTodo += 1;
    }
    this.todos.sort((left, right) => normalizeTodo(left.text).localeCompare(normalizeTodo(right.text)));
    this.todos.forEach((todo, index) => {
      todo.id = `t${index + 1}`;
    });
    this.nextTodo = this.todos.length + 1;
  }
}

function strongerStatus(left: TodoStatus, right: TodoStatus): TodoStatus {
  const rank: Record<TodoStatus, number> = { pending: 0, current: 1, done: 2 };
  return rank[right] > rank[left] ? right : left;
}
