import type { StateStore, ApplyEditPort, FileSystemPort, WorkspaceContextPort, CancelToken } from '../src/app/ports';
import type { FileEditOp } from '../src/domain/changeset';
import type { PromptMessage, WorkspaceContext, HostToUi } from '../src/protocol/messages';
import type { ICopilotGateway, CopilotSendOpts } from '../src/app/copilot-gateway';
import type { FormModelsWatch } from '../src/app/bot-models';
import { botsModelsMessage } from '../src/app/bot-models';
import { normalizeModelId } from '../src/domain/bot';
import { HungError } from '../src/app/copilot-gateway';
import type { CopilotStatus } from '../src/protocol/messages';
import type { TurnKind } from '../src/domain/run-state';
import type { McpPort, McpToolInfo } from '../src/app/mcp-gateway';
import { McpGateway } from '../src/app/mcp-gateway';
import type { LanguageModelPort, LmModel, LmSendOptions } from '../src/app/ports';

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
  binaries = new Map<string, Uint8Array>();
  applyResult: boolean | (() => boolean) = true;
  lastOps: FileEditOp[] = [];
  applyCalls = 0;
  readTextCalls: string[] = [];

  async exists(relativePath: string): Promise<boolean> {
    return this.files.has(relativePath) || this.binaries.has(relativePath);
  }

  async readText(relativePath: string): Promise<string | undefined> {
    this.readTextCalls.push(relativePath);
    return this.files.get(relativePath);
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
        if ((this.files.has(op.relativePath) || this.binaries.has(op.relativePath)) && !op.overwrite) {
          return false;
        }
        if (op.binary) {
          this.binaries.set(op.relativePath, new Uint8Array(op.binary));
          this.files.delete(op.relativePath);
        } else {
          this.files.set(op.relativePath, op.content);
          this.binaries.delete(op.relativePath);
        }
      } else if (op.type === 'replace') {
        this.files.set(op.relativePath, op.content);
        this.binaries.delete(op.relativePath);
      } else if (op.type === 'delete') {
        if (!this.files.has(op.relativePath) && !this.binaries.has(op.relativePath) && !op.ignoreIfNotExists) {
          return false;
        }
        this.files.delete(op.relativePath);
        this.binaries.delete(op.relativePath);
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
  prepareCalls: Array<string | null | undefined> = [];
  resolvedModelIds: Array<string | null> = [];
  unavailableModelIds = new Set<string>();
  formModels: { id: string; label: string }[] = [];
  maxInputTokens = 16_000;
  status: CopilotStatus | 'settling' = 'ready';
  settled = true;
  hang = false;
  gate: Promise<void> | undefined;
  lastMessages: PromptMessage[][] = [];
  lastSendOpts: CopilotSendOpts[] = [];
  turns: TurnKind[] = [];
  maxInflight = 0;
  private inflight = 0;
  private preparedModelId: string | null = null;
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

  async prepareTurn(modelId?: string | null): Promise<{ usedFallback: boolean }> {
    this.prepareCalls.push(modelId);
    const wanted = normalizeModelId(modelId);
    if (wanted && this.unavailableModelIds.has(wanted)) {
      this.preparedModelId = null;
      this.resolvedModelIds.push(null);
      return { usedFallback: true };
    }
    this.preparedModelId = wanted;
    this.resolvedModelIds.push(wanted);
    return { usedFallback: false };
  }

  watchFormModels(savedModelId: string | null | undefined, emit: (msg: HostToUi) => void): FormModelsWatch {
    const refresh = (): void => {
      emit(botsModelsMessage([], savedModelId, 'loading'));
      const status = this.formModels.length > 0 ? 'ready' : 'unavailable';
      emit(botsModelsMessage(this.formModels, savedModelId, status));
    };
    refresh();
    return { refresh, dispose() {} };
  }

  async send(
    messages: PromptMessage[],
    token: CancelToken,
    onText: (chunk: string) => void,
    opts: CopilotSendOpts = {},
  ): Promise<'ok' | 'cancelled'> {
    this.lastSendOpts.push(opts);
    return this.stream(messages, token, onText);
  }

  async stream(
    messages: PromptMessage[],
    token: CancelToken,
    onText: (chunk: string) => void,
  ): Promise<'ok' | 'cancelled'> {
    this.requestCount += 1;
    this.lastMessages.push(messages);
    this.inflight += 1;
    this.maxInflight = Math.max(this.maxInflight, this.inflight);
    try {
      if (this.gate) {
        await this.gate;
      }
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
    } finally {
      this.inflight -= 1;
    }
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

export class FakeMcpPort implements McpPort {
  tools: McpToolInfo[] = [];
  config = false;
  invokeCalls: { name: string; input: unknown }[] = [];
  startCalls = 0;
  nextResult: unknown = { content: [{ value: '{"items":[{"title":"Alpha"}]}' }] };
  failNames = new Set<string>();
  failError: Error = new Error('MCP invoke failed');

  listTools(): McpToolInfo[] {
    return this.tools;
  }

  hasConfig(): boolean {
    return this.config;
  }

  async startServers(): Promise<void> {
    this.startCalls += 1;
  }

  async invokeTool(name: string, input: unknown, _token: CancelToken): Promise<unknown> {
    this.invokeCalls.push({ name, input });
    if (this.failNames.has(name)) {
      throw this.failError;
    }
    return this.nextResult;
  }
}

export function readOnlyMcpTool(overrides: Partial<McpToolInfo> = {}): McpToolInfo {
  return {
    name: 'list_issues',
    description: 'List issues',
    tags: ['mcp'],
    annotations: { readOnlyHint: true },
    source: { name: 'github' },
    ...overrides,
  };
}

export function stageableMcpTool(overrides: Partial<McpToolInfo> = {}): McpToolInfo {
  return {
    name: 'create_issue',
    description: 'Create an issue',
    tags: ['mcp'],
    annotations: {},
    source: { name: 'github' },
    ...overrides,
  };
}

export class FakeLm implements LanguageModelPort {
  selectCalls = 0;
  models: LmModel[] = [];
  leakOtherVendors = false;
  can: boolean | undefined = true;
  lastOptions: LmSendOptions | undefined;
  lastSelector: { vendor: 'copilot' } | undefined;
  private readonly modelLs = new Set<() => void>();
  private readonly accessLs = new Set<() => void>();

  async selectChatModels(selector: { vendor: 'copilot' }): Promise<LmModel[]> {
    this.selectCalls += 1;
    this.lastSelector = selector;
    if (selector.vendor !== 'copilot') {
      return [];
    }
    if (this.leakOtherVendors) {
      return this.models;
    }
    return this.models.filter((m) => m.vendor === 'copilot');
  }

  canSendRequest(_model: LmModel): boolean | undefined {
    return this.can;
  }

  onDidChangeChatModels(listener: () => void) {
    this.modelLs.add(listener);
    return { dispose: () => this.modelLs.delete(listener) };
  }

  onDidChangeAccess(listener: () => void) {
    this.accessLs.add(listener);
    return { dispose: () => this.accessLs.delete(listener) };
  }

  fireModels(): void {
    for (const listener of this.modelLs) {
      listener();
    }
  }

  fireAccess(): void {
    for (const listener of this.accessLs) {
      listener();
    }
  }
}

export function configuredMcp(emit: (msg: HostToUi) => void, tools?: McpToolInfo[]): { port: FakeMcpPort; mcp: McpGateway } {
  const port = new FakeMcpPort();
  port.config = true;
  port.tools = tools ?? [readOnlyMcpTool()];
  return { port, mcp: new McpGateway(port, emit, { settleMs: 0 }) };
}
