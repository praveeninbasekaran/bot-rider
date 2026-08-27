import { describe, expect, it } from 'vitest';
import {
  RunBoardStore,
  boardPackText,
  emptyBoard,
  isBoardEmpty,
  parseTodoLines,
} from '../src/app/run-board';

describe('RunBoardStore', () => {
  it('starts empty and snapshot is a copy', () => {
    const store = new RunBoardStore();
    expect(isBoardEmpty(store.snapshot())).toBe(true);
    expect(isBoardEmpty(emptyBoard())).toBe(true);
    const snap = store.snapshot();
    snap.todos.push({ id: 'x', text: 'nope', status: 'pending' });
    expect(store.snapshot().todos).toEqual([]);
  });

  it('merges parseable todos in chronological host order and skips fenced blocks', () => {
    const store = new RunBoardStore();
    store.mergeParseableTodos('hello\n- [ ] first\n- [>] second\n```\n- [ ] inside-fence\n```\n- [x] third');
    expect(store.snapshot().todos.map((t) => t.text)).toEqual(['first', 'second', 'third']);
    expect(store.snapshot().todos.map((t) => t.status)).toEqual(['pending', 'current', 'done']);
    store.mergeParseableTodos('- [x] first');
    expect(store.snapshot().todos[0]?.status).toBe('done');
    expect(store.snapshot().todos.map((t) => t.text)).toEqual(['first', 'second', 'third']);
  });

  it('writes and clears Split-only dissents without inventing vote remainder', () => {
    const store = new RunBoardStore();
    store.setGoal('ship it');
    store.setDissents([
      { handle: 'alpha', text: 'Cache the layer.' },
      { handle: 'beta', text: 'Skip the cache.' },
    ]);
    expect(store.snapshot().dissents).toEqual([
      { handle: 'alpha', text: 'Cache the layer.' },
      { handle: 'beta', text: 'Skip the cache.' },
    ]);
    store.clearDissents();
    expect(store.snapshot().dissents).toEqual([]);
    expect(store.snapshot().goal).toBe('ship it');
  });

  it('marks files inChangeset when the changeset preview matches', () => {
    const store = new RunBoardStore();
    store.setFiles(['src/app.ts', 'README.md'], ['src/app.ts']);
    expect(store.snapshot().files).toEqual([
      { path: 'src/app.ts', inChangeset: true },
      { path: 'README.md', inChangeset: false },
    ]);
  });

  it('formats pack text with restated board facts', () => {
    const store = new RunBoardStore();
    store.setGoal('build it');
    store.mergeParseableTodos('- [ ] step');
    store.addDecision('Consensus');
    store.setDissents([{ handle: 'alpha', text: 'Need a split.' }]);
    store.setFiles(['a.ts'], ['a.ts']);
    const text = boardPackText(store.snapshot());
    expect(text).toContain('Goal: build it');
    expect(text).toContain('- [ ] step');
    expect(text).toContain('- Consensus');
    expect(text).toContain('- @alpha — Need a split.');
    expect(text).toContain('- a.ts (in changeset)');
  });
});

describe('parseTodoLines', () => {
  it('is sparse: prose without checkboxes yields nothing', () => {
    expect(parseTodoLines('Ship the cache layer now.')).toEqual([]);
  });
});
