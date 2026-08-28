import { describe, expect, it } from 'vitest';
import { findEnclosingRange, formatLspSlice, sliceLines, withSelectionFallback } from '../src/app/lsp-slice';
import { defaultWorkspace } from './fakes';

describe('LspSlice', () => {
  it('picks the smallest containing symbol and never the full buffer', () => {
    const file = ['class Foo {', '  method() {', '    const x = 1;', '  }', '}'].join('\n');
    const symbols = [
      { name: 'Foo', kind: 'Class', range: { startLine: 0, endLine: 4 } },
      {
        name: 'method',
        kind: 'Method',
        range: { startLine: 1, endLine: 3 },
      },
    ];
    const enclosing = findEnclosingRange(symbols, { startLine: 2, endLine: 2 }, file);
    expect(enclosing?.startLine).toBe(1);
    expect(enclosing?.endLine).toBe(3);
    expect(enclosing?.text).toBe(sliceLines(file, { startLine: 1, endLine: 3 }));
    expect(enclosing?.text).not.toBe(file);
  });

  it('uses a non-empty selection when no symbol contains it', () => {
    const file = 'alpha\nbravo\ncharlie';
    const enclosing = findEnclosingRange([], { startLine: 1, endLine: 1 }, file);
    expect(enclosing?.text).toBe('bravo');
  });

  it('does not fall back to the full file for an empty cursor', () => {
    const file = 'export const n = 1;\n';
    const enclosing = findEnclosingRange([], { startLine: 0, endLine: 0, empty: true }, file);
    expect(enclosing).toBeUndefined();
  });

  it('formats an empty slice without file body', () => {
    const text = formatLspSlice({ path: 'src/app.ts', diagnostics: [], symbols: [] });
    expect(text).toContain('LSP slice of active file: src/app.ts');
    expect(text).toContain('(empty)');
    expect(text).not.toContain('export const');
  });

  it('keeps selection via enclosing-range fallback without attaching the buffer', () => {
    const slice = withSelectionFallback({ path: 'src/app.ts', diagnostics: [], symbols: [] }, defaultWorkspace);
    expect(slice.enclosingRange?.text).toBe('n = 1');
    const text = formatLspSlice(slice);
    expect(text).toContain('n = 1');
    expect(text).not.toContain(defaultWorkspace.activeEditor?.content);
  });
});
