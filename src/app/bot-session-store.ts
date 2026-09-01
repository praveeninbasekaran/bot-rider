import type { PromptMessage, RunBoardDto } from '../protocol/messages';

export type IsolationPacket = {
  id: string;
  fromBotId?: string;
  at: 'turn-end' | 'consensus' | 'pick';
  requirements: string[];
  decisions: string[];
  constraints: string[];
  openQuestions: string[];
};

export type BotSession = {
  botId: string;
  messages: PromptMessage[];
  inbox: IsolationPacket[];
};

function copyPacket(packet: IsolationPacket): IsolationPacket {
  const next: IsolationPacket = {
    id: packet.id,
    at: packet.at,
    requirements: [...packet.requirements],
    decisions: [...packet.decisions],
    constraints: [...packet.constraints],
    openQuestions: [...packet.openQuestions],
  };
  if (packet.fromBotId) {
    next.fromBotId = packet.fromBotId;
  }
  return next;
}

function copyMessages(messages: PromptMessage[]): PromptMessage[] {
  return messages.map((m) => ({ ...m }));
}

function section(lines: string[], title: string, items: string[]): void {
  lines.push(`${title}:`);
  if (items.length === 0) {
    lines.push('(none)');
    return;
  }
  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

/** Structured user message: field text verbatim. Not a lossy summary. */
export function packetToMessage(packet: IsolationPacket): PromptMessage {
  const lines = ['Isolation packet:'];
  if (packet.fromBotId) {
    lines.push(`From: ${packet.fromBotId}`);
  }
  lines.push(`At: ${packet.at}`);
  section(lines, 'Requirements', packet.requirements);
  section(lines, 'Decisions', packet.decisions);
  section(lines, 'Constraints', packet.constraints);
  section(lines, 'Open questions', packet.openQuestions);
  return { role: 'user', content: lines.join('\n') };
}

/**
 * Host-owned packet from RunBoard + lasting turn facts.
 * Does not paste HV articles or failed drafts into requirements.
 */
export function buildIsolationPacket(args: {
  at: IsolationPacket['at'];
  fromBotId?: string;
  board: RunBoardDto;
  trailer?: 'NEED_EDIT' | 'NO_EDIT';
  id?: string;
}): IsolationPacket {
  const requirements: string[] = [];
  if (args.board.goal) {
    requirements.push(args.board.goal);
  }
  for (const todo of args.board.todos) {
    if (todo.text) {
      requirements.push(todo.text);
    }
  }
  const decisions = [...args.board.decisions];
  const constraints: string[] = [];
  for (const file of args.board.files) {
    constraints.push(file.inChangeset ? `${file.path} (in changeset)` : file.path);
  }
  if (args.trailer) {
    constraints.push(args.trailer);
  }
  const openQuestions = args.board.dissents.map((d) => `@${d.handle} — ${d.text}`);
  const packet: IsolationPacket = {
    id: args.id ?? crypto.randomUUID(),
    at: args.at,
    requirements,
    decisions,
    constraints,
    openQuestions,
  };
  if (args.fromBotId) {
    packet.fromBotId = args.fromBotId;
  }
  return packet;
}

/** In-memory per-bot Copilot session. Dies with the host. Not persisted with bots. */
export class BotSessionStore {
  private readonly sessions = new Map<string, BotSession>();

  clear(): void {
    this.sessions.clear();
  }

  peek(botId: string): BotSession | undefined {
    const found = this.sessions.get(botId);
    return found ? this.copySession(found) : undefined;
  }

  messagesOf(botId: string): PromptMessage[] {
    const found = this.sessions.get(botId);
    return found ? copyMessages(found.messages) : [];
  }

  takeInbox(botId: string): IsolationPacket[] {
    const session = this.sessions.get(botId);
    if (!session || session.inbox.length === 0) {
      return [];
    }
    const inbox = session.inbox.map(copyPacket);
    session.inbox = [];
    return inbox;
  }

  enqueue(botId: string, packet: IsolationPacket): void {
    this.ensure(botId).inbox.push(copyPacket(packet));
  }

  append(botId: string, messages: PromptMessage[]): void {
    if (messages.length === 0) {
      return;
    }
    this.ensure(botId).messages.push(...copyMessages(messages));
  }

  private ensure(botId: string): BotSession {
    let session = this.sessions.get(botId);
    if (!session) {
      session = { botId, messages: [], inbox: [] };
      this.sessions.set(botId, session);
    }
    return session;
  }

  private copySession(session: BotSession): BotSession {
    return {
      botId: session.botId,
      messages: copyMessages(session.messages),
      inbox: session.inbox.map(copyPacket),
    };
  }
}
