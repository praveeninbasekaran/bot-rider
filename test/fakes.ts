import type { StateStore, ApplyEditPort, FileSystemPort, WorkspaceContextPort, CancelToken } from '../src/app/ports';
import type { FileEditOp } from '../src/domain/changeset';
import type { PromptMessage, WorkspaceContext } from '../src/protocol/messages';
import type { ICopilotGateway } from '../src/app/copilot-gateway';
import { HungError } from '../src/app/copilot-gateway';
import type { CopilotStatus } from '../src/protocol/messages';
import type { TurnKind } from '../src/domain/run-state';

export class MemoryStore implements StateStore {
  private readonly data = new Map<string, unknown>();
  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }
  async update<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }
}

export class MemoryFs implements ApplyEditPort, FileSystemPort {
  files = new Map<string, string>();
  applyResult: boolean | (() => boolean) = true;
  lastOps: FileEditOp[] = [];
  applyCalls = 0;

  async exists(relativePath: string): Promise<boolean> {
    return this.files.has(relativePath);
  }

  async applyEdit(ops: FileEditOp[]): Promise<boolean> {
    this.applyCalls += 1;
    this.lastOps = ops;
    const ok = typeof this.applyResult === 'function' ? this.applyResult() : this.applyResult;
    if (!ok) {
      return false;
    }
    for (const op of ops) {
      if (op.type === 'create') {
        if (this.files.has(op.relativePath) && !op.overwrite) {
          return false;
        }
        this.files.set(op.relativePath, op.content);
      } else if (op.type === 'replace') {
        this.files.set(op.relativePath, op.content);
      } else if (op.type === 'delete') {
        if (!this.files.has(op.relativePath) && !op.ignoreIfNotExists) {
          return false;
        }
        this.files.delete(op.relativePath);
      }
    }
    return true;
  }
}

export class FixedWorkspace implements WorkspaceContextPort {
  constructor(public ctx: WorkspaceContext) {}
  getContext(): WorkspaceContext {
    return this.ctx;
  }
}

export function changesetFence(files: unknown): string {
  return '```json\n' + JSON.stringify({ files }) + '\n```';
}

export class FakeGateway implements ICopilotGateway {
  requestCount = 0;
  ensureCalls = 0;
  maxInputTokens = 16_000;
  status: CopilotStatus | 'settling' = 'ready';
  settled = true;
  hang = false;
  lastMessages: PromptMessage[][] = [];
  turns: TurnKind[] = [];
  script: (info: { turn: TurnKind; instruction: string; messages: PromptMessage[] }) => string = () =>
    'AGREE looks good';

  async countTokens(messages: PromptMessage[]): Promise<number> {
    return messages.reduce((n, m) => n + m.content.length, 0);
  }

  async ensureAvailable(): Promise<CopilotStatus> {
    this.ensureCalls += 1;
    if (this.status === 'settling') {
      return 'ready';
    }
    return this.status;
  }

  async stream(
    messages: PromptMessage[],
    token: CancelToken,
    onText: (chunk: string) => void,
  ): Promise<'ok' | 'cancelled'> {
    this.requestCount += 1;
    this.lastMessages.push(messages);
    if (this.hang) {
      return await new Promise<'ok' | 'cancelled'>((resolve, reject) => {
        const timer = setTimeout(() => reject(new HungError()), 60_000);
        token.onCancellationRequested(() => {
          clearTimeout(timer);
          resolve('cancelled');
        });
      });
    }
    const instruction = messages[messages.length - 1]?.content ?? '';
    const turn = detectTurn(instruction);
    this.turns.push(turn);
    const text = this.script({ turn, instruction, messages });
    onText(text);
    if (token.isCancellationRequested) {
      return 'cancelled';
    }
    return 'ok';
  }
}

export function detectTurn(instruction: string): TurnKind {
  if (instruction.includes('Emit a JSON changeset')) {
    return 'implement';
  }
  if (instruction.includes('NEED_EDIT')) {
    return 'direct';
  }
  if (instruction.includes('Role: vote')) {
    return 'consensus';
  }
  if (instruction.includes('Role: critique')) {
    return 'critique';
  }
  return 'propose';
}

export const defaultWorkspace: WorkspaceContext = {
  folderFsPath: '/tmp/bot-rider-ws',
  activeEditor: { path: 'src/app.ts', content: 'export const n = 1;\n', selection: 'n = 1' },
  otherTabPaths: ['src/other.ts', 'README.md'],
};
