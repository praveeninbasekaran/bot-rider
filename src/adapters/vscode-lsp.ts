import * as vscode from 'vscode';
import {
  emptySlice,
  findEnclosingRange,
  type LspDiagnostic,
  type LspSlicePort,
  type LspSliceSnapshot,
  type LspSymbol,
} from '../app/lsp-slice';
import type { WorkspaceContext } from '../protocol/messages';

const SYMBOL_KIND: Record<number, string> = {
  0: 'File',
  1: 'Module',
  2: 'Namespace',
  3: 'Package',
  4: 'Class',
  5: 'Method',
  6: 'Property',
  7: 'Field',
  8: 'Constructor',
  9: 'Enum',
  10: 'Interface',
  11: 'Function',
  12: 'Variable',
  13: 'Constant',
  14: 'String',
  15: 'Number',
  16: 'Boolean',
  17: 'Array',
  18: 'Object',
  19: 'Key',
  20: 'Null',
  21: 'EnumMember',
  22: 'Struct',
  23: 'Event',
  24: 'Operator',
  25: 'TypeParameter',
};

const SEVERITY: Record<number, string> = {
  0: 'error',
  1: 'warning',
  2: 'info',
  3: 'hint',
};

/**
 * Active-editor LSP slice: diagnostics + document symbols + enclosing range.
 * No 1-hop definition bodies. Cache dies on invalidate (successful Approve).
 */
export class VsCodeLspSlicePort implements LspSlicePort {
  private cache: { hash: string; slice: LspSliceSnapshot } | undefined;

  invalidate(): void {
    this.cache = undefined;
  }

  async capture(_workspace: WorkspaceContext): Promise<LspSliceSnapshot> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      return emptySlice();
    }
    const hash = `${editor.document.uri.toString()}@${editor.document.version}`;
    if (this.cache?.hash === hash) {
      return this.cache.slice;
    }
    const path = vscode.workspace.asRelativePath(editor.document.uri);
    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri).map(toDiagnostic);
    const symbols = await loadSymbols(editor.document);
    const selection = editor.selection;
    const selRange = {
      startLine: selection.start.line,
      endLine: selection.end.line,
      empty: selection.isEmpty,
    };
    const enclosingRange = findEnclosingRange(symbols, selRange, editor.document.getText());
    const slice: LspSliceSnapshot = {
      path,
      fileHash: hash,
      diagnostics,
      symbols,
      enclosingRange,
    };
    this.cache = { hash, slice };
    return slice;
  }
}

async function loadSymbols(document: vscode.TextDocument): Promise<LspSymbol[]> {
  let raw: unknown;
  try {
    raw = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
  } catch {
    return [];
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  return raw.map((item) => toSymbol(item)).filter((s): s is LspSymbol => !!s);
}

function toDiagnostic(d: vscode.Diagnostic): LspDiagnostic {
  return {
    message: d.message,
    severity: SEVERITY[d.severity] ?? 'info',
    range: { startLine: d.range.start.line, endLine: d.range.end.line },
  };
}

function toSymbol(item: unknown): LspSymbol | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  const rec = item as {
    name?: string;
    kind?: number;
    range?: vscode.Range;
    location?: { range?: vscode.Range };
    children?: unknown[];
  };
  const range = rec.range ?? rec.location?.range;
  if (!rec.name || !range) {
    return undefined;
  }
  const children = Array.isArray(rec.children)
    ? rec.children.map((c) => toSymbol(c)).filter((s): s is LspSymbol => !!s)
    : undefined;
  return {
    name: rec.name,
    kind: SYMBOL_KIND[rec.kind ?? -1] ?? 'Symbol',
    range: { startLine: range.start.line, endLine: range.end.line },
    children,
  };
}
