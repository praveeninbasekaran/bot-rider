import type { BotRecord } from '../domain/bot';
import type { ChangeFile } from '../domain/changeset';
import { validateRelativePath } from './patch-parser';

export type PathAssignment = {
  handle: string;
  paths: string[];
};

export type ValidatedAssignment = {
  handle: string;
  botId: string;
  paths: string[];
};

export type SplitParse =
  | { ok: true; assignments: PathAssignment[]; declaredPaths?: string[] }
  | { ok: false; reason: string };

export type SplitValidate =
  | { ok: true; assignments: ValidatedAssignment[] }
  | { ok: false; reason: string };

const FENCE_RE = /```(?:json)?\s*\r?\n([\s\S]*?)```/gi;

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      return undefined;
    }
    out.push(item.trim());
  }
  return out;
}

function fromAssignments(raw: unknown): PathAssignment[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const assignments: PathAssignment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return undefined;
    }
    const rec = item as { handle?: unknown; paths?: unknown };
    if (typeof rec.handle !== 'string' || !rec.handle.trim()) {
      return undefined;
    }
    const paths = readStringArray(rec.paths);
    if (!paths) {
      return undefined;
    }
    assignments.push({ handle: rec.handle.trim(), paths });
  }
  return assignments;
}

function fromSplitMap(raw: unknown): PathAssignment[] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const assignments: PathAssignment[] = [];
  for (const [handle, pathsRaw] of Object.entries(raw as Record<string, unknown>)) {
    const paths = readStringArray(pathsRaw);
    if (!paths) {
      return undefined;
    }
    assignments.push({ handle, paths });
  }
  return assignments;
}

function extractSplitJson(text: string): unknown | undefined {
  const re = new RegExp(FENCE_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const body = match[1]?.trim() ?? '';
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === 'object') {
        const rec = parsed as { assignments?: unknown; split?: unknown };
        if (rec.assignments !== undefined || rec.split !== undefined) {
          return parsed;
        }
      }
    } catch {
      // try next fenced block
    }
  }
  return undefined;
}

/** Dispatcher JSON: assignments[] or split map. Host never invents a partition. */
export function parseDispatcherSplit(text: string): SplitParse {
  const json = extractSplitJson(text);
  if (!json || typeof json !== 'object') {
    return { ok: false, reason: 'no split json' };
  }
  const rec = json as { assignments?: unknown; split?: unknown; paths?: unknown };
  const assignments = fromAssignments(rec.assignments) ?? fromSplitMap(rec.split);
  if (!assignments) {
    return { ok: false, reason: 'no assignments' };
  }
  const declared = rec.paths !== undefined ? readStringArray(rec.paths) : undefined;
  if (rec.paths !== undefined && !declared) {
    return { ok: false, reason: 'invalid declared paths' };
  }
  const parsed: SplitParse = { ok: true, assignments };
  if (declared) {
    parsed.declaredPaths = declared;
  }
  return parsed;
}

function handleKey(handle: string): string {
  return handle.trim().toLowerCase();
}

/**
 * Remaining active bots only. Not name matching. Not reserved Dev1/Dev2/tester roles.
 * Host does not rewrite or fill the split.
 */
export function validateDispatcherSplit(args: {
  assignments: PathAssignment[];
  declaredPaths?: string[];
  remaining: Pick<BotRecord, 'id' | 'handle' | 'active'>[];
  workspaceRoot: string;
}): SplitValidate {
  if (args.assignments.length === 0) {
    return { ok: false, reason: 'empty assignment' };
  }
  const remaining = args.remaining.filter((bot) => bot.active);
  const byHandle = new Map(remaining.map((bot) => [handleKey(bot.handle), bot]));
  const seenHandles = new Set<string>();
  const seenPaths = new Set<string>();
  const validated: ValidatedAssignment[] = [];

  for (const item of args.assignments) {
    const key = handleKey(item.handle);
    if (!key) {
      return { ok: false, reason: 'unknown handle' };
    }
    if (seenHandles.has(key)) {
      return { ok: false, reason: 'duplicate handle' };
    }
    seenHandles.add(key);
    const bot = byHandle.get(key);
    if (!bot) {
      return { ok: false, reason: 'unknown handle' };
    }
    if (item.paths.length === 0) {
      return { ok: false, reason: 'empty assignment' };
    }
    const paths: string[] = [];
    for (const raw of item.paths) {
      const check = validateRelativePath(raw, args.workspaceRoot);
      if (!check.ok) {
        return { ok: false, reason: check.reason };
      }
      if (seenPaths.has(check.relative)) {
        return { ok: false, reason: 'overlap' };
      }
      seenPaths.add(check.relative);
      paths.push(check.relative);
    }
    validated.push({ handle: bot.handle, botId: bot.id, paths });
  }

  if (args.declaredPaths) {
    const declared = new Set<string>();
    for (const raw of args.declaredPaths) {
      const check = validateRelativePath(raw, args.workspaceRoot);
      if (!check.ok) {
        return { ok: false, reason: check.reason };
      }
      declared.add(check.relative);
    }
    if (declared.size !== seenPaths.size) {
      return { ok: false, reason: 'not a partition' };
    }
    for (const path of declared) {
      if (!seenPaths.has(path)) {
        return { ok: false, reason: 'not a partition' };
      }
    }
  }

  return { ok: true, assignments: validated };
}

export function remainingWorkBots(freeze: BotRecord[], spec: BotRecord, dispatcher: BotRecord): BotRecord[] {
  const skip = new Set([spec.id, dispatcher.id]);
  return freeze.filter((bot) => bot.active && !skip.has(bot.id));
}

export function isTestPath(path: string): boolean {
  const posix = path.replace(/\\/g, '/');
  const segments = posix.split('/');
  if (segments.some((seg) => seg === 'test' || seg === 'tests' || seg === '__tests__')) {
    return true;
  }
  const base = segments[segments.length - 1] ?? '';
  return /\.(tests?|spec)\./i.test(base);
}

/** Tester = worker whose assigned paths are test paths. Not a reserved role. */
export function isTesterAssignment(paths: string[]): boolean {
  return paths.length > 0 && paths.every(isTestPath);
}

export function unionWorkerFiles(byWorker: { botId: string; files: ChangeFile[] }[]): {
  files: ChangeFile[];
  collisions: string[];
} {
  const owners = new Map<string, string>();
  const kept = new Map<string, ChangeFile>();
  const collisions = new Set<string>();
  for (const worker of byWorker) {
    const seen = new Set<string>();
    for (const file of worker.files) {
      if (seen.has(file.path)) {
        kept.set(file.path, file);
        continue;
      }
      seen.add(file.path);
      const owner = owners.get(file.path);
      if (owner && owner !== worker.botId) {
        collisions.add(file.path);
        kept.delete(file.path);
        continue;
      }
      if (collisions.has(file.path)) {
        continue;
      }
      owners.set(file.path, worker.botId);
      kept.set(file.path, file);
    }
  }
  const files = [...kept.values()].filter((file) => !collisions.has(file.path));
  return { files, collisions: [...collisions].sort() };
}
