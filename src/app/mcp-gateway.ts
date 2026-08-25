import { COPY } from './copy';
import type { CancelToken } from './ports';
import type { LmChatTool } from './ports';
import type { HostToUi, McpSkipReason } from '../protocol/messages';

export const WRITE_ISH_RE = /\b(comment|transition|edit|post|create|update|delete|write|patch|merge|assign)\b/i;
export const MCP_SETTLE_MS = 400;
const ERROR_MESSAGE_MAX = 140;

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  title?: string;
}

export interface McpToolSource {
  label?: string;
  name?: string;
  id?: string;
  serverLabel?: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: object;
  tags?: readonly string[];
  title?: string;
  toolReferenceName?: string;
  annotations?: McpToolAnnotations;
  source?: McpToolSource;
}

export interface McpToolCall {
  callId: string;
  name: string;
  input: object;
}

export interface McpPort {
  listTools(): McpToolInfo[];
  invokeTool(name: string, input: unknown, token: CancelToken): Promise<unknown>;
  hasConfig(): boolean | Promise<boolean>;
  startServers(): Promise<void>;
}

export class EmptyMcpPort implements McpPort {
  listTools(): McpToolInfo[] {
    return [];
  }
  async invokeTool(): Promise<unknown> {
    throw new Error('MCP is not configured.');
  }
  hasConfig(): boolean {
    return false;
  }
  async startServers(): Promise<void> {
    return;
  }
}

export type McpAllowDecision =
  | { ok: true; server: string; tool: string }
  | { ok: false; reason: McpSkipReason; message: string; server: string; tool: string };

export interface McpInvokeResult {
  text: string;
  preview?: string;
  skipped: boolean;
  cancelled: boolean;
}

export function isMcpTagged(tool: McpToolInfo): boolean {
  return (tool.tags ?? []).some((tag) => tag.toLowerCase() === 'mcp');
}

export function normalizeIdent(value: string): string {
  return value.replace(/[_\-./]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function looksWriteIsh(name: string, title = ''): boolean {
  return WRITE_ISH_RE.test(`${normalizeIdent(name)} ${normalizeIdent(title)}`);
}

export function isReadOnlyMcp(tool: McpToolInfo): boolean {
  if (!isMcpTagged(tool)) {
    return false;
  }
  if (tool.annotations?.readOnlyHint !== true) {
    return false;
  }
  if (tool.annotations?.destructiveHint === true) {
    return false;
  }
  const title = `${tool.title ?? ''} ${tool.annotations?.title ?? ''}`;
  if (looksWriteIsh(tool.name, title)) {
    return false;
  }
  return true;
}

export function listReadOnlyTools(tools: readonly McpToolInfo[]): LmChatTool[] {
  return tools.filter(isReadOnlyMcp).map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema,
  }));
}

export function serverAndTool(info: McpToolInfo | undefined, callName: string): { server: string; tool: string } {
  const source = info?.source;
  const server =
    nonempty(source?.name) ||
    nonempty(source?.label) ||
    nonempty(source?.serverLabel) ||
    serverFromName(info?.name ?? callName);
  const tool = nonempty(info?.toolReferenceName) || shortToolName(info?.name ?? callName);
  return { server, tool };
}

export function previewToolResult(raw: unknown): string {
  const text = extractToolText(raw);
  const parsed = tryParseJson(text);
  if (parsed !== undefined) {
    return clipPreview(summarizeValue(parsed));
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && !hasToolContent(raw)) {
    return clipPreview(summarizeValue(raw));
  }
  return clipPreview(stripJsonLines(text));
}

export function extractToolText(raw: unknown): string {
  if (raw == null) {
    return '';
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (hasToolContent(raw)) {
    return raw.content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object') {
          if (typeof part.value === 'string') {
            return part.value;
          }
          if (typeof part.text === 'string') {
            return part.text;
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => extractToolText(item)).filter(Boolean).join('\n');
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

export function oneLineTruncate(text: string, max = ERROR_MESSAGE_MAX): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : line.slice(0, max);
}

export class McpGateway {
  private started = false;
  private hadConfig = false;
  private readonly notes: string[] = [];
  private readonly settleMs: number;

  constructor(
    private readonly port: McpPort,
    private readonly emit: (msg: HostToUi) => void,
    options: { settleMs?: number } = {},
  ) {
    this.settleMs = options.settleMs ?? 0;
  }

  get didStart(): boolean {
    return this.started;
  }

  noneConfigured(): boolean {
    return !this.hadConfig && !this.port.listTools().some(isMcpTagged);
  }

  listReadOnly(): LmChatTool[] {
    return listReadOnlyTools(this.port.listTools());
  }

  contextLines(): string[] {
    return [...this.notes];
  }

  allow(call: { name: string }): McpAllowDecision {
    const tools = this.port.listTools();
    const match = tools.find((tool) => tool.name === call.name);
    const ids = serverAndTool(match, call.name);
    if (match && isReadOnlyMcp(match)) {
      return { ok: true, ...ids };
    }
    const writeKnown = !!(match && isMcpTagged(match) && !isReadOnlyMcp(match));
    if (writeKnown || looksWriteIsh(call.name, match?.title ?? match?.annotations?.title ?? '')) {
      return {
        ok: false,
        reason: 'mutating-blocked',
        message: COPY.mcpSkipMutating(ids.server),
        ...ids,
      };
    }
    return { ok: false, reason: 'tool-missing', message: COPY.mcpSkipToolMissing, ...ids };
  }

  async ensureStartedFromSend(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    this.hadConfig = await Promise.resolve(this.port.hasConfig());
    if (!this.hadConfig) {
      return;
    }
    await this.port.startServers();
    if (this.settleMs > 0) {
      await delay(this.settleMs);
    }
  }

  async invoke(
    call: McpToolCall,
    token: CancelToken,
    botId: string,
    handle: string,
  ): Promise<McpInvokeResult> {
    if (token.isCancellationRequested) {
      return { text: '', skipped: true, cancelled: true };
    }
    const decision = this.allow(call);
    if (!decision.ok) {
      this.emitSkip(botId, handle, decision);
      return { text: decision.message, skipped: true, cancelled: false };
    }
    this.emit({
      type: 'chat/mcp-read-start',
      botId,
      handle,
      server: decision.server,
      tool: decision.tool,
    });
    if (token.isCancellationRequested) {
      this.emitSkip(botId, handle, {
        reason: 'error',
        message: oneLineTruncate('Cancelled.'),
        server: decision.server,
        tool: decision.tool,
      });
      return { text: '', skipped: true, cancelled: true };
    }
    try {
      const raw = await this.port.invokeTool(call.name, call.input, token);
      if (token.isCancellationRequested) {
        this.emitSkip(botId, handle, {
          reason: 'error',
          message: oneLineTruncate('Cancelled.'),
          server: decision.server,
          tool: decision.tool,
        });
        return { text: '', skipped: true, cancelled: true };
      }
      const text = extractToolText(raw);
      const preview = previewToolResult(raw);
      this.emit({
        type: 'chat/mcp-read-end',
        botId,
        handle,
        server: decision.server,
        tool: decision.tool,
        preview,
      });
      this.notes.push(`${decision.server}/${decision.tool}: ${preview}`);
      return { text, preview, skipped: false, cancelled: false };
    } catch (err) {
      if (token.isCancellationRequested) {
        this.emitSkip(botId, handle, {
          reason: 'error',
          message: oneLineTruncate('Cancelled.'),
          server: decision.server,
          tool: decision.tool,
        });
        return { text: '', skipped: true, cancelled: true };
      }
      const classified = classifyInvokeError(err);
      this.emitSkip(botId, handle, {
        ...classified,
        server: decision.server,
        tool: decision.tool,
      });
      return { text: classified.message, skipped: true, cancelled: false };
    }
  }

  private emitSkip(
    botId: string,
    handle: string,
    decision: { reason: McpSkipReason; message: string; server: string; tool: string },
  ): void {
    this.emit({
      type: 'chat/mcp-skip',
      botId,
      handle,
      server: decision.server,
      tool: decision.tool,
      reason: decision.reason,
      message: decision.message,
    });
  }
}

export function classifyInvokeError(err: unknown): { reason: McpSkipReason; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    /\b(unauthoriz|unauthenticated|not signed in|401|forbidden|authentication required|unauthorized)\b/.test(lower)
  ) {
    return { reason: 'unauthenticated', message: COPY.mcpSkipUnauthenticated };
  }
  if (/\b(not found|unknown server|no such server|not in this workspace)\b/.test(lower)) {
    return { reason: 'missing', message: COPY.mcpSkipMissing };
  }
  return { reason: 'error', message: oneLineTruncate(message) };
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function serverFromName(name: string): string {
  if (name.includes('/')) {
    return name.split('/')[0] || 'MCP';
  }
  const prefixed = name.match(/^mcp[_-]([a-z0-9]+)[_-]/i);
  if (prefixed?.[1]) {
    return prefixed[1];
  }
  return 'MCP';
}

function shortToolName(name: string): string {
  if (name.includes('/')) {
    return name.split('/').slice(1).join('/') || name;
  }
  if (!/^mcp[_-]/i.test(name)) {
    return name;
  }
  const stripped = name.replace(/^mcp[_-]/i, '');
  const parts = stripped.split(/[_-]/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join('_') : stripped || name;
}

function hasToolContent(raw: unknown): raw is { content: Array<string | { value?: string; text?: string }> } {
  return !!raw && typeof raw === 'object' && Array.isArray((raw as { content?: unknown }).content);
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) {
    const titles = value.map(titleOf).filter(Boolean).slice(0, 3);
    const countLine = `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
    return [countLine, titles.join(', ')].filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['items', 'issues', 'results', 'files', 'data']) {
      if (Array.isArray(obj[key])) {
        return summarizeValue(obj[key]);
      }
    }
    const lines: string[] = [];
    const title = titleOf(obj);
    if (title) {
      lines.push(title);
    }
    if (typeof obj.count === 'number') {
      lines.push(`${obj.count} results`);
    }
    if (lines.length) {
      return lines.join('\n');
    }
    return `${Object.keys(obj).length} fields`;
  }
  return stripJsonLines(String(value ?? ''));
}

function titleOf(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }
  const obj = value as Record<string, unknown>;
  for (const key of ['title', 'name', 'path', 'id', 'label']) {
    if (typeof obj[key] === 'string' && obj[key]) {
      return obj[key];
    }
  }
  return '';
}

function stripJsonLines(text: string): string {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const cleaned = lines.filter((line) => !line.startsWith('{') && !line.startsWith('['));
  return (cleaned.length ? cleaned : lines).slice(0, 3).join('\n');
}

function clipPreview(text: string): string {
  return text.split('\n').slice(0, 3).join('\n').slice(0, 280);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
