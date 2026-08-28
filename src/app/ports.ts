import type { PromptMessage } from '../protocol/messages';
import type { FileEditOp } from '../domain/changeset';
import type { WorkspaceContext } from '../protocol/messages';

export interface DisposableLike {
  dispose(): void;
}

export interface CancelToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): DisposableLike;
}

export interface StateStore {
  get<T>(key: string): T | undefined;
  update<T>(key: string, value: T): Thenable<void> | Promise<void>;
}

export interface ApplyEditPort {
  applyEdit(ops: FileEditOp[]): Promise<boolean>;
}

export interface FileSystemPort {
  exists(relativePath: string): Promise<boolean>;
  readText(relativePath: string): Promise<string | undefined>;
}

export interface WorkspaceContextPort {
  getContext(): WorkspaceContext | Promise<WorkspaceContext>;
}

export interface LmChatTool {
  name: string;
  description: string;
  inputSchema?: object;
}

export interface LmSendOptions {
  justification: string;
  tools?: LmChatTool[];
}

export type LmStreamPart =
  | { kind: 'text'; value: string }
  | { kind: 'tool-call'; callId: string; name: string; input: object };

export interface LmToolCall {
  callId: string;
  name: string;
  input: object;
}

export type LmChatMessage =
  | PromptMessage
  | { role: 'assistant'; content?: string; toolCalls: LmToolCall[] }
  | { role: 'user'; toolResults: Array<{ callId: string; content: string }> };

export interface LmModel {
  vendor: string;
  maxInputTokens: number;
  countTokens(messages: PromptMessage[]): Promise<number>;
  sendRequest(
    messages: LmChatMessage[],
    options: LmSendOptions,
    token: CancelToken,
  ): Promise<{ text: AsyncIterable<string>; stream?: AsyncIterable<LmStreamPart> }>;
}

export interface LanguageModelPort {
  selectChatModels(selector: { vendor: 'copilot' }): Promise<LmModel[]>;
  canSendRequest(model: LmModel): boolean | undefined;
  onDidChangeChatModels(listener: () => void): DisposableLike;
  onDidChangeAccess(listener: () => void): DisposableLike;
}

export interface DiffCloser {
  closeProposedDiffs(): Promise<void>;
}

export interface ProposedDocHost {
  setProposed(path: string, content: string): void;
  clearProposed(): void;
}
