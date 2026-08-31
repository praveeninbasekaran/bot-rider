import type { RunBoardDto } from '../protocol/messages';

const SKIP_FACT = /^(AGREE|DISSENT)\b/i;
const HEADING_DUMP = /^#{1,6}\s/;

/** Curate one-liners from the board + current-turn MCP + host decisions. Not a transcript dump. */
export function curateFacts(board: RunBoardDto, mcpNotes: string[] = []): string[] {
  const facts: string[] = [];
  const add = (raw?: string): void => {
    const line = oneLine(raw);
    if (!line || SKIP_FACT.test(line) || HEADING_DUMP.test(line)) {
      return;
    }
    if (facts.some((f) => f.toLowerCase() === line.toLowerCase())) {
      return;
    }
    facts.push(line);
  };

  add(board.goal);
  for (const todo of board.todos) {
    add(todo.text);
  }
  for (const decision of board.decisions) {
    add(decision);
  }
  for (const note of mcpNotes) {
    add(note);
  }
  return facts.slice(0, 24);
}

function oneLine(raw?: string): string {
  if (!raw) {
    return '';
  }
  return raw.replace(/\s+/g, ' ').trim();
}
