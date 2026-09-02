import { attachmentsOf, type BotAttachment, type BotRecord } from '../domain/bot';
import type { TurnKind } from '../domain/run-state';
import type { PromptMessage, RunBoardDto, WorkspaceContext } from '../protocol/messages';
import { packetToMessage, type IsolationPacket } from './bot-session-store';
import { formatLspSlice, withSelectionFallback, type LspSliceSnapshot } from './lsp-slice';
import { boardPackText } from './run-board';

export function personaBlock(bot: BotRecord): string {
  return [
    `You are ${bot.name} (@${bot.handle}).`,
    `Role: ${bot.role}`,
    `Persona: ${bot.persona}`,
    `Instructions: ${bot.instructions}`,
  ].join('\n');
}

export interface TokenCounter {
  countTokens(messages: PromptMessage[]): Promise<number>;
  readonly maxInputTokens: number;
}

export type PackKind = 'debate' | 'vote' | 'implement';

export type PackResult =
  | { ok: true; messages: PromptMessage[]; tokens: number }
  | { ok: false; overflow: true };

export interface PackRequest {
  bot: BotRecord;
  kind: PackKind;
  instruction: string;
  board: RunBoardDto;
  workspace: WorkspaceContext;
  counter: TokenCounter;
  lspSlice?: LspSliceSnapshot;
  implementerFiles?: { path: string; content: string }[];
  mcpContext?: string[];
  /** This bot's prior session messages only. Not the global Swarm transcript. */
  sessionMessages?: PromptMessage[];
  /** Required published packets for this turn. Not silent-trim extras. */
  isolationPackets?: IsolationPacket[];
}

export function packKindFor(turn: TurnKind): PackKind {
  if (turn === 'consensus') {
    return 'vote';
  }
  if (turn === 'implement') {
    return 'implement';
  }
  return 'debate';
}

export function tabPathsBlock(workspace: WorkspaceContext): string {
  const lines: string[] = [];
  lines.push(`Workspace folder: ${workspace.folderFsPath ?? '(none)'}`);
  const paths: string[] = [];
  if (workspace.activeEditor?.path) {
    paths.push(workspace.activeEditor.path);
  }
  for (const p of workspace.otherTabPaths) {
    if (p && !paths.includes(p)) {
      paths.push(p);
    }
  }
  if (paths.length > 0) {
    lines.push('Open tabs (paths only):');
    for (const p of paths) {
      lines.push(`- ${p}`);
    }
  } else {
    lines.push('Open tabs (paths only): (none)');
  }
  return lines.join('\n');
}

export function implementerFilesBlock(files: { path: string; content: string }[]): string {
  if (files.length === 0) {
    return 'Files in play (full contents): (none)';
  }
  const parts = ['Files in play (full contents):'];
  for (const file of files) {
    parts.push(`--- ${file.path} ---`);
    parts.push(file.content);
  }
  return parts.join('\n');
}

function mcpMessage(notes: string[]): PromptMessage | undefined {
  if (notes.length === 0) {
    return undefined;
  }
  return {
    role: 'user',
    content: `Read-only workspace MCP notes:\n${notes.map((note) => `- ${note}`).join('\n')}`,
  };
}

export function attachmentPackLabel(file: BotAttachment): string {
  const base = `${file.name} (${file.path})`;
  return file.kind ? `${base} · ${file.kind}` : base;
}

export function attachmentsBlock(attachments: BotAttachment[]): string | undefined {
  if (attachments.length === 0) {
    return undefined;
  }
  const parts = ['Attached files'];
  for (const file of attachments) {
    parts.push(attachmentPackLabel(file));
    parts.push(file.snapshot);
  }
  return parts.join('\n');
}

function extrasMessage(attachments: BotAttachment[]): PromptMessage | undefined {
  const content = attachmentsBlock(attachments);
  if (!content) {
    return undefined;
  }
  return { role: 'user', content };
}

function assemble(parts: Array<PromptMessage | undefined>): PromptMessage[] {
  return parts.filter((p): p is PromptMessage => !!p);
}

/**
 * Deterministic pack/trim. Never sendRequest. Never estimates via Copilot.
 * Call-budget is an internal meter (sendRequest count × packed size).
 */
export class TokenGovernor {
  private calls = 0;
  private packedTokens = 0;

  get callBudget(): { calls: number; packedTokens: number } {
    return { calls: this.calls, packedTokens: this.packedTokens };
  }

  recordSent(tokens: number): void {
    this.calls += 1;
    this.packedTokens += tokens;
  }

  async pack(args: PackRequest): Promise<PackResult> {
    const persona: PromptMessage = { role: 'user', content: personaBlock(args.bot) };
    const session = [...(args.sessionMessages ?? [])];
    // Required published packets include OS-4 spec bodies (not silent extras). Never drop them.
    const packets = (args.isolationPackets ?? []).map(packetToMessage);
    const board: PromptMessage = { role: 'user', content: boardPackText(args.board) };
    const tabs: PromptMessage = { role: 'user', content: tabPathsBlock(args.workspace) };
    const instruction: PromptMessage = { role: 'user', content: args.instruction };

    let fileMsg: PromptMessage | undefined;
    if (args.kind === 'debate') {
      const slice = withSelectionFallback(args.lspSlice ?? { diagnostics: [], symbols: [] }, args.workspace);
      fileMsg = { role: 'user', content: formatLspSlice(slice) };
    } else if (args.kind === 'implement') {
      fileMsg = { role: 'user', content: implementerFilesBlock(args.implementerFiles ?? []) };
    }

    const allowMcp = args.kind === 'debate';
    let mcpNotes = allowMcp ? [...(args.mcpContext ?? [])] : [];
    const allowAttach = args.kind === 'debate' || args.kind === 'implement';
    let extras = allowAttach ? attachmentsOf(args.bot) : [];

    const build = (): PromptMessage[] =>
      assemble([
        persona,
        ...session,
        ...packets,
        board,
        fileMsg,
        tabs,
        mcpMessage(mcpNotes),
        extrasMessage(extras),
        instruction,
      ]);

    let messages = build();
    while ((await args.counter.countTokens(messages)) > args.counter.maxInputTokens) {
      if (mcpNotes.length > 0) {
        mcpNotes = [];
        messages = build();
        continue;
      }
      if (extras.length > 0) {
        extras = extras.slice(0, -1);
        messages = build();
        continue;
      }
      return { ok: false, overflow: true };
    }
    const tokens = await args.counter.countTokens(messages);
    return { ok: true, messages, tokens };
  }
}
