import { COPY } from './copy';
import type { HostToUi, McpActionDto } from '../protocol/messages';

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

  append(input: Omit<McpStagedAction, 'id'>): McpStagedAction {
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

  async approve(invoke: (action: McpStagedAction) => Promise<void>): Promise<boolean> {
    if (!this.pending.length) {
      return false;
    }
    const batch = [...this.pending];
    for (const action of batch) {
      try {
        await invoke(action);
        this.pending = this.pending.filter((item) => item.id !== action.id);
      } catch {
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
