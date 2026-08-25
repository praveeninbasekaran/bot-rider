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
}

export interface WorkspaceContextPort {
  getContext(): WorkspaceContext | Promise<WorkspaceContext>;
}

export interface LmModel {
  vendor: string;
  maxInputTokens: number;
  countTokens(messages: PromptMessage[]): Promise<number>;
  sendRequest(
    messages: PromptMessage[],
    options: { justification: string },
    token: CancelToken,
  ): Promise<{ text: AsyncIterable<string> }>;
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
