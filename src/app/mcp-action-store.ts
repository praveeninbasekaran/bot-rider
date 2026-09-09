import { COPY } from './copy';
import type { HostToUi, McpActionDto } from '../protocol/messages';
import type { CancelToken } from './ports';

export const ARGS_LINE_MAX = 80;

const PREFERRED_ARG_KEYS = ['name', 'title', 'id', 'path', 'url', 'count', 'label', 'key'];

export interface McpStagedAction {
  id: string;
  name: string;
  server: string;
  tool: string;
  args: object;
  argsLine: string;
  botId: string;
  handle: string;
}

export interface McpBatchApprovalOptions {
  token?: CancelToken;
  onProgress?: (completed: number, total: number, action: McpStagedAction) => void;
}

export function mcpActionIdentity(
  action: Pick<McpStagedAction, 'name' | 'server' | 'tool' | 'args'>,
): string {
  return `${action.server}\u0000${action.name}\u0000${action.tool}\u0000${canonicalJson(action.args)}`;
}

export function mcpBatchConfirmation(actions: readonly McpActionDto[]): {
  message: string;
  detail: string;
  confirm: string;
} {
  const count = actions.length;
  return {
    message: COPY.mcpBatchConfirm(count),
    detail: actions
      .map((action, index) => {
        const args = action.argsLine ? `\n   ${action.argsLine}` : '';
        return `${index + 1}. ${action.server} · ${action.tool} · @${action.handle}${args}`;
      })
      .join('\n'),
    confirm: COPY.mcpBatchRun(count),
  };
}

export function toMcpActionDto(action: McpStagedAction): McpActionDto {
  return {
    id: action.id,
    server: action.server,
    tool: action.tool,
    argsLine: action.argsLine,
    botId: action.botId,
    handle: action.handle,
  };
}

export function argsLineFrom(args: unknown): string {
  if (args == null) {
    return '';
  }
  if (typeof args !== 'object') {
    return oneLineTruncate(String(args), ARGS_LINE_MAX);
  }
  if (Array.isArray(args)) {
    return oneLineTruncate(`${args.length} ${args.length === 1 ? 'item' : 'items'}`, ARGS_LINE_MAX);
  }
  const obj = args as Record<string, unknown>;
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const key of PREFERRED_ARG_KEYS) {
    if (!(key in obj)) {
      continue;
    }
    const bit = formatArgPart(key, obj[key]);
    if (bit) {
      parts.push(bit);
      seen.add(key);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (seen.has(key)) {
      continue;
    }
    const bit = formatArgPart(key, value);
    if (bit) {
      parts.push(bit);
    }
  }
  return oneLineTruncate(parts.join(' · '), ARGS_LINE_MAX);
}

function oneLineTruncate(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : line.slice(0, max);
}

function formatArgPart(key: string, value: unknown): string {
  if (value == null) {
    return '';
  }
  if (Array.isArray(value)) {
    return `${key} ${value.length}`;
  }
  if (typeof value === 'object') {
    return '';
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  return `${key} ${text}`;
}

export class McpActionStore {
  private pending: McpStagedAction[] = [];
  private seq = 0;

  constructor(private readonly emit: (msg: HostToUi) => void) {}

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  snapshot(): McpActionDto[] {
    return this.pending.map(toMcpActionDto);
  }

  exportState(): McpStagedAction[] {
    return this.pending.map((action) => ({ ...action, args: structuredClone(action.args) }));
  }

  restore(actions: readonly McpStagedAction[]): void {
    this.pending = [];
    this.seq = 0;
    for (const action of actions) {
      if (this.pending.some((item) => mcpActionIdentity(item) === mcpActionIdentity(action))) {
        continue;
      }
      this.pending.push({ ...action, args: structuredClone(action.args) });
      const sequence = Number(action.id.match(/^mcp-(\d+)$/)?.[1] ?? 0);
      this.seq = Math.max(this.seq, sequence);
    }
    this.emitPreview();
  }

  append(input: Omit<McpStagedAction, 'id'>): McpStagedAction {
    const identity = mcpActionIdentity(input);
    const duplicate = this.pending.find((action) => mcpActionIdentity(action) === identity);
    if (duplicate) {
      return duplicate;
    }
    this.seq += 1;
    const action: McpStagedAction = { ...input, id: `mcp-${this.seq}` };
    this.pending.push(action);
    this.emitPreview();
    return action;
  }

  /** Reject or host reload: drop the MCP batch only. Files stay. */
  clear(): void {
    this.pending = [];
    this.emit({ type: 'mcp/actions-cleared' });
  }

  async approve(
    invoke: (action: McpStagedAction) => Promise<void>,
    options: McpBatchApprovalOptions = {},
  ): Promise<boolean> {
    if (!this.pending.length) {
      return false;
    }
    const batch = [...this.pending];
    let completed = 0;
    for (const action of batch) {
      if (options.token?.isCancellationRequested) {
        this.emitPreview();
        return false;
      }
      try {
        await invoke(action);
        this.pending = this.pending.filter((item) => item.id !== action.id);
        completed += 1;
        options.onProgress?.(completed, batch.length, action);
        if (this.pending.length) {
          this.emitPreview();
        }
      } catch {
        if (options.token?.isCancellationRequested) {
          this.emitPreview();
          return false;
        }
        this.emit({
          type: 'mcp/actions-failed',
          message: COPY.mcpActionsFailed,
          leftoverIds: this.pending.map((item) => item.id),
        });
        return false;
      }
    }
    this.pending = [];
    this.emit({ type: 'mcp/actions-cleared' });
    return true;
  }

  private emitPreview(): void {
    this.emit({ type: 'mcp/actions-preview', actions: this.snapshot() });
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}
