import type { WorkspaceContext } from '../protocol/messages';

export interface LspLineRange {
  startLine: number;
  endLine: number;
  empty?: boolean;
}

export interface LspDiagnostic {
  message: string;
  severity?: string;
  range?: LspLineRange;
}

export interface LspSymbol {
  name: string;
  kind: string;
  range: LspLineRange;
  children?: LspSymbol[];
}

export interface LspEnclosingRange {
  startLine?: number;
  endLine?: number;
  text: string;
}

export interface LspSliceSnapshot {
  path?: string;
  fileHash?: string;
  diagnostics: LspDiagnostic[];
  symbols: LspSymbol[];
  enclosingRange?: LspEnclosingRange;
}

export interface LspSlicePort {
  capture(workspace: WorkspaceContext): Promise<LspSliceSnapshot>;
  invalidate(): void;
}

export class EmptyLspSlicePort implements LspSlicePort {
  invalidated = false;

  async capture(workspace: WorkspaceContext): Promise<LspSliceSnapshot> {
    return {
      path: workspace.activeEditor?.path,
      diagnostics: [],
      symbols: [],
    };
  }

  invalidate(): void {
    this.invalidated = true;
  }
}

export function emptySlice(path?: string): LspSliceSnapshot {
  return { path, diagnostics: [], symbols: [] };
}

function flattenSymbols(symbols: LspSymbol[]): LspSymbol[] {
  const out: LspSymbol[] = [];
  const walk = (items: LspSymbol[]): void => {
    for (const item of items) {
      out.push(item);
      if (item.children?.length) {
        walk(item.children);
      }
    }
  };
  walk(symbols);
  return out;
}

function rangeContains(outer: LspLineRange, inner: LspLineRange): boolean {
  return outer.startLine <= inner.startLine && outer.endLine >= inner.endLine;
}

function rangeSize(range: LspLineRange): number {
  return range.endLine - range.startLine;
}

export function sliceLines(text: string, range: LspLineRange): string {
  const lines = text.split(/\n/);
  const start = Math.max(0, range.startLine);
  const end = Math.min(lines.length - 1, range.endLine);
  if (start > end || lines.length === 0) {
    return '';
  }
  return lines.slice(start, end + 1).join('\n');
}

/**
 * Smallest symbol range that contains the selection. If none, a non-empty
 * selection is itself the enclosing range. Never falls back to the full buffer.
 */
export function findEnclosingRange(
  symbols: LspSymbol[],
  selection: LspLineRange | undefined,
  fileText: string,
): LspEnclosingRange | undefined {
  if (!selection) {
    return undefined;
  }
  const containing = flattenSymbols(symbols)
    .filter((s) => rangeContains(s.range, selection))
    .sort((a, b) => rangeSize(a.range) - rangeSize(b.range));
  const range = containing[0]?.range ?? (selection.empty ? undefined : selection);
  if (!range) {
    return undefined;
  }
  return {
    startLine: range.startLine,
    endLine: range.endLine,
    text: sliceLines(fileText, range),
  };
}

export function formatLspSlice(slice: LspSliceSnapshot): string {
  const lines: string[] = [];
  if (slice.path) {
    lines.push(`LSP slice of active file: ${slice.path}`);
  } else {
    lines.push('LSP slice of active file: (none)');
  }
  const hasDiag = slice.diagnostics.length > 0;
  const hasSym = slice.symbols.length > 0;
  const hasRange = !!slice.enclosingRange?.text;
  if (!hasDiag && !hasSym && !hasRange) {
    lines.push('(empty)');
    return lines.join('\n');
  }
  if (hasDiag) {
    lines.push('Diagnostics:');
    for (const d of slice.diagnostics) {
      const where = d.range ? `L${d.range.startLine + 1}` : '';
      const sev = d.severity ? `${d.severity} ` : '';
      lines.push(where ? `- ${where}: ${sev}${d.message}` : `- ${sev}${d.message}`.trim());
    }
  }
  if (hasSym) {
    lines.push('Document symbols:');
    for (const s of flattenSymbols(slice.symbols)) {
      lines.push(`- ${s.kind} ${s.name} L${s.range.startLine + 1}-L${s.range.endLine + 1}`);
    }
  }
  if (hasRange && slice.enclosingRange) {
    const r = slice.enclosingRange;
    const span =
      r.startLine !== undefined && r.endLine !== undefined
        ? ` L${r.startLine + 1}-L${r.endLine + 1}`
        : '';
    lines.push(`Enclosing range${span}:`);
    lines.push(r.text);
  }
  return lines.join('\n');
}

/** Fill enclosing range from the current selection when LSP symbols are empty. */
export function withSelectionFallback(
  slice: LspSliceSnapshot,
  workspace: WorkspaceContext,
): LspSliceSnapshot {
  if (slice.enclosingRange?.text) {
    return slice;
  }
  const selection = workspace.activeEditor?.selection;
  if (!selection) {
    return slice;
  }
  return {
    ...slice,
    path: slice.path ?? workspace.activeEditor?.path,
    enclosingRange: { text: selection },
  };
}
