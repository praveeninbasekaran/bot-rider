import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
const chatCss = readFileSync(join(root, 'media/chat.css'), 'utf8');
const proto = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');
const sidebar = readFileSync(join(root, 'src/adapters/chat-view.ts'), 'utf8');
const expand = readFileSync(join(root, 'src/adapters/chat-expand-panel.ts'), 'utf8');

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
   ${extractBlock(chatJs, 'function roundHeaderCopy')};
   ${extractBlock(chatJs, 'function shouldShowInFlightChips')};
   ${extractBlock(chatJs, 'function canAnnounceArticle')};
   return { isDebateTurn, roundHeaderCopy, shouldShowInFlightChips, canAnnounceArticle };`,
)() as {
  isDebateTurn: (turn: string) => boolean;
  roundHeaderCopy: (n: number, turn: string) => string;
  shouldShowInFlightChips: (handles: string[]) => boolean;
  canAnnounceArticle: (lastAt: number, now: number) => boolean;
};

const turnStart = chatJs.slice(chatJs.indexOf("msg.type === 'chat/turn-start'"), chatJs.indexOf("msg.type === 'chat/token'"));
const tokenHandler = chatJs.slice(chatJs.indexOf("msg.type === 'chat/token'"), chatJs.indexOf("msg.type === 'chat/mcp-read-start'"));
const turnEnd = chatJs.slice(chatJs.indexOf("msg.type === 'chat/turn-end'"), chatJs.indexOf("msg.type === 'chat/split'"));
const overflowFn = chatJs.slice(chatJs.indexOf('function paintPackOverflow'), chatJs.indexOf('function reduceMotion'));
const lockFn = chatJs.slice(chatJs.indexOf('function lockComposer'), chatJs.indexOf('function renderCopilot'));
const sendNowFn = chatJs.slice(chatJs.indexOf('function sendNow'), chatJs.indexOf('function esc'));
const onSendFn = chatJs.slice(chatJs.indexOf('function onSendOrStop'), chatJs.indexOf('function onKey'));
const showSplitFn = chatJs.slice(chatJs.indexOf('function showSplit'), chatJs.indexOf('function hideSplit'));
const phaseFn = chatJs.slice(chatJs.indexOf('function maybePhaseHeader'), chatJs.indexOf('function showSplit'));
const chipsFn = chatJs.slice(chatJs.indexOf('function renderInFlightChips'), chatJs.indexOf('function paintBoard'));
const markFn = chatJs.slice(chatJs.indexOf('function markInterrupted'), chatJs.indexOf('function closePicker'));

describe('§26 F7 parallel Debate stream chrome', () => {
  it('shares Swarm sidebar + Expand and keeps one article per bot bubble', () => {
    expect(sidebar).toContain("scriptFile: 'chat.js'");
    expect(sidebar).toContain("styleFile: 'chat.css'");
    expect(expand).toContain("scriptFile: 'chat.js'");
    expect(expand).toContain("styleFile: 'chat.css'");
    expect(expand).toContain("viewType = 'botrider.chatPanel'");
    expect(turnStart).toContain("el.className = 'msg'");
    expect(turnStart).toContain("class=\"handle\">@'");
    expect(turnStart).toContain('avatarSvg(msg.name, msg.colorIndex)');
    expect(turnStart).toContain('state.flights[msg.botId] = flight');
    expect(turnStart).toContain('state.current = flight');
    expect(turnStart).not.toContain('README');
    expect(chatJs).not.toMatch(/mergeBubbles|merge-bubbles|restyle.*README/i);
  });

  it('paints overlapping HV from outstanding turn-start keyed by bot', () => {
    expect(chatJs).toContain('flights: {}');
    expect(chatJs).toContain('function flightFor(botId)');
    expect(tokenHandler).toContain('const current = flightFor(msg.botId)');
    expect(tokenHandler).toContain("current.stream.appendChild(document.createTextNode(msg.delta || ''))");
    expect(turnEnd).toContain('const current = flightFor(msg.botId)');
    expect(turnEnd).toContain('paintArticle(current.body, msg.text)');
    expect(turnEnd).toContain('dropFlight(msg.botId');
    expect(turnStart).toContain("msg.turn === 'implement' || msg.turn === 'consensus'");
    expect(turnStart).toContain('return;');
  });

  it('uses exact ROUND n · PROPOSE then CRITIQUE after propose settled', () => {
    expect(chrome.roundHeaderCopy(1, 'propose')).toBe('ROUND 1 · PROPOSE');
    expect(chrome.roundHeaderCopy(2, 'critique')).toBe('ROUND 2 · CRITIQUE');
    expect(chrome.roundHeaderCopy(1, 'direct')).toBe('');
    expect(phaseFn).toContain('roundHeaderCopy(n, turn)');
    expect(phaseFn).toContain("turn === 'critique' && prev");
    expect(phaseFn).toContain('announce(rh.textContent)');
    expect(phaseFn).not.toMatch(/PARALLEL/);
    expect(chatJs).not.toMatch(/ROUND \{?n\}? · PARALLEL/);
    expect(chatJs).not.toMatch(/ROUND ' \+ n \+ ' · PARALLEL/);
  });

  it('does not paint overlap chrome on @ / vote / Split / implementer', () => {
    expect(chrome.isDebateTurn('propose')).toBe(true);
    expect(chrome.isDebateTurn('critique')).toBe(true);
    expect(chrome.isDebateTurn('direct')).toBe(false);
    expect(chrome.isDebateTurn('consensus')).toBe(false);
    expect(chrome.isDebateTurn('implement')).toBe(false);
    expect(turnStart).toContain("msg.turn === 'implement' || msg.turn === 'consensus'");
    const handlesFn = extractBlock(chatJs, 'function debateInFlightHandles');
    expect(handlesFn).toContain('isDebateTurn(flight.turn)');
    expect(phaseFn).toContain("turn === 'direct'");
    expect(phaseFn).toContain("'SOLO · @'");
  });

  it('lists multiple static in-flight chips as @{handle} and treats click as a no-op', () => {
    expect(chrome.shouldShowInFlightChips(['alpha', 'beta'])).toBe(true);
    expect(chrome.shouldShowInFlightChips(['alpha'])).toBe(false);
    expect(chrome.shouldShowInFlightChips([])).toBe(false);
    expect(chipsFn).toContain("label.textContent = '@' + handles[i]");
    expect(chipsFn).toContain("glyph.textContent = '\\u25cf'");
    expect(chipsFn).toContain("glyph.setAttribute('aria-hidden', 'true')");
    expect(chipsFn).toContain('e.preventDefault()');
    expect(chipsFn).not.toContain('postMessage');
    expect(chipsFn).not.toContain('msg.name');
    expect(chipsFn).not.toContain('displayName');
    expect(chipsFn).not.toMatch(/packet|token text|chase/i);
    expect(chatCss).toMatch(/\.run-board-inflight-chip\s*\{[^}]*animation:\s*none/s);
    expect(chatCss).toMatch(/\.run-board-inflight-glyph\s*\{[^}]*animation:\s*none/s);
    expect(chatJs).not.toContain('changeset/approve');
    expect(chipsFn).not.toContain('mcp/actions');
    expect(chipsFn).not.toContain('OpenSpec');
  });

  it('locks the composer until the Debate batch settles and ignores Send', () => {
    expect(lockFn).toContain('const deliverableAsk = !!(state.run && state.run.deliverableAsk)');
    expect(lockFn).toContain('!!state.splitOpen || (!!state.debateRunning && !deliverableAsk)');
    expect(sendNowFn).toContain('state.splitOpen || state.debateRunning');
    expect(overflowFn).not.toContain('debateRunning = false');
    expect(overflowFn).not.toContain('lockComposer()');
    expect(overflowFn).not.toContain('input.disabled');
  });

  it('Stop posts chat/stop only and card Stop aborts all in-flight', () => {
    expect(onSendFn).toContain("vscode.postMessage({ type: 'chat/stop' })");
    expect(showSplitFn).toContain("vscode.postMessage({ type: 'chat/stop' })");
    expect(showSplitFn).toContain('split-stop');
    expect(chatJs).not.toContain("type: 'split/stop'");
    expect(lockFn).toContain("'Resolve the split to send a new prompt.'");
    expect(markFn).toContain('state.flights');
    expect(markFn).toContain("note.textContent = 'Interrupted'");
    expect(markFn).toContain('state.flights = {}');
  });

  it('paints pack-overflow with exact QC-3 copy on that bot and no bus chrome', () => {
    expect(chatJs).toContain("Prompt doesn't fit Copilot");
    expect(chatJs).toContain("The minimum context for this turn is larger than Copilot's window.");
    expect(chatJs).toContain('Required context was not dropped.');
    expect(overflowFn).toContain("className = 'error system'");
    expect(overflowFn).toContain("el.setAttribute('aria-live', 'polite')");
    expect(overflowFn).not.toMatch(/Event Bus|packet id|inbox|subscriber/i);
    expect(overflowFn).not.toContain('lockComposer()');
  });

  it('uses per-article live regions and throttles to one announce per 2s per article', () => {
    expect(chrome.canAnnounceArticle(0, 100)).toBe(true);
    expect(chrome.canAnnounceArticle(1000, 2500)).toBe(false);
    expect(chrome.canAnnounceArticle(1000, 3000)).toBe(true);
    expect(turnStart).toContain('class="article-live sr-only" aria-live="polite"');
    expect(tokenHandler).toContain('announceArticle(current,');
    expect(tokenHandler).not.toMatch(/\bannounce\(/);
    expect(chatJs).toContain('id="thread" class="thread" role="log" aria-live="off"');
    expect(phaseFn).toContain('announce(rh.textContent)');
  });

  it('consumes existing Swarm members only and never paints Event Bus or packets', () => {
    expect(proto).toContain("type: 'chat/turn-start'");
    expect(proto).toContain("type: 'chat/token'");
    expect(proto).toContain("type: 'chat/turn-end'");
    expect(proto).toContain("type: 'chat/stop'");
    expect(proto).toContain("type: 'run/state'");
    expect(proto).toContain("type: 'chat/board'");
    expect(chatJs).not.toMatch(/vscode\.lm/);
    expect(chatJs).not.toMatch(/Event Bus|packet id|packet row|subscriber list|inbox count/i);
    expect(chatJs).not.toMatch(/Graphify|F8|Activity Bar/i);
    expect(chatCss).not.toMatch(/Event Bus|packet-row|packetId/i);
    expect(chatJs).not.toContain("type: 'changeset/approve'");
    expect(chatJs).not.toContain("type: 'mcp/actions-approve'");
  });
});
