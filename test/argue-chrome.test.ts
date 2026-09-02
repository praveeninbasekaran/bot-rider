import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COPY } from '../src/app/copy';
import { proposedFileChrome } from '../src/adapters/review-chrome';

const root = join(__dirname, '..');
const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
const chatCss = readFileSync(join(root, 'media/chat.css'), 'utf8');
const formJs = readFileSync(join(root, 'media/bot-form.js'), 'utf8');
const proto = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');
const runState = readFileSync(join(root, 'src/domain/run-state.ts'), 'utf8');
const sidebar = readFileSync(join(root, 'src/adapters/chat-view.ts'), 'utf8');
const expand = readFileSync(join(root, 'src/adapters/chat-expand-panel.ts'), 'utf8');
const reviewChrome = readFileSync(join(root, 'src/adapters/review-chrome.ts'), 'utf8');
const reviewTree = readFileSync(join(root, 'src/adapters/review-tree.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  contributes: {
    viewsContainers: { activitybar: { id: string }[] };
    views: Record<string, { id: string }[]>;
  };
};

function extractBlock(source: string, startNeedle: string): string {
  const start = source.indexOf(startNeedle);
  expect(start, startNeedle).toBeGreaterThan(-1);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`unbalanced ${startNeedle}`);
}

const chrome = new Function(
  `${extractBlock(chatJs, 'function isDebateTurn')};
   ${extractBlock(chatJs, 'function isWorkTurn')};
   ${extractBlock(chatJs, 'function roundHeaderCopy')};
   ${extractBlock(chatJs, 'function argueHeaderPath')};
   ${extractBlock(chatJs, 'function argueRoundNumber')};
   ${extractBlock(chatJs, 'function shouldShowInFlightChips')};
   ${extractBlock(chatJs, 'function canAnnounceArticle')};
   return { isDebateTurn, isWorkTurn, roundHeaderCopy, argueHeaderPath, argueRoundNumber, shouldShowInFlightChips, canAnnounceArticle };`,
)() as {
  isDebateTurn: (turn: string) => boolean;
  isWorkTurn: (turn: string) => boolean;
  roundHeaderCopy: (n: number, turn: string) => string;
  argueHeaderPath: (text: string) => string;
  argueRoundNumber: (text: string) => number;
  shouldShowInFlightChips: (handles: string[]) => boolean;
  canAnnounceArticle: (lastAt: number, now: number) => boolean;
};

const lockFn = chatJs.slice(chatJs.indexOf('function lockComposer'), chatJs.indexOf('function renderCopilot'));
const sendNowFn = chatJs.slice(chatJs.indexOf('function sendNow'), chatJs.indexOf('function esc'));
const onSendFn = chatJs.slice(chatJs.indexOf('function onSendOrStop'), chatJs.indexOf('function onKey'));
const pickerFn = chatJs.slice(chatJs.indexOf('function renderPicker'), chatJs.indexOf('function insertHandle'));
const chipsFn = chatJs.slice(chatJs.indexOf('function renderInFlightChips'), chatJs.indexOf('function paintBoard'));
const waitFn = extractBlock(chatJs, 'function renderWaitingChips');
const boardFn = extractBlock(chatJs, 'function inflightHandlesForBoard');
const waitingFn = extractBlock(chatJs, 'function waitingHandles');
const phaseFn = chatJs.slice(chatJs.indexOf('function maybePhaseHeader'), chatJs.indexOf('function showSplit'));
const showSplitFn = chatJs.slice(chatJs.indexOf('function showSplit'), chatJs.indexOf('function hideSplit'));
const showFilesFn = extractBlock(chatJs, 'function showFiles');
const turnStart = chatJs.slice(chatJs.indexOf("msg.type === 'chat/turn-start'"), chatJs.indexOf("msg.type === 'chat/token'"));
const tokenHandler = chatJs.slice(chatJs.indexOf("msg.type === 'chat/token'"), chatJs.indexOf("msg.type === 'chat/mcp-read-start'"));
const splitHandler = chatJs.slice(chatJs.indexOf("msg.type === 'chat/split'"), chatJs.indexOf("msg.type === 'chat/notice'"));
const noticeHandler = chatJs.slice(chatJs.indexOf("msg.type === 'chat/notice'"), chatJs.indexOf("msg.type === 'chat/board'"));
const runStateHandler = chatJs.slice(chatJs.indexOf("msg.type === 'run/state'"), chatJs.indexOf("msg.type === 'chat/turn-start'"));

describe('§28 F8b sequential Argue chrome', () => {
  it('paints ARGUE · {path} once as a round-header, not a generic notice', () => {
    expect(COPY.argueHeader('src/a.ts')).toBe('ARGUE · src/a.ts');
    expect(chrome.argueHeaderPath('ARGUE · src/a.ts')).toBe('src/a.ts');
    expect(chrome.argueHeaderPath('ARGUE · docs/ui-ux-work-run.md')).toBe('docs/ui-ux-work-run.md');
    expect(chrome.argueHeaderPath('Argue round 1')).toBe('');
    expect(chrome.argueHeaderPath('Skipped src/a.ts · collision')).toBe('');
    expect(chatJs).toContain("'ARGUE · ' + p");
    expect(chatJs).toContain("rh.className = 'round-header is-argue'");
    expect(chatJs).toContain('function paintArguePathHeader');
    expect(chatJs).toContain('function paintArgueNotice');
    expect(runStateHandler).toContain('paintArguePathHeader(state.run.arguePath)');
    expect(noticeHandler).toContain('paintArgueNotice(msg.text || \'\')');
    expect(chatJs).toContain('announceOnce(rh.textContent)');
    expect(chatCss).toMatch(/\.round-header\.is-argue\s*\{[^}]*text-transform:\s*none/s);
    expect(sidebar).toContain("scriptFile: 'chat.js'");
    expect(expand).toContain("scriptFile: 'chat.js'");
    expect(expand).toContain("viewType = 'botrider.chatPanel'");
  });

  it('keeps Argue round 1 / 2 headers and never uses ROUND n · CRITIQUE for argue', () => {
    expect(COPY.argueRound(1)).toBe('Argue round 1');
    expect(COPY.argueRound(2)).toBe('Argue round 2');
    expect(chrome.argueRoundNumber('Argue round 1')).toBe(1);
    expect(chrome.argueRoundNumber('Argue round 2')).toBe(2);
    expect(chrome.argueRoundNumber('ROUND 1 · CRITIQUE')).toBe(0);
    expect(chrome.argueRoundNumber('ROUND 2 · PROPOSE')).toBe(0);
    expect(chrome.roundHeaderCopy(1, 'argue')).toBe('');
    expect(chrome.roundHeaderCopy(1, 'critique')).toBe('ROUND 1 · CRITIQUE');
    expect(chrome.roundHeaderCopy(1, 'propose')).toBe('ROUND 1 · PROPOSE');
    expect(chatJs).toContain("'Argue round ' + round");
    expect(phaseFn).toContain("turn === 'argue'");
    expect(phaseFn).toContain('paintArgueRoundHeader');
    expect(phaseFn).not.toContain("roundHeaderCopy(n, 'argue')");
    expect(runStateHandler).toContain('paintArgueRoundHeader(state.run.argueRound)');
    expect(chatJs).toContain('announce(rh.textContent)');
  });

  it('does not paint Split / Continue / Pick on Argue Stop or chat/split', () => {
    expect(splitHandler).toContain('isArgueRun()');
    expect(splitHandler).toContain('hideSplit()');
    expect(splitHandler.indexOf('hideSplit()')).toBeLessThan(splitHandler.indexOf('showSplit(msg)'));
    expect(noticeHandler).toContain("msg.text === 'Interrupted'");
    expect(noticeHandler).toContain('isArgueRun()');
    expect(noticeHandler).toContain('hideSplit()');
    expect(runStateHandler).toContain('hideSplit()');
    expect(onSendFn).toContain("vscode.postMessage({ type: 'chat/stop' })");
    expect(chatJs).toContain('id="work-stop"');
    expect(chatJs).toContain("type: 'chat/stop'");
    expect(chatJs).not.toContain("type: 'split/stop'");
    expect(chatJs).not.toContain("type: 'work/stop'");
    expect(chatJs).not.toContain('enterSplit');
    expect(showSplitFn).toContain('split-continue');
    expect(showSplitFn).toContain('split-pick');
  });

  it('keeps §27.9 Work-batch overlap and sequential Argue HV without merging bubbles', () => {
    expect(chrome.isWorkTurn('spec')).toBe(true);
    expect(chrome.isWorkTurn('dispatch')).toBe(true);
    expect(chrome.isWorkTurn('work')).toBe(true);
    expect(chrome.isWorkTurn('argue')).toBe(true);
    expect(chrome.isWorkTurn('propose')).toBe(false);
    expect(chrome.isDebateTurn('argue')).toBe(false);
    expect(chatJs).toContain('flights: {}');
    expect(chatJs).toContain('function flightFor(botId)');
    expect(turnStart).toContain('state.flights[msg.botId] = flight');
    expect(turnStart).toContain('isWorkTurn(msg.turn)');
    expect(tokenHandler).toContain('const current = flightFor(msg.botId)');
    expect(chatJs).not.toMatch(/mergeBubbles|merge-bubbles|combineArticles/);
    expect(lockFn).toContain('state.workBatch && ready && !state.splitOpen');
    expect(boardFn).toContain('isArgueRun() && work.length >= 1');
    expect(waitingFn).toContain('!isArgueRun() && state.completedBots[id]');
    expect(chrome.shouldShowInFlightChips(['alpha'])).toBe(false);
    expect(chrome.shouldShowInFlightChips(['alpha', 'beta'])).toBe(true);
  });

  it('keeps skip copy Skipped {path} · collision as a polite notice once', () => {
    expect(COPY.skippedCollision('src/a.ts')).toBe('Skipped src/a.ts · collision');
    expect(chatJs).toContain('/ · collision$/');
    expect(chatJs).toContain('announceOnce');
    expect(chrome.argueHeaderPath('Skipped src/a.ts · collision')).toBe('');
    expect(chrome.argueRoundNumber('Skipped src/a.ts · collision')).toBe(0);
    const noticeFn = extractBlock(chatJs, 'function appendNotice');
    expect(noticeFn).toContain("el.className = 'notice'");
    expect(noticeFn).toContain("el.setAttribute('aria-live', 'polite')");
    expect(noticeFn).toContain('announceOnce(text)');
  });

  it('unlocks the composer during Argue like Work-batch and does not add a third Send mode', () => {
    expect(lockFn).toContain('isArgueRun() && ready && !state.splitOpen');
    expect(lockFn).toContain("send.textContent = 'Send'");
    expect(lockFn).toContain('input.disabled = false');
    expect(lockFn).toContain('workStop.hidden = false');
    expect(lockFn).toContain("'Debate running…'");
    expect(onSendFn).toContain('state.debateRunning && !state.workBatch && !isArgueRun()');
    expect(sendNowFn).toContain('state.debateRunning && !state.workBatch && !isArgueRun()');
    expect(sendNowFn).toContain('state.workBatch || isArgueRun()');
    expect(pickerFn).toContain('state.splitOpen || state.debateRunning && !state.workBatch && !isArgueRun()');
    expect(chatJs).toContain('id="run-type-work"');
    expect(chatJs).toContain('id="run-type-debate"');
    expect(chatJs).not.toContain('data-run-type="argue"');
    expect(chatJs).not.toContain("id=\"run-type-argue\"");
    expect(formJs).not.toMatch(/Argue/);
    expect(chatJs).toContain("placeholder=\"Message the swarm. Use @handle to lock a bot.\"");
  });

  it('may show one Argue speaker ● in-flight and remaining claimants ○ waiting as @{handle}', () => {
    expect(boardFn).toContain('isArgueRun() && work.length >= 1');
    expect(chipsFn).toContain("label.textContent = '@' + handles[i]");
    expect(chipsFn).toContain("glyph.textContent = '\\u25cf'");
    expect(chipsFn).toContain("glyph.setAttribute('aria-hidden', 'true')");
    expect(chipsFn).toContain('e.preventDefault()');
    expect(chipsFn).not.toContain('postMessage');
    expect(waitFn).toContain("className = 'run-board-waiting-chip'");
    expect(waitFn).toContain("glyph.textContent = '\\u25cb'");
    expect(waitFn).toContain("label.textContent = '@' + handles[i]");
    expect(waitFn).toContain("glyph.setAttribute('aria-hidden', 'true')");
    expect(waitFn).toContain('e.preventDefault()');
    expect(waitFn).not.toContain('postMessage');
    expect(chipsFn + waitFn).not.toMatch(/packet|Event Bus|path list|chase/i);
    expect(chipsFn).not.toContain('msg.name');
    expect(chipsFn).not.toContain('displayName');
    expect(chatJs).not.toContain("type: 'changeset/approve'");
    expect(chipsFn).not.toContain('mcp/actions');
    expect(chipsFn).not.toContain('OpenSpec');
  });

  it('leaves Approve held to host holdApprove and remainder visible in one Files list', () => {
    expect(showFilesFn).toContain('state.previewFiles = files || []');
    expect(showFilesFn).toContain("Proposed changes · '");
    expect(chatJs).toContain("msg.type === 'changeset/preview'");
    expect(chatJs).toContain('showFiles(msg.files || [])');
    expect(chatJs).not.toContain("type: 'changeset/approve'");
    expect(chatJs).not.toContain("type: 'mcp/actions-approve'");
    expect(reviewTree).toContain("sectionItem('Files', 'filesSection', 'reviewFilesSection')");
    expect(reviewTree).toContain("sectionItem('MCP actions', 'mcpSection', 'reviewMcpSection')");
    expect(reviewTree).toContain('this.app.changesets.files');
    expect(reviewTree).toContain('this.app.changesets.hasPending()');
    expect(reviewChrome).toContain('specIds');
    expect(proposedFileChrome({ path: 'src/keep.ts', op: 'create', specIds: ['BR-6'] }).description).toContain('BR-6');
  });

  it('announces header and round politely once and throttles per-article live regions', () => {
    expect(chatJs).toContain('function paintArguePathHeader');
    expect(chatJs).toContain('announceOnce(rh.textContent)');
    expect(extractBlock(chatJs, 'function paintArgueRoundHeader')).toContain('announce(rh.textContent)');
    expect(turnStart).toContain('class="article-live sr-only" aria-live="polite"');
    expect(chrome.canAnnounceArticle(1000, 2500)).toBe(false);
    expect(chrome.canAnnounceArticle(1000, 3000)).toBe(true);
    expect(chatJs).toContain('id="thread" class="thread" role="log" aria-live="off"');
  });

  it('consumes existing Swarm members only and does not reopen §20–§26 or Event Bus chrome', () => {
    expect(runState).toContain('arguePath');
    expect(runState).toContain('argueRound');
    expect(runState).toContain("'argue'");
    expect(proto).toContain("type: 'chat/turn-start'");
    expect(proto).toContain("type: 'chat/token'");
    expect(proto).toContain("type: 'chat/turn-end'");
    expect(proto).toContain("type: 'chat/stop'");
    expect(proto).toContain("type: 'run/state'; state: RunStateDto");
    expect(proto).toContain("type: 'chat/board'");
    expect(proto).toContain("type: 'changeset/preview'");
    expect(proto).not.toMatch(/type: 'event-bus|type: 'eventBus|type: 'bus\//);
    expect(chatJs).not.toMatch(/vscode\.lm/);
    expect(chatJs).not.toMatch(/Event Bus|packet id|packet row|subscriber list|inbox count/i);
    expect(chatCss).not.toMatch(/Event Bus|packet-row|packetId/i);
    expect(chatJs).not.toMatch(/idle follow|compare-to-spec|Graphify|token meter/i);
    expect(formJs).not.toMatch(/Graphify|Argue/);
    expect(pkg.contributes.viewsContainers.activitybar).toHaveLength(1);
    expect(pkg.contributes.views.botrider.map((v) => v.id)).toEqual([
      'botrider.bots',
      'botrider.chat',
      'botrider.contextMap',
      'botrider.review',
    ]);
    expect(chatJs).not.toContain('id="run-board-packets"');
    expect(chatJs).not.toMatch(/vote-chip|Pick a bot to decide Argue|host auto-pick/i);
  });
});
