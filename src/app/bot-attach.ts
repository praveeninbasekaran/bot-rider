import * as path from 'node:path';
import {
  ATTACH_BINARY_PROBE_BYTES,
  ATTACH_MAX_BYTES,
  CLEARLY_AGENT_NAMES,
  attachmentsOf,
  type BotAttachment,
} from '../domain/bot';
import type { AttachSkipReason } from '../protocol/messages';
import { COPY } from './copy';

export interface AttachFileIo {
  statSize(absPath: string): Promise<number>;
  readBytes(absPath: string): Promise<Uint8Array>;
}

export interface AttachFormFields {
  name: string;
  handle: string;
  persona: string;
}

export interface AttachPickedFile {
  absPath: string;
}

export interface AttachSkip {
  name: string;
  reason: AttachSkipReason;
  message: string;
}

export interface AttachIngestResult {
  added: { path: string; name: string }[];
  skipped: AttachSkip[];
  attachments: BotAttachment[];
  mapped?: { name?: string; handle?: string; persona?: string };
}

export function shouldOpenAttachDialog(folderFsPath?: string): boolean {
  return Boolean(folderFsPath);
}

export function attachOpenDialogOptions(folderFsPath: string): {
  canSelectMany: true;
  canSelectFiles: true;
  canSelectFolders: false;
  defaultUri: { fsPath: string };
  title: string;
} {
  return {
    canSelectMany: true,
    canSelectFiles: true,
    canSelectFolders: false,
    defaultUri: { fsPath: folderFsPath },
    title: COPY.attachDialogTitle,
  };
}

export function workspaceRelativeLabel(folderFsPath: string, absPath: string): string | undefined {
  const folder = path.resolve(folderFsPath);
  const abs = path.resolve(absPath);
  const rel = path.relative(folder, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return undefined;
  }
  return rel.split(path.sep).join('/');
}

export function isClearlyAgentName(fileName: string): boolean {
  return (CLEARLY_AGENT_NAMES as readonly string[]).includes(fileName.toLowerCase());
}

export function isScriptOrHookPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  const base = (normalized.split('/').pop() ?? '').toLowerCase();
  if (/\.(sh|ps1|bash|zsh|hook)$/.test(base)) {
    return true;
  }
  const parts = normalized.split('/');
  return parts.some((part, index) => (part === '.husky' || part === 'hooks') && index < parts.length - 1);
}

export function canMapClearlyAgent(relPath: string): boolean {
  if (isScriptOrHookPath(relPath)) {
    return false;
  }
  const base = relPath.replace(/\\/g, '/').split('/').pop() ?? relPath;
  return isClearlyAgentName(base);
}

export function applyEmptyOnly(
  current: AttachFormFields,
  incoming: { name?: string; handle?: string; persona?: string },
): { name?: string; handle?: string; persona?: string } {
  const out: { name?: string; handle?: string; persona?: string } = {};
  if (incoming.name && !current.name.trim()) {
    out.name = incoming.name;
  }
  if (incoming.handle && !current.handle.trim()) {
    out.handle = incoming.handle;
  }
  if (incoming.persona && !current.persona.trim()) {
    out.persona = incoming.persona;
  }
  return out;
}

export function parseClearlyAgent(snapshot: string): { name?: string; handle?: string; persona?: string } {
  const front = parseFrontmatter(snapshot);
  if (front) {
    const name = front.fields.name?.trim() || undefined;
    const handle = front.fields.handle?.trim().toLowerCase() || undefined;
    const persona =
      front.fields.persona?.trim() || front.fields.description?.trim() || front.body.trim() || undefined;
    return compactMapped({ name, handle, persona });
  }
  const heading = parseFirstAtxH1(snapshot);
  if (heading) {
    return compactMapped({
      name: heading.name || undefined,
      persona: heading.body.trim() || undefined,
    });
  }
  return {};
}

export function resolveFormAttachments(
  fromForm: BotAttachment[] | undefined,
  session: BotAttachment[],
): BotAttachment[] {
  if (!fromForm) {
    return attachmentsOf({ attachments: session });
  }
  return fromForm.map((item) => {
    if (item.snapshot) {
      return { path: item.path, name: item.name, snapshot: item.snapshot };
    }
    const held = session.find((a) => a.path === item.path);
    return {
      path: item.path,
      name: item.name || held?.name || path.basename(item.path),
      snapshot: held?.snapshot ?? '',
    };
  });
}

export function removeAttachment(attachments: BotAttachment[], relPath: string): BotAttachment[] {
  return attachments.filter((item) => item.path !== relPath);
}

export async function ingestPickedFiles(args: {
  folderFsPath: string;
  picked: AttachPickedFile[];
  existing: BotAttachment[];
  fields: AttachFormFields;
  io: AttachFileIo;
}): Promise<AttachIngestResult> {
  const attachments = attachmentsOf({ attachments: args.existing });
  const added: { path: string; name: string }[] = [];
  const skipped: AttachSkip[] = [];
  let mapped: { name?: string; handle?: string; persona?: string } | undefined;
  let mappedThisPick = false;
  const fields = { ...args.fields };

  for (const file of args.picked) {
    const name = path.basename(file.absPath);
    const rel = workspaceRelativeLabel(args.folderFsPath, file.absPath);
    if (!rel) {
      skipped.push(skip(name, 'outside-workspace', COPY.attachSkipOutside(name)));
      continue;
    }
    if (attachments.some((item) => item.path === rel)) {
      continue;
    }

    let size: number | undefined;
    try {
      size = await args.io.statSize(file.absPath);
    } catch {
      size = undefined;
    }
    if (size !== undefined && size > ATTACH_MAX_BYTES) {
      skipped.push(skip(name, 'too-large', COPY.attachSkipTooLarge(name)));
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = await args.io.readBytes(file.absPath);
    } catch {
      skipped.push(skip(name, 'unreadable', COPY.attachSkipUnreadable(name)));
      continue;
    }
    if (bytes.byteLength > ATTACH_MAX_BYTES) {
      skipped.push(skip(name, 'too-large', COPY.attachSkipTooLarge(name)));
      continue;
    }
    if (isBinaryBytes(bytes)) {
      skipped.push(skip(name, 'binary', COPY.attachSkipBinary(name)));
      continue;
    }

    let snapshot: string;
    try {
      snapshot = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      skipped.push(skip(name, 'binary', COPY.attachSkipBinary(name)));
      continue;
    }

    const attachment: BotAttachment = { path: rel, name, snapshot };
    attachments.push(attachment);
    added.push({ path: rel, name });

    if (!mappedThisPick && canMapClearlyAgent(rel)) {
      mappedThisPick = true;
      const parsed = parseClearlyAgent(snapshot);
      const next = applyEmptyOnly(fields, parsed);
      if (next.name) {
        fields.name = next.name;
      }
      if (next.handle) {
        fields.handle = next.handle;
      }
      if (next.persona) {
        fields.persona = next.persona;
      }
      if (next.name || next.handle || next.persona) {
        mapped = next;
      }
    }
  }

  return { added, skipped, attachments, mapped };
}

function skip(name: string, reason: AttachSkipReason, message: string): AttachSkip {
  return { name, reason, message };
}

function isBinaryBytes(bytes: Uint8Array): boolean {
  const probe = bytes.subarray(0, ATTACH_BINARY_PROBE_BYTES);
  return probe.includes(0);
}

function compactMapped(fields: {
  name?: string;
  handle?: string;
  persona?: string;
}): { name?: string; handle?: string; persona?: string } {
  const out: { name?: string; handle?: string; persona?: string } = {};
  if (fields.name) {
    out.name = fields.name;
  }
  if (fields.handle) {
    out.handle = fields.handle;
  }
  if (fields.persona) {
    out.persona = fields.persona;
  }
  return out;
}

function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } | undefined {
  const src = text.replace(/^\uFEFF/, '');
  const match = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) {
    return undefined;
  }
  const raw = match[1] ?? '';
  const body = src.slice(match[0].length);
  const fields: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!kv) {
      continue;
    }
    const key = kv[1]!.toLowerCase();
    if (key !== 'name' && key !== 'handle' && key !== 'persona' && key !== 'description') {
      continue;
    }
    fields[key] = unquoteYaml(kv[2] ?? '');
  }
  return { fields, body };
}

function unquoteYaml(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFirstAtxH1(text: string): { name: string; body: string } | undefined {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const index = lines.findIndex((line) => /^#\s+/.test(line));
  if (index < 0) {
    return undefined;
  }
  const name = lines[index]!.replace(/^#\s+/, '').trim();
  if (!name) {
    return undefined;
  }
  return { name, body: lines.slice(index + 1).join('\n') };
}
