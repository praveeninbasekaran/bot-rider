import type { CopilotStatus, HostToUi, PromptMessage } from '../protocol/messages';
import type {
  CancelToken,
  LanguageModelPort,
  LmChatMessage,
  LmChatTool,
  LmModel,
  LmSendOptions,
  LmStreamPart,
  LmToolCall,
} from './ports';
import { discoverCopilotModels, watchFormCopilotModels, type FormModelsWatch } from './bot-models';
import { COPILOT_JUSTIFICATION } from './copy';
import { waitForCancel } from './cancel';
import type { McpGateway } from './mcp-gateway';
import { normalizeModelId } from '../domain/bot';

export const MAX_MCP_TOOL_ROUNDS = 8;

export interface CopilotSendOpts {
  tools?: 'mcp-debate' | 'none';
  botId?: string;
  handle?: string;
  /** LanguageModelChat.id for this bot turn. Empty / omit = host default. Vote does not pass this. */
  modelId?: string | null;
}

export interface ICopilotGateway {
  requestCount: number;
  maxInputTokens: number;
  status: CopilotStatus | 'settling';
  readonly settled: boolean;
  /** Last Copilot discovery ids already on the host. Import reads this; never discovers. */
  readonly cachedCopilotModelIds: readonly string[];
  countTokens(messages: PromptMessage[]): Promise<number>;
  ensureAvailable(): Promise<CopilotStatus>;
  prepareTurn(modelId?: string | null): Promise<{ usedFallback: boolean }>;
  watchFormModels(savedModelId: string | null | undefined, emit: (msg: HostToUi) => void): FormModelsWatch;
  stream(
    messages: PromptMessage[],
    token: CancelToken,
    onText: (chunk: string) => void,
  ): Promise<'ok' | 'cancelled'>;
  send(
    messages: PromptMessage[],
    token: CancelToken,
    onText: (chunk: string) => void,
    opts?: CopilotSendOpts,
  ): Promise<'ok' | 'cancelled'>;
}

export class HungError extends Error {
  readonly status: CopilotStatus = 'hung';
  constructor(message = 'GitHub Copilot did not respond within 60 seconds.') {
    super(message);
    this.name = 'HungError';
  }
}

export class OverlapError extends Error {
  constructor() {
    super('Overlapping language-model request');
    this.name = 'OverlapError';
  }
}

export function mapCopilotError(err: unknown): CopilotStatus {
  if (err instanceof HungError) {
    return 'hung';
  }
  const e = err as { code?: string; message?: string; cause?: unknown; name?: string };
  const code = String(e.code ?? '').toLowerCase();
  const message = `${e.message ?? ''} ${stringifyCause(e.cause)}`.toLowerCase();
  if (code === 'nopermissions' || message.includes('no permission') || message.includes('not been granted')) {
    return 'noPermissions';
  }
  if (code === 'notfound' || message.includes('not found')) {
    return 'notFound';
  }
  if (code === 'blocked' || message.includes('blocked')) {
    return 'blocked';
  }
  if (code === 'offtopic' || message.includes('off_topic') || message.includes('off topic') || message.includes('offtopic')) {
    return 'offTopic';
  }
  if (
    code === 'quota' ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('too many requests')
  ) {
    return 'quota';
  }
  return 'streamFailed';
}

function stringifyCause(cause: unknown): string {
  if (!cause) {
    return '';
  }
  if (typeof cause === 'string') {
    return cause;
  }
  if (cause instanceof Error) {
    return `${cause.message} ${cause.name}`;
  }
  if (typeof cause === 'object' && cause && 'message' in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}

export class CopilotGateway implements ICopilotGateway {
  requestCount = 0;
  status: CopilotStatus | 'settling' = 'settling';
  private model: LmModel | undefined;
  /** Resolved for the current pack+send. Captured locally at send start; not swapped mid-stream. */
  private turnModel: LmModel | undefined;
  private inflight = 0;
  private modelsSettled = false;
  private accessSettled = false;
  private knownModelIds: string[] = [];
  private readonly hangMs: number;

  get cachedCopilotModelIds(): readonly string[] {
    return this.knownModelIds;
  }

  constructor(
    private readonly lm: LanguageModelPort,
    private readonly onStatus: (status: CopilotStatus) => void = () => undefined,
    hangMs = 60_000,
    private readonly mcp?: McpGateway,
  ) {
    this.hangMs = hangMs;
    this.lm.onDidChangeChatModels(() => {
      this.modelsSettled = true;
      void this.refreshAfterSettle();
    });
    this.lm.onDidChangeAccess(() => {
      this.accessSettled = true;
      void this.refreshAfterSettle();
    });
  }

  get settled(): boolean {
    return this.modelsSettled && this.accessSettled;
  }

  get maxInputTokens(): number {
    return (this.turnModel ?? this.model)?.maxInputTokens ?? 64_000;
  }

  async countTokens(messages: PromptMessage[]): Promise<number> {
    const model = this.turnModel ?? this.model;
    if (!model) {
      return messages.reduce((n, m) => n + m.content.length, 0);
    }
    return model.countTokens(messages);
  }

  watchFormModels(savedModelId: string | null | undefined, emit: (msg: HostToUi) => void): FormModelsWatch {
    return watchFormCopilotModels({
      lm: this.lm,
      savedModelId,
      emit: (msg) => {
        if (msg.type === 'bots/models' && msg.status === 'ready') {
          this.knownModelIds = msg.models.map((model) => model.id);
        }
        emit(msg);
      },
    });
  }

  async prepareTurn(modelId?: string | null): Promise<{ usedFallback: boolean }> {
    const copilot = await discoverCopilotModels(this.lm);
    this.knownModelIds = copilot.map((model) => model.id);
    const hostDefault = copilot[0];
    const wanted = normalizeModelId(modelId);
    if (!wanted) {
      this.turnModel = hostDefault;
      return { usedFallback: false };
    }
    const found = copilot.find((model) => model.id === wanted);
    if (found) {
      this.turnModel = found;
      return { usedFallback: false };
    }
    this.turnModel = hostDefault;
    return { usedFallback: !!hostDefault };
  }

  async ensureAvailable(): Promise<CopilotStatus> {
    const copilot = await discoverCopilotModels(this.lm);
    this.knownModelIds = copilot.map((model) => model.id);
    const model = copilot[0];
    if (!model) {
      this.model = undefined;
      this.setStatus('missing');
      return 'missing';
    }
    const can = this.lm.canSendRequest(model);
    if (can === false) {
      this.model = model;
      this.setStatus('noPermissions');
      return 'noPermissions';
    }
    this.model = model;
    this.setStatus('ready');
    return 'ready';
  }

  async stream(
    messages: PromptMessage[],
    token: CancelToken,
    onText: (chunk: string) => void,
  ): Promise<'ok' | 'cancelled'> {
    return this.send(messages, token, onText, { tools: 'none' });
  }

  async send(
    messages: PromptMessage[],
    token: CancelToken,
    onText: (chunk: string) => void,
    opts: CopilotSendOpts = {},
  ): Promise<'ok' | 'cancelled'> {
    this.inflight += 1;
    this.requestCount += 1;
    try {
      const model = await this.resolveSendModel(opts.modelId);
      const can = this.lm.canSendRequest(model);
      if (can === false) {
        this.setStatus('noPermissions');
        throw Object.assign(new Error('noPermissions'), { code: 'NoPermissions' });
      }
      const chatTools = this.toolsFor(opts.tools);
      const requestOptions: LmSendOptions = chatTools
        ? { justification: COPILOT_JUSTIFICATION, tools: chatTools }
        : { justification: COPILOT_JUSTIFICATION };
      const allowTools = !!chatTools?.length;
      let convo: LmChatMessage[] = [...messages];
      for (let round = 0; round < MAX_MCP_TOOL_ROUNDS; round++) {
        const response = await model.sendRequest(convo, requestOptions, token);
        const consumed = await consumeResponse(response, onText, token, this.hangMs, allowTools);
        if (consumed.outcome === 'hung') {
          this.setStatus('hung');
          throw new HungError();
        }
        if (consumed.outcome === 'cancelled' || token.isCancellationRequested) {
          return 'cancelled';
        }
        if (!allowTools || !this.mcp || consumed.toolCalls.length === 0) {
          return 'ok';
        }
        const results: Array<{ callId: string; content: string }> = [];
        const botId = opts.botId ?? '';
        const handle = opts.handle ?? '';
        for (const call of consumed.toolCalls) {
          if (token.isCancellationRequested) {
            return 'cancelled';
          }
          const decision = this.mcp.decide(call);
          if (decision.action === 'stage') {
            const staged = this.mcp.stage(call, botId, handle, decision);
            results.push({ callId: call.callId, content: staged.text });
            continue;
          }
          if (decision.action === 'skip') {
            this.mcp.announceSkip(botId, handle, decision);
            results.push({ callId: call.callId, content: decision.message || 'Skipped.' });
            continue;
          }
          const invoked = await this.mcp.invoke(call, token, botId, handle);
          if (invoked.cancelled || token.isCancellationRequested) {
            return 'cancelled';
          }
          results.push({ callId: call.callId, content: invoked.text || 'Skipped.' });
        }
        convo = [
          ...convo,
          { role: 'assistant', toolCalls: consumed.toolCalls },
          { role: 'user', toolResults: results },
        ];
        await this.dropMcpExcerptsIfOver(convo);
      }
      return 'ok';
    } catch (err) {
      if (err instanceof HungError || err instanceof OverlapError) {
        throw err;
      }
      if (token.isCancellationRequested) {
        return 'cancelled';
      }
      const status = mapCopilotError(err);
      this.setStatus(status);
      throw err;
    } finally {
      this.inflight -= 1;
      if (this.inflight === 0) {
        this.turnModel = undefined;
      }
    }
  }

  private async resolveSendModel(modelId?: string | null): Promise<LmModel> {
    const wanted = normalizeModelId(modelId);
    if (wanted) {
      const copilot = await discoverCopilotModels(this.lm);
      this.knownModelIds = copilot.map((item) => item.id);
      const found = copilot.find((item) => item.id === wanted);
      if (found) {
        return found;
      }
      if (copilot[0]) {
        return copilot[0];
      }
    }
    const existing = this.turnModel ?? this.model;
    if (existing) {
      return existing;
    }
    const status = await this.ensureAvailable();
    if (status !== 'ready' || !this.model) {
      throw Object.assign(new Error(status), { code: status });
    }
    return this.turnModel ?? this.model;
  }

  private toolsFor(mode: CopilotSendOpts['tools']): LmChatTool[] | undefined {
    if (mode !== 'mcp-debate' || !this.mcp || this.mcp.noneConfigured()) {
      return undefined;
    }
    const seen = new Set<string>();
    const tools: LmChatTool[] = [];
    for (const tool of [...this.mcp.listReadOnly(), ...this.mcp.listStageable()]) {
      if (seen.has(tool.name)) {
        continue;
      }
      seen.add(tool.name);
      tools.push(tool);
    }
    return tools.length ? tools : undefined;
  }

  private async dropMcpExcerptsIfOver(convo: LmChatMessage[]): Promise<void> {
    while ((await this.countTokens(convoToPrompt(convo))) > this.maxInputTokens) {
      let dropped = false;
      for (let i = convo.length - 1; i >= 0; i--) {
        const msg = convo[i]!;
        if ('toolResults' in msg && msg.toolResults.some((part) => part.content.length > 0 && part.content !== 'Dropped to fit token budget.')) {
          for (const part of msg.toolResults) {
            part.content = 'Dropped to fit token budget.';
          }
          dropped = true;
          break;
        }
        if (!('toolResults' in msg) && !('toolCalls' in msg) && msg.content.startsWith('Read-only workspace MCP notes:')) {
          convo.splice(i, 1);
          dropped = true;
          break;
        }
      }
      if (!dropped) {
        return;
      }
    }
  }

  private setStatus(status: CopilotStatus): void {
    this.status = status;
    this.onStatus(status);
  }

  private async refreshAfterSettle(): Promise<void> {
    if (!this.settled) {
      return;
    }
    if (this.status === 'settling') {
      if (this.model) {
        const can = this.lm.canSendRequest(this.model);
        this.setStatus(can === false ? 'noPermissions' : 'ready');
      } else {
        this.setStatus('missing');
      }
    }
  }
}

export async function readTextStream(
  text: AsyncIterable<string>,
  onText: (chunk: string) => void,
  token: CancelToken,
  hangMs: number,
): Promise<'ok' | 'hung' | 'cancelled'> {
  const iterator = text[Symbol.asyncIterator]();
  while (!token.isCancellationRequested) {
    const nextP = iterator.next();
    const raced = await raceHang(nextP, hangMs, token);
    if (raced === 'hung') {
      return 'hung';
    }
    if (raced === 'cancelled') {
      return 'cancelled';
    }
    if (raced.done) {
      return 'ok';
    }
    onText(String(raced.value ?? ''));
  }
  return 'cancelled';
}

async function consumeResponse(
  response: { text: AsyncIterable<string>; stream?: AsyncIterable<LmStreamPart> },
  onText: (chunk: string) => void,
  token: CancelToken,
  hangMs: number,
  allowTools: boolean,
): Promise<{ outcome: 'ok' | 'hung' | 'cancelled'; toolCalls: LmToolCall[] }> {
  if (!response.stream) {
    const outcome = await readTextStream(response.text, onText, token, hangMs);
    return { outcome, toolCalls: [] };
  }
  const iterator = response.stream[Symbol.asyncIterator]();
  const toolCalls: LmToolCall[] = [];
  while (!token.isCancellationRequested) {
    const raced = await raceHang(iterator.next(), hangMs, token);
    if (raced === 'hung') {
      return { outcome: 'hung', toolCalls };
    }
    if (raced === 'cancelled') {
      return { outcome: 'cancelled', toolCalls };
    }
    if (raced.done) {
      return { outcome: 'ok', toolCalls };
    }
    const part = raced.value;
    if (part.kind === 'text') {
      onText(part.value);
    } else if (part.kind === 'tool-call' && allowTools) {
      toolCalls.push({ callId: part.callId, name: part.name, input: part.input });
    }
  }
  return { outcome: 'cancelled', toolCalls };
}

function convoToPrompt(convo: LmChatMessage[]): PromptMessage[] {
  return convo.map((msg) => {
    if ('toolResults' in msg) {
      return { role: 'user' as const, content: msg.toolResults.map((part) => part.content).join('\n') };
    }
    if ('toolCalls' in msg) {
      return { role: 'assistant' as const, content: msg.content ?? '' };
    }
    return msg;
  });
}

async function raceHang<T>(
  promise: Promise<T>,
  hangMs: number,
  token: CancelToken,
): Promise<T | 'hung' | 'cancelled'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hang = new Promise<'hung'>((resolve) => {
    timer = setTimeout(() => resolve('hung'), hangMs);
  });
  const cancel = waitForCancel(token).then(() => 'cancelled' as const);
  try {
    return await Promise.race([promise, hang, cancel]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
