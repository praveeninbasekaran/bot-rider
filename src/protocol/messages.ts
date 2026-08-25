import type { BotDraft, BotRecord } from '../domain/bot';
import type { ChangeFile, FileOp, ProposedFileDto } from '../domain/changeset';
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
  | 'copilot';

export type SplitCause = 'cap' | 'continue' | 'interrupt';

export interface SplitPosition {
  botId: string;
  handle: string;
  text: string;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: string;
  handle?: string;
}

/** Architecture rev 8 §5 Host → UI. Extra keys must not be part of this contract. */
export type HostToUi =
  | { type: 'bots/snapshot'; bots: BotRecord[] }
  | { type: 'copilot/status'; status: CopilotStatus }
  | { type: 'run/state'; state: RunStateDto }
  | { type: 'chat/turn-start'; botId: string; handle: string; turn: TurnKind }
  | { type: 'chat/token'; botId: string; delta: string }
  | { type: 'chat/turn-end'; botId: string; turn: TurnKind }
  | { type: 'chat/split'; cause: SplitCause; positions: SplitPosition[] }
  | { type: 'changeset/preview'; files: ProposedFileDto[] }
  | {
      type: 'changeset/apply-failed';
      message: string;
      leftoverCreates: string[];
      leftoverDeletes: string[];
    }
  | { type: 'changeset/cleared'; reason: 'approve' | 'reject'; fileCount: number }
  | { type: 'error'; code: ErrorCode; message: string };

/** Architecture rev 8 §5 UI → host. Host may accept flattened bots/create as a runtime shim. */
export type UiToHost =
  | { type: 'bots/create'; draft: BotDraft }
  | {
      type: 'bots/update';
      id: string;
      name: string;
      handle: string;
      persona: string;
      role: string;
      instructions: string;
      active: boolean;
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
  | { type: 'copilot/recheck' };

export interface WorkspaceContext {
  folderFsPath?: string;
  activeEditor?: { path: string; content: string; selection?: string };
  otherTabPaths: string[];
}

export function filesToPreview(files: ChangeFile[]): ProposedFileDto[] {
  return files.map((f) => ({ path: f.path, op: f.op }));
}
