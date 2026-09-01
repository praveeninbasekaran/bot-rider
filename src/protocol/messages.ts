import type { AttachmentKind, BotRecord } from '../domain/bot';
import { inferChangeKind, type ChangeFile, type FileOp, type ProposedFileDto } from '../domain/changeset';
import type { RunStateDto, TurnKind } from '../domain/run-state';

export type CopilotStatus =
  | 'ready'
  | 'missing'
  | 'noPermissions'
  | 'notFound'
  | 'blocked'
  | 'quota'
  | 'hung'
  | 'streamFailed'
  | 'offTopic';

export type ErrorCode =
  | 'unknown-handle'
  | 'multiple-mentions'
  | 'zero-active'
  | 'no-workspace'
  | 'parse-failed'
  | 'validate-failed'
  | 'copilot'
  | 'pack-overflow';

export interface SplitPosition {
  botId: string;
  handle: string;
  text: string;
}

export interface RunBoardDto {
  goal?: string;
  todos: { id: string; text: string; status: 'pending' | 'current' | 'done' }[];
  decisions: string[];
  dissents: { handle: string; text: string }[];
  files: { path: string; inChangeset: boolean }[];
}

export type BotCreateDraft = Omit<BotRecord, 'id' | 'createdAt' | 'updatedAt'>;

export type BotPatch = Partial<
  Pick<BotRecord, 'name' | 'handle' | 'persona' | 'role' | 'instructions' | 'attachments' | 'modelId'>
>;

export type AttachSkipReason = 'unreadable' | 'binary' | 'too-large' | 'outside-workspace';

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: string;
  handle?: string;
}

export type McpSkipReason = 'missing' | 'unauthenticated' | 'mutating-blocked' | 'tool-missing' | 'error';

export interface McpActionDto {
  id: string;
  server: string;
  tool: string;
  argsLine: string;
  botId: string;
  handle: string;
}

export type HostToUi =
  | { type: 'bots/snapshot'; bots: BotRecord[] }
  | { type: 'copilot/status'; status: CopilotStatus; message?: string }
  | { type: 'run/state'; state: RunStateDto }
  | {
      type: 'chat/turn-start';
      botId: string;
      handle: string;
      name: string;
      colorIndex: number;
      turn: TurnKind;
      round: number;
      inactiveNotice?: string;
      solo?: boolean;
    }
  | { type: 'chat/token'; botId: string; delta: string }
  | {
      type: 'chat/turn-end';
      botId: string;
      turn: TurnKind;
      text?: string;
      handle?: string;
      vote?: 'AGREE' | 'DISSENT';
      trailer?: 'NEED_EDIT' | 'NO_EDIT';
    }
  | {
      type: 'chat/split';
      title: string;
      reason: string;
      paused?: boolean;
      positions: SplitPosition[];
    }
  | { type: 'chat/notice'; text: string }
  | { type: 'chat/board'; board: RunBoardDto }
  | { type: 'chat/mcp-read-start'; botId: string; handle: string; server: string; tool: string }
  | { type: 'chat/mcp-read-end'; botId: string; handle: string; server: string; tool: string; preview?: string }
  | {
      type: 'chat/mcp-skip';
      botId: string;
      handle: string;
      server: string;
      tool: string;
      reason: McpSkipReason;
      message: string;
    }
  | { type: 'ui/expanded'; expanded: boolean }
  | { type: 'changeset/preview'; files: ProposedFileDto[] }
  | {
      type: 'changeset/apply-failed';
      leftoverCreates: string[];
      leftoverDeletes: string[];
      message: string;
    }
  | { type: 'changeset/cleared' }
  | { type: 'mcp/actions-preview'; actions: McpActionDto[] }
  | { type: 'mcp/actions-cleared' }
  | { type: 'mcp/actions-failed'; message: string; leftoverIds: string[] }
  | { type: 'bots/attach-added'; slot: AttachmentKind; files: { path: string; name: string }[] }
  | {
      type: 'bots/attach-skipped';
      slot: AttachmentKind;
      name: string;
      reason: AttachSkipReason;
      message: string;
    }
  | { type: 'bots/attach-mapped'; name?: string; handle?: string; persona?: string }
  | {
      type: 'bots/models';
      models: { id: string; label: string }[];
      selectedId: string | null;
      status: 'loading' | 'ready' | 'unavailable';
    }
  | { type: 'error'; code: ErrorCode; message: string };

export type UiToHost =
  | { type: 'bots/create'; draft: BotCreateDraft }
  | {
      type: 'bots/update';
      id: string;
      patch?: BotPatch;
      name?: string;
      handle?: string;
      persona?: string;
      role?: string;
      instructions?: string;
      active?: boolean;
    }
  | { type: 'bots/toggle'; id: string; active: boolean }
  | { type: 'bots/delete'; id: string }
  | { type: 'chat/send'; text: string }
  | { type: 'chat/stop' }
  | { type: 'split/continue' }
  | { type: 'split/pick'; botId: string }
  | { type: 'changeset/approve' }
  | { type: 'changeset/retry' }
  | { type: 'changeset/reject' }
  | { type: 'review/open-diff'; path: string; op?: FileOp }
  | { type: 'copilot/recheck' }
  | { type: 'mcp/actions-approve' }
  | { type: 'mcp/actions-reject' }
  | { type: 'bots/attach-pick'; slot: AttachmentKind }
  | { type: 'bots/attach-remove'; slot: AttachmentKind; path: string };

export interface WorkspaceContext {
  folderFsPath?: string;
  activeEditor?: { path: string; content: string; selection?: string };
  otherTabPaths: string[];
}

export function filesToPreview(files: ChangeFile[]): ProposedFileDto[] {
  return files.map((f) => ({ path: f.path, op: f.op, kind: inferChangeKind(f) }));
}
