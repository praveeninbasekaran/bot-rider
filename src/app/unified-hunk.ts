import { createHash } from 'node:crypto';

export interface UnifiedHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export type UnifiedPatchResult =
  | { ok: true; oldPath: string; newPath: string; hunks: UnifiedHunk[] }
  | { ok: false; reason: string };

export type HunkApplyResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export const MISSING_SOURCE_HASH = 'sha256:missing';

export function sourceHash(text: string): string {
  return `sha256:${createHash('sha256').update(normalizeNewlines(text)).digest('hex')}`;
}

export function normalizePatchPath(value: string): string {
  const clean = value.trim().split(/\s+/)[0]!.replace(/\\/g, '/');
  if (clean === '/dev/null') {
    return clean;
  }
  return clean.replace(/^(?:a|b)\//, '').replace(/^\.\/+/, '');
}

export function parseUnifiedPatch(patch: string): UnifiedPatchResult {
  const lines = normalizeNewlines(patch).split('\n');
  const oldHeader = lines.findIndex((line) => line.startsWith('--- '));
  const newHeader = oldHeader >= 0 ? lines.findIndex((line, index) => index > oldHeader && line.startsWith('+++ ')) : -1;
  if (oldHeader < 0 || newHeader < 0) {
    return { ok: false, reason: 'Patch requires --- and +++ file headers.' };
  }
  const oldPath = normalizePatchPath(lines[oldHeader]!.slice(4));
  const newPath = normalizePatchPath(lines[newHeader]!.slice(4));
  const hunks: UnifiedHunk[] = [];
  let index = newHeader + 1;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line) {
      index += 1;
      continue;
    }
    const header = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/);
    if (!header) {
      return { ok: false, reason: `Unexpected patch line: ${line}` };
    }
    const hunk: UnifiedHunk = {
      oldStart: Number(header[1]),
      oldLines: header[2] === undefined ? 1 : Number(header[2]),
      newStart: Number(header[3]),
      newLines: header[4] === undefined ? 1 : Number(header[4]),
      lines: [],
    };
    index += 1;
    while (index < lines.length && !lines[index]!.startsWith('@@ ')) {
      const body = lines[index]!;
      if (body === '\\ No newline at end of file') {
        index += 1;
        continue;
      }
      if (!/^[ +\-]/.test(body)) {
        if (!body && index === lines.length - 1) {
          index += 1;
          break;
        }
        return { ok: false, reason: `Invalid hunk line: ${body}` };
      }
      hunk.lines.push(body);
      index += 1;
    }
    const oldCount = hunk.lines.filter((item) => item[0] !== '+').length;
    const newCount = hunk.lines.filter((item) => item[0] !== '-').length;
    if (oldCount !== hunk.oldLines || newCount !== hunk.newLines) {
      return { ok: false, reason: 'Hunk line counts do not match its header.' };
    }
    hunks.push(hunk);
  }
  return hunks.length > 0
    ? { ok: true, oldPath, newPath, hunks }
    : { ok: false, reason: 'Patch requires at least one hunk.' };
}

export function applyUnifiedPatch(base: string, patch: string): HunkApplyResult {
  const parsed = parseUnifiedPatch(patch);
  if (!parsed.ok) {
    return parsed;
  }
  const hadFinalNewline = normalizeNewlines(base).endsWith('\n');
  const source = normalizeNewlines(base).split('\n');
  if (hadFinalNewline) {
    source.pop();
  }
  const output: string[] = [];
  let cursor = 0;
  for (const hunk of parsed.hunks) {
    const target = Math.max(0, hunk.oldStart - 1);
    if (target < cursor || target > source.length) {
      return { ok: false, reason: `Hunk starts outside the source at line ${hunk.oldStart}.` };
    }
    output.push(...source.slice(cursor, target));
    cursor = target;
    for (const line of hunk.lines) {
      const marker = line[0]!;
      const value = line.slice(1);
      if (marker === ' ') {
        if (source[cursor] !== value) {
          return { ok: false, reason: `Context mismatch at source line ${cursor + 1}.` };
        }
        output.push(value);
        cursor += 1;
      } else if (marker === '-') {
        if (source[cursor] !== value) {
          return { ok: false, reason: `Delete mismatch at source line ${cursor + 1}.` };
        }
        cursor += 1;
      } else {
        output.push(value);
      }
    }
  }
  output.push(...source.slice(cursor));
  const text = output.join('\n');
  return { ok: true, text: hadFinalNewline ? `${text}\n` : text };
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}
