import type { ChangeFile, FileOp } from '../domain/changeset';
import * as nodePath from 'node:path';

export type ParseResult =
  | { ok: true; files: ChangeFile[] }
  | { ok: false; code: 'parse-failed' | 'validate-failed'; message: string };

const FENCE_RE = /```(?:json)?\s*\r?\n([\s\S]*?)```/gi;

export function dropFileBodies(text: string): string {
  return text.replace(/```[\w+-]*\r?\n[\s\S]*?```/g, (block) => {
    const nl = block.search(/\r?\n/);
    const header = nl >= 0 ? block.slice(3, nl).trim() : '';
    return '```' + header + '\n```';
  });
}

export function extractChangesetJson(text: string): unknown | undefined {
  const re = new RegExp(FENCE_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const body = match[1]?.trim() ?? '';
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { files?: unknown }).files)) {
        return parsed;
      }
    } catch {
      // try next fenced block
    }
  }
  return undefined;
}

export function toPosixRelative(p: string): string {
  return p.replace(/\\/g, '/');
}

export function validateRelativePath(
  raw: string,
  workspaceRoot: string,
): { ok: true; relative: string } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: 'empty path' };
  }
  const posix = toPosixRelative(raw.trim());
  if (posix.split('/').some((seg) => seg === '.git')) {
    return { ok: false, reason: '.git path' };
  }
  if (posix.split('/').some((seg) => seg === '..')) {
    return { ok: false, reason: 'path traversal' };
  }

  const root = nodePath.resolve(workspaceRoot);
  const abs = nodePath.isAbsolute(posix)
    ? nodePath.resolve(posix)
    : nodePath.resolve(root, posix);
  const rel = nodePath.relative(root, abs);
  if (!rel || rel.startsWith('..') || nodePath.isAbsolute(rel)) {
    return { ok: false, reason: 'outside workspace' };
  }
  const relPosix = toPosixRelative(rel);
  if (relPosix.split('/').some((seg) => seg === '.git')) {
    return { ok: false, reason: '.git path' };
  }
  return { ok: true, relative: relPosix };
}

export class PatchParser {
  parseImplementer(text: string, workspaceRoot: string): ParseResult {
    const json = extractChangesetJson(text);
    if (!json) {
      return { ok: false, code: 'parse-failed', message: 'No JSON changeset with files[] found.' };
    }
    const filesRaw = (json as { files: unknown }).files;
    if (!Array.isArray(filesRaw)) {
      return { ok: false, code: 'parse-failed', message: 'files must be an array.' };
    }
    const files: ChangeFile[] = [];
    for (const item of filesRaw) {
      if (!item || typeof item !== 'object') {
        return { ok: false, code: 'validate-failed', message: 'Each file entry must be an object.' };
      }
      const rec = item as { path?: unknown; op?: unknown; content?: unknown };
      if (typeof rec.path !== 'string') {
        return { ok: false, code: 'validate-failed', message: 'Each file needs a path.' };
      }
      if (rec.op !== 'update' && rec.op !== 'create' && rec.op !== 'delete') {
        return { ok: false, code: 'validate-failed', message: `Invalid op "${String(rec.op)}".` };
      }
      const op = rec.op as FileOp;
      const pathCheck = validateRelativePath(rec.path, workspaceRoot);
      if (!pathCheck.ok) {
        return { ok: false, code: 'validate-failed', message: `Rejected path ${rec.path}: ${pathCheck.reason}.` };
      }
      if (op === 'delete') {
        files.push({ path: pathCheck.relative, op });
        continue;
      }
      if (typeof rec.content !== 'string') {
        return { ok: false, code: 'validate-failed', message: `${op} requires string content.` };
      }
      files.push({ path: pathCheck.relative, op, content: rec.content });
    }
    return { ok: true, files };
  }

  sanitizeDebate(text: string): string {
    return dropFileBodies(text);
  }
}
