import type { ChangeFile } from '../domain/changeset';
import type { FileSystemPort } from './ports';

export type OpenSpecEntry = {
  id: string;
  body: string;
};

const INDEX_PATH = 'openspec/specs.md';

export type OpenSpecIndexRow = {
  id: string;
  specPath: string;
};

/** Exact catalog id as a whole token. `BR-6` does not match `BR-60`. Not a title match. */
export function containsExactIdToken(text: string, id: string): boolean {
  if (!id || !text) {
    return false;
  }
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`);
  return re.test(text);
}

export function collectExactCatalogIds(text: string, catalog: readonly { id: string }[]): string[] {
  return catalog.filter((entry) => containsExactIdToken(text, entry.id)).map((entry) => entry.id);
}

/** Keep catalog-index order; drop unknown; dedupe. */
export function filterToCatalog(candidates: readonly string[], catalog: readonly { id: string }[]): string[] {
  const wanted = new Set(candidates);
  return catalog.filter((entry) => wanted.has(entry.id)).map((entry) => entry.id);
}

export function citedIdsFromFiles(files: readonly { specIds?: string[] }[] | undefined): string[] {
  if (!files) {
    return [];
  }
  const ids: string[] = [];
  for (const file of files) {
    for (const id of file.specIds ?? []) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

export function matchSpecBodies(
  catalog: readonly OpenSpecEntry[],
  citedIds: readonly string[],
  userText: string,
): OpenSpecEntry[] {
  const cited = new Set(citedIds);
  return catalog.filter((entry) => cited.has(entry.id) || containsExactIdToken(userText, entry.id));
}

export function attachFileCites(file: ChangeFile, catalog: readonly OpenSpecEntry[]): ChangeFile {
  const jsonIds = file.specIds ?? [];
  const contentIds = typeof file.content === 'string' ? collectExactCatalogIds(file.content, catalog) : [];
  const specIds = filterToCatalog([...jsonIds, ...contentIds], catalog);
  const next: ChangeFile = {
    path: file.path,
    op: file.op,
  };
  if (file.content !== undefined) {
    next.content = file.content;
  }
  if (file.binary) {
    next.binary = file.binary;
  }
  if (file.kind) {
    next.kind = file.kind;
  }
  if (specIds.length > 0) {
    next.specIds = specIds;
  }
  return next;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return [];
  }
  let body = trimmed;
  if (body.startsWith('|')) {
    body = body.slice(1);
  }
  if (body.endsWith('|')) {
    body = body.slice(0, -1);
  }
  return body.split('|').map((cell) => cell.trim());
}

function isSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function extractSpecPath(cell: string): string | undefined {
  const trimmed = cell.trim();
  if (!trimmed) {
    return undefined;
  }
  const link = trimmed.match(/\[([^\]]*)\]\(([^)]+)\)/);
  let raw = (link ? link[2] : trimmed).trim();
  raw = raw.replace(/^<|>$/g, '').replace(/^['"]|['"]$/g, '');
  const hash = raw.indexOf('#');
  if (hash >= 0) {
    raw = raw.slice(0, hash);
  }
  raw = raw.trim();
  if (!raw || /^[a-z]+:\/\//i.test(raw)) {
    return undefined;
  }
  let path = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.startsWith('/')) {
    return undefined;
  }
  if (!path.startsWith('openspec/')) {
    path = `openspec/${path}`;
  }
  if (path.split('/').some((seg) => seg === '..')) {
    return undefined;
  }
  return path;
}

/** Parse `openspec/specs.md` markdown table. First column = id as stored. Duplicate ids: first row wins. */
export function parseSpecsIndex(markdown: string): OpenSpecIndexRow[] {
  const rows: OpenSpecIndexRow[] = [];
  const seen = new Set<string>();
  let specCol = -1;
  for (const line of markdown.split(/\r?\n/)) {
    const cells = splitRow(line);
    if (cells.length === 0) {
      continue;
    }
    if (isSeparator(cells)) {
      continue;
    }
    const first = cells[0] ?? '';
    if (!first) {
      continue;
    }
    if (first.toLowerCase() === 'id') {
      specCol = cells.findIndex((cell) => cell.toLowerCase() === 'spec');
      continue;
    }
    if (seen.has(first)) {
      continue;
    }
    seen.add(first);
    let specCell: string | undefined;
    if (specCol >= 0 && specCol < cells.length) {
      specCell = cells[specCol];
    } else {
      specCell = cells.find((cell) => /spec\.md/i.test(cell) || /\[[^\]]*\]\([^)]+\)/.test(cell));
    }
    const specPath = specCell ? extractSpecPath(specCell) : undefined;
    if (!specPath) {
      continue;
    }
    rows.push({ id: first, specPath });
  }
  return rows;
}

/**
 * Session-only catalog. Re-read on load() (Send / folder change / reload).
 * Never persist. Never write `openspec/`. Never scan directories to invent ids.
 */
export class OpenSpecCatalog {
  private entries: OpenSpecEntry[] = [];

  constructor(private readonly fs: FileSystemPort) {}

  snapshot(): OpenSpecEntry[] {
    return this.entries.map((entry) => ({ id: entry.id, body: entry.body }));
  }

  clear(): void {
    this.entries = [];
  }

  async load(): Promise<OpenSpecEntry[]> {
    try {
      this.entries = await this.readIndex();
    } catch {
      this.entries = [];
    }
    return this.snapshot();
  }

  private async readIndex(): Promise<OpenSpecEntry[]> {
    const markdown = await this.fs.readText(INDEX_PATH);
    if (markdown === undefined) {
      return [];
    }
    const rows = parseSpecsIndex(markdown);
    const entries: OpenSpecEntry[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      const body = await this.fs.readText(row.specPath);
      if (body === undefined) {
        continue;
      }
      entries.push({ id: row.id, body });
    }
    return entries;
  }
}
