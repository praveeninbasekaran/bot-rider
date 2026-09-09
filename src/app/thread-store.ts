import type { ProposedFileDto } from '../domain/changeset';
import type { RunStateDto, TurnKind } from '../domain/run-state';
import type {
  DebateDecisionDto,
  DebateSynthesisDto,
  ErrorCode,
  HostToUi,
  McpActionDto,
  RunBoardDto,
  SplitPosition,
} from '../protocol/messages';

export interface ThreadTurn {
  id: string;
  role: 'user' | 'assistant' | 'notice';
  text: string;
  handle?: string;
  botId?: string;
  createdAt: string;
}

interface TranscriptBase {
  id: string;
  sequence: number;
  createdAt: string;
}

export type TranscriptEntry =
  | (TranscriptBase & { kind: 'user'; text: string })
  | (TranscriptBase & {
      kind: 'bot';
      botId: string;
      handle: string;
      name: string;
      colorIndex: number;
      turn: TurnKind;
      round: number;
      text: string;
      complete: boolean;
      interrupted?: boolean;
      inactiveNotice?: string;
      solo?: boolean;
      vote?: 'AGREE' | 'DISSENT';
      trailer?: 'NEED_EDIT' | 'NO_EDIT';
    })
  | (TranscriptBase & { kind: 'notice'; text: string })
  | (TranscriptBase & { kind: 'error'; code: ErrorCode | 'changeset' | 'mcp'; text: string });

export interface TranscriptSplit {
  title: string;
  reason: string;
  paused?: boolean;
  positions: SplitPosition[];
}

export interface ThreadSnapshot {
  version: 1;
  entries: TranscriptEntry[];
  run?: RunStateDto;
  board?: RunBoardDto;
  split?: TranscriptSplit;
  pendingFiles: ProposedFileDto[];
  pendingMcpActions: McpActionDto[];
  synthesis?: DebateSynthesisDto;
  decision?: DebateDecisionDto;
}

function copyEntry(entry: TranscriptEntry): TranscriptEntry {
  return { ...entry };
}

export class ThreadStore {
  private entries: TranscriptEntry[] = [];
  private sequence = 0;
  private readonly activeBotEntries = new Map<string, string>();
  private run: RunStateDto | undefined;
  private board: RunBoardDto | undefined;
  private split: TranscriptSplit | undefined;
  private pendingFiles: ProposedFileDto[] = [];
  private pendingMcpActions: McpActionDto[] = [];
  private synthesis: DebateSynthesisDto | undefined;
  private decision: DebateDecisionDto | undefined;

  list(): ThreadTurn[] {
    return this.entries.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      role: entry.kind === 'bot' ? 'assistant' : entry.kind === 'user' ? 'user' : 'notice',
      text: entry.text,
      handle: entry.kind === 'bot' ? entry.handle : undefined,
      botId: entry.kind === 'bot' ? entry.botId : undefined,
    }));
  }

  snapshot(): ThreadSnapshot {
    return {
      version: 1,
      entries: this.entries.slice().sort((a, b) => a.sequence - b.sequence).map(copyEntry),
      run: this.run ? { ...this.run, frozenBotIds: this.run.frozenBotIds.slice() } : undefined,
      board: this.board
        ? {
            ...this.board,
            todos: this.board.todos.map((todo) => ({ ...todo })),
            decisions: this.board.decisions.slice(),
            dissents: this.board.dissents.map((dissent) => ({ ...dissent })),
            files: this.board.files.map((file) => ({ ...file })),
          }
        : undefined,
      split: this.split
        ? { ...this.split, positions: this.split.positions.map((position) => ({ ...position })) }
        : undefined,
      pendingFiles: this.pendingFiles.map((file) => ({ ...file, specIds: file.specIds?.slice() })),
      pendingMcpActions: this.pendingMcpActions.map((action) => ({ ...action })),
      synthesis: this.synthesis ? { ...this.synthesis } : undefined,
      decision: this.decision ? { ...this.decision } : undefined,
    };
  }

  restore(snapshot: ThreadSnapshot): void {
    this.entries = snapshot.entries.map((entry) => {
      const copy = copyEntry(entry);
      return copy.kind === 'bot' && !copy.complete
        ? { ...copy, complete: true, interrupted: true }
        : copy;
    });
    this.sequence = this.entries.reduce((max, entry) => Math.max(max, entry.sequence), 0);
    this.activeBotEntries.clear();
    this.run = snapshot.run
      ? { ...snapshot.run, debateRunning: false, frozenBotIds: snapshot.run.frozenBotIds.slice() }
      : undefined;
    this.board = snapshot.board ? structuredClone(snapshot.board) : undefined;
    this.split = snapshot.split ? structuredClone(snapshot.split) : undefined;
    this.pendingFiles = snapshot.pendingFiles.map((file) => ({ ...file, specIds: file.specIds?.slice() }));
    this.pendingMcpActions = snapshot.pendingMcpActions.map((action) => ({ ...action }));
    this.synthesis = snapshot.synthesis ? { ...snapshot.synthesis } : undefined;
    this.decision = snapshot.decision ? { ...snapshot.decision } : undefined;
  }

  append(turn: Omit<ThreadTurn, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): ThreadTurn {
    const id = turn.id ?? crypto.randomUUID();
    const createdAt = turn.createdAt ?? new Date().toISOString();
    const sequence = this.nextSequence();
    if (turn.role === 'user') {
      this.entries.push({ id, createdAt, sequence, kind: 'user', text: turn.text });
    } else if (turn.role === 'assistant') {
      this.entries.push({
        id,
        createdAt,
        sequence,
        kind: 'bot',
        text: turn.text,
        botId: turn.botId ?? '',
        handle: turn.handle ?? '',
        name: turn.handle ?? 'Bot',
        colorIndex: 0,
        turn: 'direct',
        round: 1,
        complete: true,
      });
    } else {
      this.entries.push({ id, createdAt, sequence, kind: 'notice', text: turn.text });
    }
    return { id, createdAt, role: turn.role, text: turn.text, handle: turn.handle, botId: turn.botId };
  }

  appendUser(text: string): ThreadTurn {
    return this.append({ role: 'user', text });
  }

  recordHostMessage(message: HostToUi): void {
    switch (message.type) {
      case 'chat/turn-start':
        this.startBot(message);
        break;
      case 'chat/token':
        this.appendBotToken(message.botId, message.delta);
        break;
      case 'chat/turn-end':
        this.finishBot(message);
        break;
      case 'chat/synthesis':
        this.synthesis = { ...message.synthesis };
        break;
      case 'chat/decision':
        this.decision = { ...message.decision };
        break;
      case 'chat/notice':
        if (message.text === 'Interrupted') {
          this.interruptActiveBots();
        } else {
          this.append({ role: 'notice', text: message.text });
        }
        break;
      case 'error':
        this.appendError(message.code, message.message);
        break;
      case 'changeset/apply-failed':
        this.appendError('changeset', message.message);
        break;
      case 'changeset/stale':
        this.appendError('changeset', message.message);
        break;
      case 'mcp/actions-failed':
        this.appendError('mcp', message.message);
        break;
      case 'run/state':
        this.run = { ...message.state, frozenBotIds: message.state.frozenBotIds.slice() };
        if (!message.state.splitOpen) {
          this.split = undefined;
        }
        if (!message.state.debateRunning) {
          this.interruptActiveBots();
        }
        break;
      case 'chat/board':
        this.board = message.board;
        break;
      case 'chat/split':
        this.split = {
          title: message.title,
          reason: message.reason,
          paused: message.paused,
          positions: message.positions.map((position) => ({ ...position })),
        };
        if (message.paused) {
          this.interruptActiveBots();
        }
        break;
      case 'changeset/preview':
        this.pendingFiles = message.files.map((file) => ({ ...file, specIds: file.specIds?.slice() }));
        break;
      case 'changeset/cleared':
        this.pendingFiles = [];
        break;
      case 'mcp/actions-preview':
        this.pendingMcpActions = message.actions.map((action) => ({ ...action }));
        break;
      case 'mcp/actions-cleared':
        this.pendingMcpActions = [];
        break;
      default:
        break;
    }
  }

  clear(): void {
    this.entries = [];
    this.sequence = 0;
    this.activeBotEntries.clear();
    this.run = undefined;
    this.board = undefined;
    this.split = undefined;
    this.pendingFiles = [];
    this.pendingMcpActions = [];
    this.synthesis = undefined;
    this.decision = undefined;
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private startBot(message: Extract<HostToUi, { type: 'chat/turn-start' }>): void {
    if (message.turn === 'implement' || message.turn === 'consensus') {
      return;
    }
    const id = crypto.randomUUID();
    this.entries.push({
      id,
      sequence: this.nextSequence(),
      createdAt: new Date().toISOString(),
      kind: 'bot',
      botId: message.botId,
      handle: message.handle,
      name: message.name,
      colorIndex: message.colorIndex,
      turn: message.turn,
      round: message.round,
      text: '',
      complete: false,
      inactiveNotice: message.inactiveNotice,
      solo: message.solo,
    });
    this.activeBotEntries.set(message.botId, id);
  }

  private appendBotToken(botId: string, delta: string): void {
    const entry = this.activeBotEntry(botId);
    if (entry) {
      entry.text += delta;
    }
  }

  private finishBot(message: Extract<HostToUi, { type: 'chat/turn-end' }>): void {
    if (message.turn === 'implement' || message.turn === 'consensus') {
      this.activeBotEntries.delete(message.botId);
      return;
    }
    const entry = this.activeBotEntry(message.botId);
    if (entry) {
      entry.text = message.text ?? entry.text;
      entry.complete = true;
      entry.vote = message.vote;
      entry.trailer = message.trailer;
      if (message.handle) {
        entry.handle = message.handle;
      }
      this.activeBotEntries.delete(message.botId);
      return;
    }
    this.entries.push({
      id: crypto.randomUUID(),
      sequence: this.nextSequence(),
      createdAt: new Date().toISOString(),
      kind: 'bot',
      botId: message.botId,
      handle: message.handle ?? '',
      name: message.handle ?? 'Bot',
      colorIndex: 0,
      turn: message.turn,
      round: this.run?.round ?? 1,
      text: message.text ?? '',
      complete: true,
      vote: message.vote,
      trailer: message.trailer,
    });
  }

  private activeBotEntry(botId: string): Extract<TranscriptEntry, { kind: 'bot' }> | undefined {
    const id = this.activeBotEntries.get(botId);
    const entry = id ? this.entries.find((candidate) => candidate.id === id) : undefined;
    return entry?.kind === 'bot' ? entry : undefined;
  }

  private appendError(code: ErrorCode | 'changeset' | 'mcp', text: string): void {
    this.entries.push({
      id: crypto.randomUUID(),
      sequence: this.nextSequence(),
      createdAt: new Date().toISOString(),
      kind: 'error',
      code,
      text,
    });
  }

  private interruptActiveBots(): void {
    for (const id of this.activeBotEntries.values()) {
      const entry = this.entries.find((candidate) => candidate.id === id);
      if (entry?.kind === 'bot') {
        entry.complete = true;
        entry.interrupted = true;
      }
    }
    this.activeBotEntries.clear();
  }
}
