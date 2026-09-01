import * as path from 'node:path';
import {
  ATTACH_BINARY_PROBE_BYTES,
  ATTACH_MAX_BYTES,
  attachmentsOf,
  isAttachmentKind,
  type AttachmentKind,
  type BotAttachment,
} from '../domain/bot';
import type { AttachSkipReason, HostToUi } from '../protocol/messages';
import { COPY } from './copy';

const MARKDOWN_TEXT_EXTS = ['md', 'txt', 'markdown'] as const;
const SCRIPT_HOOK_EXTS = ['py', 'js', 'ts', 'sh', 'bash', 'zsh', 'ps1'] as const;

const ATTACH_DIALOG_TITLE: Record<AttachmentKind, string> = {
  agent: 'Attach agent',
  skills: 'Attach skills',
  scripts: 'Attach scripts',
  instructions: 'Attach instructions',
  prompts: 'Attach prompts',
  hooks: 'Attach hooks',
};

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

export interface AttachOpenDialogOptions {
  canSelectMany: boolean;
  canSelectFiles: true;
  canSelectFolders: false;
  defaultUri: { fsPath: string };
  title: string;
  filters: Record<string, string[]>;
}

export function shouldOpenAttachDialog(folderFsPath?: string): boolean {
  return Boolean(folderFsPath);
}

export function attachFilterExtensions(slot: AttachmentKind): string[] {
  if (slot === 'scripts' || slot === 'hooks') {
    return [...MARKDOWN_TEXT_EXTS, ...SCRIPT_HOOK_EXTS];
  }
  return [...MARKDOWN_TEXT_EXTS];
}

export function attachOpenDialogOptions(folderFsPath: string, slot: AttachmentKind): AttachOpenDialogOptions {
  const exts = attachFilterExtensions(slot);
  const filterName = slot === 'scripts' || slot === 'hooks' ? 'Markdown, text, and scripts' : 'Markdown / text';
  return {
    canSelectMany: slot !== 'agent',
    canSelectFiles: true,
    canSelectFolders: false,
    defaultUri: { fsPath: folderFsPath },
    title: ATTACH_DIALOG_TITLE[slot],
    filters: { [filterName]: exts },
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

export function isUnfilledAttachField(field: keyof AttachFormFields, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return field === 'persona' && trimmed === COPY.defaultNewBotPersona;
}

export function applyEmptyOnly(
  current: AttachFormFields,
  incoming: { name?: string; handle?: string; persona?: string },
): { name?: string; handle?: string; persona?: string } {
  const out: { name?: string; handle?: string; persona?: string } = {};
  if (incoming.name && isUnfilledAttachField('name', current.name)) {
    out.name = incoming.name;
  }
  if (incoming.handle && isUnfilledAttachField('handle', current.handle)) {
    out.handle = incoming.handle;
  }
  if (incoming.persona && isUnfilledAttachField('persona', current.persona)) {
    out.persona = incoming.persona;
  }
  return out;
}

export function parseAgentSnapshot(snapshot: string): { name?: string; handle?: string; persona?: string } {
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

type FormAttachmentItem = BotAttachment & { slot?: unknown };

function kindOfFormItem(item: FormAttachmentItem): AttachmentKind | undefined {
  if (isAttachmentKind(item.kind)) {
    return item.kind;
  }
  if (isAttachmentKind(item.slot)) {
    return item.slot;
  }
  return undefined;
}

export function resolveFormAttachments(
  fromForm: FormAttachmentItem[] | undefined,
  session: BotAttachment[],
): BotAttachment[] {
  if (!fromForm) {
    return attachmentsOf({ attachments: session });
  }
  return fromForm.map((item) => {
    const held = findHeldAttachment(session, item);
    const next: BotAttachment = {
      path: item.path,
      name: item.name || held?.name || path.basename(item.path),
      snapshot: item.snapshot || held?.snapshot || '',
    };
    const kind = kindOfFormItem(item) ?? (held && isAttachmentKind(held.kind) ? held.kind : undefined);
    if (kind) {
      next.kind = kind;
    }
    return next;
  });
}

export function removeAttachment(
  attachments: BotAttachment[],
  slot: AttachmentKind,
  relPath: string,
): BotAttachment[] {
  return attachments.filter((item) => !(item.kind === slot && item.path === relPath));
}

export function emitAttachResult(
  slot: AttachmentKind,
  result: AttachIngestResult,
  emit: (msg: HostToUi) => void,
): void {
  if (result.mapped) {
    emit({ type: 'bots/attach-mapped', ...result.mapped });
  }
  if (result.added.length > 0) {
    emit({ type: 'bots/attach-added', slot, files: result.added });
  }
  for (const skip of result.skipped) {
    emit({
      type: 'bots/attach-skipped',
      slot,
      name: skip.name,
      reason: skip.reason,
      message: skip.message,
    });
  }
}

export async function ingestPickedFiles(args: {
  slot: AttachmentKind;
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
  const fields = { ...args.fields };
  const slot = args.slot;

  for (const file of args.picked) {
    const name = path.basename(file.absPath);
    const rel = workspaceRelativeLabel(args.folderFsPath, file.absPath);
    if (!rel) {
      skipped.push(skip(name, 'outside-workspace', COPY.attachSkipOutside(name)));
      continue;
    }
    if (attachments.some((item) => item.kind === slot && item.path === rel)) {
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

    if (slot === 'agent') {
      for (let i = attachments.length - 1; i >= 0; i--) {
        if (attachments[i]!.kind === 'agent') {
          attachments.splice(i, 1);
        }
      }
    }

    const attachment: BotAttachment = { path: rel, name, snapshot, kind: slot };
    attachments.push(attachment);
    added.push({ path: rel, name });

    if (slot === 'agent') {
      const parsed = parseAgentSnapshot(snapshot);
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
        mapped = { ...mapped, ...next };
      }
    }
  }

  return { added, skipped, attachments, mapped };
}

function findHeldAttachment(session: BotAttachment[], item: FormAttachmentItem): BotAttachment | undefined {
  const kind = kindOfFormItem(item);
  if (kind) {
    return (
      session.find((held) => held.path === item.path && held.kind === kind) ??
      session.find((held) => held.path === item.path && !held.kind)
    );
  }
  return session.find((held) => held.path === item.path);
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
