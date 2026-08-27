import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
const chatCss = readFileSync(join(root, 'media/chat.css'), 'utf8');
const proto = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');

describe('Run board chrome (QC-1 §17)', () => {
  it('keeps additive HostToUi chat/board and pack-overflow without UiToHost board messages', () => {
    expect(proto).toMatch(/type: 'chat\/board'; board: RunBoardDto/);
    expect(proto).toMatch(/\| 'pack-overflow'/);
    expect(proto).toContain("type: 'review/open-diff'; path: string");
    const uiToHost = proto.slice(proto.indexOf('export type UiToHost'));
    expect(uiToHost).not.toMatch(/chat\/board/);
    expect(uiToHost).not.toMatch(/board\//);
  });

  it('places a sticky Run board above the transcript and keeps composer at the bottom', () => {
    const boardAt = chatJs.indexOf("id=\"run-board\"");
    const threadAt = chatJs.indexOf("id=\"thread\"");
    const composerAt = chatJs.indexOf("class=\"composer-wrap\"");
    expect(boardAt).toBeGreaterThan(-1);
    expect(threadAt).toBeGreaterThan(boardAt);
    expect(composerAt).toBeGreaterThan(threadAt);
    expect(chatJs).toContain('aria-label="Run"');
    expect(chatJs).toContain('class="run-board-label">Run<');
    expect(chatCss).toMatch(/\.run-board\s*\{[^}]*flex-shrink:\s*0/s);
    expect(chatCss).toMatch(/\.thread\s*\{[^}]*flex:\s*1/s);
    expect(chatCss).toMatch(/\.run-board\s*\{[^}]*padding:\s*8px/s);
    expect(chatCss).toMatch(/\.run-board\s*\{[^}]*gap:\s*4px/s);
    expect(chatCss).toMatch(/\.run-board\s*\{[^}]*font-size:\s*12px/s);
    expect(chatCss).toMatch(/\.run-board-label\s*\{[^}]*font-size:\s*11px/s);
    expect(chatCss).toMatch(/\.run-board-label\s*\{[^}]*text-transform:\s*uppercase/s);
    expect(chatCss).toContain('--vscode-descriptionForeground');
    expect(chatCss).toMatch(/\.run-board\.is-collapsed\s*\{[^}]*height:\s*22px/s);
  });

  it('renders chat/board snapshots only and hides empty snapshots', () => {
    expect(chatJs).toContain("msg.type === 'chat/board'");
    expect(chatJs).toContain('paintBoard(msg.board)');
    expect(chatJs).toContain('boardIsEmpty');
    expect(chatJs).toMatch(/!board\.goal && todos\.length === 0 && decisions\.length === 0 && dissents\.length === 0 && files\.length === 0/);
    expect(chatJs).toContain('hideBoardChrome');
    expect(chatJs).not.toMatch(/parseTodoLines/);
    expect(chatJs).not.toMatch(/TODO_LINE/);
    expect(chatJs).not.toContain('No todos');
    expect(chatJs).not.toMatch(/Graphify/i);
    expect(chatJs).not.toMatch(/token meter/i);
    expect(chatJs).not.toMatch(/setState\s*\(/);
    expect(chatJs).not.toMatch(/localStorage|sessionStorage/);
  });

  it('paints todos as no-op list items with status in accessible text', () => {
    expect(chatJs).toContain("li.setAttribute('role', 'listitem')");
    expect(chatJs).toContain("list.setAttribute('role', 'list')");
    expect(chatJs).toContain("glyph.setAttribute('aria-hidden', 'true')");
    expect(chatJs).toContain("sr.textContent = status + ', '");
    expect(chatJs).toContain("glyph.textContent = '\\u25cb'");
    expect(chatJs).toContain("glyph.textContent = '\\u25cf'");
    expect(chatJs).toContain("run-board-check");
    expect(chatCss).toContain('--vscode-progressBar-background');
    expect(chatCss).toContain('--vscode-testing-iconPassed');
    expect(chatCss).toContain('--vscode-charts-green');
    expect(chatCss).toMatch(/\.run-board-check\s*,?\s*[^{]*\{[^}]*width:\s*11px/s);
    expect(chatJs).not.toMatch(/type:\s*'checkbox'/);
    expect(chatJs).not.toMatch(/role:\s*'checkbox'|role', 'checkbox'/);
    expect(chatJs).not.toMatch(/changeset\/approve/);
    expect(chatJs).not.toMatch(/changeset\/reject/);
    expect(chatJs).toContain('todos.length <= 7');
    expect(chatJs).toContain("'+' + (todos.length - 7) + ' more'");
  });

  it('copies Split dissents with an em dash and caps the region', () => {
    expect(chatJs).toContain("' \\u2014 '");
    expect(chatJs).toContain('dissents.length > 4');
    expect(chatJs).toContain("'+' + (dissents.length - 4) + ' more'");
    expect(chatJs).toMatch(/if \(dissents\.length\)/);
  });

  it('opens diffs only for inChangeset file chips', () => {
    expect(chatJs).toContain("el.title = inSet ? 'Open diff' : 'Not proposed yet'");
    expect(chatJs).toContain("vscode.postMessage({ type: 'review/open-diff', path: file.path })");
    expect(chatJs).toContain('files.length > 6');
    expect(chatJs).toContain("'+' + (files.length - 6) + ' more'");
    expect(chatJs).toContain('fileBaseName(file.path)');
    expect(chatJs).toMatch(/changeset\/preview[\s\S]*showFiles\(msg\.files/);
    expect(chatJs).not.toMatch(/changeset\/preview[\s\S]*inChangeset\s*=/);
  });

  it('collapses session-only with the §17 toggle label', () => {
    expect(chatJs).toContain("state.boardCollapsed = !state.boardCollapsed");
    expect(chatJs).toContain("'Run, ' + counts.done + ' of ' + counts.total + ' todos, '");
    expect(chatJs).toContain("collapsed ? 'collapsed' : 'expanded'");
    expect(chatJs).toContain("goalText ? ' \\u00b7 ' : ''");
    expect(chatJs).toContain('counts.total === 0');
    expect(chatJs).toContain("state.boardCollapsed = false");
    expect(chatJs).toContain('goalText !== state.lastBoardGoal');
    expect(chatJs).toContain('boardGoalLive.textContent = goalText');
  });

  it('paints pack-overflow as a polite thread error and keeps the composer enabled', () => {
    expect(chatJs).toContain("msg.code === 'pack-overflow'");
    expect(chatJs).toContain('paintPackOverflow(msg.message)');
    expect(chatJs).toContain('el.setAttribute(\'aria-live\', \'polite\')');
    expect(chatJs).toContain("className = 'error system'");
    expect(chatJs).toContain("Prompt doesn't fit Copilot");
    expect(chatJs).toContain("The minimum context for this turn is larger than Copilot's window.");
    expect(chatJs).toContain('Required context was not dropped.');
    expect(chatJs).toContain('state.debateRunning = false');
    expect(chatJs).toContain('lockComposer()');
    const overflowFn = chatJs.slice(chatJs.indexOf('function paintPackOverflow'), chatJs.indexOf('function reduceMotion'));
    expect(overflowFn).not.toContain('Sign in');
    expect(overflowFn).not.toContain('Retry');
    expect(overflowFn).not.toContain('Install');
    expect(overflowFn).not.toContain('paintBoard');
    expect(overflowFn).not.toContain("role', 'alert'");
    expect(chatCss).toMatch(/\.error\s*\{[^}]*errorForeground/s);
  });
});
