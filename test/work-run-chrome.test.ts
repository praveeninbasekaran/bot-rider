import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COPY } from '../src/app/copy';
import { proposedFileChrome } from '../src/adapters/review-chrome';

const root = join(__dirname, '..');
const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
const chatCss = readFileSync(join(root, 'media/chat.css'), 'utf8');
const formJs = readFileSync(join(root, 'media/bot-form.js'), 'utf8');
const formCss = readFileSync(join(root, 'media/bot-form.css'), 'utf8');
const proto = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');
const sidebar = readFileSync(join(root, 'src/adapters/chat-view.ts'), 'utf8');
const expand = readFileSync(join(root, 'src/adapters/chat-expand-panel.ts'), 'utf8');
const reviewChrome = readFileSync(join(root, 'src/adapters/review-chrome.ts'), 'utf8');
const reviewTree = readFileSync(join(root, 'src/adapters/review-tree.ts'), 'utf8');
const tree = readFileSync(join(root, 'src/adapters/bots-tree.ts'), 'utf8');
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
   ${extractBlock(chatJs, 'function shouldShowInFlightChips')};
   ${extractBlock(chatJs, 'function canAnnounceArticle')};
   return { isDebateTurn, isWorkTurn, shouldShowInFlightChips, canAnnounceArticle };`,
)() as {
  isDebateTurn: (turn: string) => boolean;
  isWorkTurn: (turn: string) => boolean;
  shouldShowInFlightChips: (handles: string[]) => boolean;
  canAnnounceArticle: (lastAt: number, now: number) => boolean;
};

const lockFn = chatJs.slice(chatJs.indexOf('function lockComposer'), chatJs.indexOf('function renderCopilot'));
const sendNowFn = chatJs.slice(chatJs.indexOf('function sendNow'), chatJs.indexOf('function esc'));
const onSendFn = chatJs.slice(chatJs.indexOf('function onSendOrStop'), chatJs.indexOf('function onKey'));
const pickerFn = chatJs.slice(chatJs.indexOf('function renderPicker'), chatJs.indexOf('function insertHandle'));
const chipsFn = chatJs.slice(chatJs.indexOf('function renderInFlightChips'), chatJs.indexOf('function paintBoard'));
const waitFn = extractBlock(chatJs, 'function renderWaitingChips');
const overflowFn = chatJs.slice(chatJs.indexOf('function paintPackOverflow'), chatJs.indexOf('function reduceMotion'));
const showSplitFn = chatJs.slice(chatJs.indexOf('function showSplit'), chatJs.indexOf('function hideSplit'));
const showFilesFn = extractBlock(chatJs, 'function showFiles');
const turnStart = chatJs.slice(chatJs.indexOf("msg.type === 'chat/turn-start'"), chatJs.indexOf("msg.type === 'chat/token'"));
const tokenHandler = chatJs.slice(chatJs.indexOf("msg.type === 'chat/token'"), chatJs.indexOf("msg.type === 'chat/mcp-read-start'"));
const formMarkup = formJs.slice(formJs.indexOf('form.innerHTML'), formJs.indexOf('const name ='));
const persistFn = extractBlock(formJs, 'function collectPersistDraft');
const exportFn = extractBlock(formJs, 'function collectExportDraft');
const validateFn = extractBlock(formJs, 'function validate');

const SLOTS = ['agent', 'skills', 'scripts', 'instructions', 'prompts', 'hooks'] as const;

class FakeEl {
  id = '';
  value = '';
  hidden = false;
  disabled = false;
  checked = false;
  className = '';
  type = '';
  children: FakeEl[] = [];
  attrs: Record<string, string> = {};
  handlers: Record<string, ((ev?: { preventDefault(): void }) => void)[]> = {};
  private _text = '';
  constructor(readonly tagName = 'div') {}
  get textContent() {
    return this._text;
  }
  set textContent(value: string) {
    this._text = value;
    this.children = [];
  }
  appendChild(child: FakeEl) {
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, fn: (ev?: { preventDefault(): void }) => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
  remove() {
    this.textContent = '';
  }
  click() {
    for (const fn of this.handlers.click ?? []) fn({ preventDefault() {} });
  }
  submit() {
    for (const fn of this.handlers.submit ?? []) fn({ preventDefault() {} });
  }
}

function loadBotForm() {
  const posts: unknown[] = [];
  const byId = new Map<string, FakeEl>();
  const listeners: Record<string, ((ev: { data?: unknown }) => void)[]> = {};
  const form = new FakeEl('form');
  form.id = 'bot-form';
  byId.set('bot-form', form);
  const ids = [
    'name',
    'handle',
    'persona',
    'role',
    'instructions',
    'model',
    'model-hint',
    'active',
    'dispatcher',
    'spec',
    'err',
    'delete-btn',
    'cancel',
    'export-btn',
    'export-dirty-modal',
    'export-dirty-save',
    'export-dirty-without',
    'export-dirty-cancel',
    'attach-hint',
    'attach-skips',
    'attach-untyped-list',
    ...SLOTS.flatMap((slot) => [`attach-${slot}-btn`, `attach-${slot}-list`]),
  ];
  for (const id of ids) {
    const el = new FakeEl(id === 'persona' || id === 'instructions' ? 'textarea' : id === 'model' ? 'select' : 'input');
    el.id = id;
    if (id === 'active') el.checked = true;
    if (id === 'dispatcher' || id === 'spec') el.checked = false;
    if (id === 'export-dirty-modal' || id === 'attach-hint') el.hidden = true;
    byId.set(id, el);
  }
  const document = {
    getElementById(id: string) {
      return byId.get(id) ?? null;
    },
    createElement(tag: string) {
      return new FakeEl(tag);
    },
    body: {
      appendChild(el: FakeEl) {
        if (el.id) byId.set(el.id, el);
        return el;
      },
    },
  };
  const window = {
    addEventListener(type: string, fn: (ev: { data?: unknown }) => void) {
      (listeners[type] ??= []).push(fn);
    },
  };
  const fn = new Function(
    'document',
    'window',
    'acquireVsCodeApi',
    formJs.replace(/^\s*\(function \(\) \{/, '').replace(/\}\)\(\);\s*$/, ''),
  );
  fn(document, window, () => ({
    postMessage(msg: unknown) {
      posts.push(msg);
    },
  }));
  return {
    posts,
    form,
    dispatcher: byId.get('dispatcher')!,
    spec: byId.get('spec')!,
    saveBtn: form,
    dispatch(data: unknown) {
      for (const listener of listeners.message ?? []) listener({ data });
    },
    fillRequired() {
      byId.get('name')!.value = 'Alpha';
      byId.get('handle')!.value = 'alpha';
      byId.get('persona')!.value = 'A person';
      byId.get('role')!.value = 'lead';
    },
    save() {
      form.submit();
    },
  };
}

describe('§27 F8a Work run chrome', () => {
  it('defaults the Work | Debate toggle to Debate and Send follows it', () => {
    expect(chatJs).toContain("runType: 'debate'");
    expect(chatJs).toContain('id="run-type"');
    expect(chatJs).toContain('data-run-type="work">Work<');
    expect(chatJs).toContain('data-run-type="debate">Debate<');
    expect(chatJs).toContain('aria-label="Debate"');
    expect(chatJs).toContain("state.runType === 'work' ? 'work' : 'debate'");
    expect(sendNowFn).toContain('const runType = selectedRunType()');
    expect(sendNowFn).toContain("vscode.postMessage({ type: 'chat/send', text: input.value, runType: runType })");
    expect(onSendFn).toContain('state.debateRunning && !state.workBatch');
    expect(chatJs).not.toMatch(/localStorage|sessionStorage|setState\s*\(/);
    expect(sidebar).toContain("scriptFile: 'chat.js'");
    expect(expand).toContain("scriptFile: 'chat.js'");
    expect(expand).toContain("viewType = 'botrider.chatPanel'");
    expect(extractBlock(chatJs, 'function selectedRunType')).toContain("state.runType === 'work' ? 'work' : 'debate'");
    expect(extractBlock(chatJs, 'function paintRunType')).toContain("workOn ? 'Work' : 'Debate'");
  });

  it('places optional Dispatcher and Spec after Active and Save is not the gate', () => {
    const activeAt = formMarkup.indexOf('Active in swarm');
    const dispatcherAt = formMarkup.indexOf('id="dispatcher"');
    const specAt = formMarkup.indexOf('id="spec"');
    const errAt = formMarkup.indexOf('id="err"');
    expect(activeAt).toBeGreaterThan(-1);
    expect(dispatcherAt).toBeGreaterThan(activeAt);
    expect(specAt).toBeGreaterThan(dispatcherAt);
    expect(errAt).toBeGreaterThan(specAt);
    expect(formMarkup).toContain('> Dispatcher</label>');
    expect(formMarkup).toContain('> Spec</label>');
    expect(formMarkup).toMatch(/<button type="submit">Save<\/button>/);
    expect(formMarkup).not.toMatch(/id="dispatcher"[^>]*disabled/);
    expect(formMarkup).not.toMatch(/id="spec"[^>]*disabled/);
    expect(validateFn).not.toMatch(/dispatcher|spec/);
    expect(formJs).not.toMatch(/submit\.disabled|save\.disabled|getElementById\('save'\)/);
    expect(persistFn).toContain('dispatcher: !!dispatcher.checked');
    expect(persistFn).toContain('spec: !!spec.checked');
    expect(formJs).toContain('dispatcher: draft.dispatcher');
    expect(formJs).toContain('spec: draft.spec');
    expect(formJs).toContain('type: \'bots/create\'');
    expect(formJs).toContain('type: \'bots/update\'');
    expect(formJs).toContain('dispatcher.checked = !!bot.dispatcher');
    expect(formJs).toContain('spec.checked = !!bot.spec');
    expect(exportFn).not.toMatch(/dispatcher|spec/);
    expect(formJs).not.toMatch(/Dev1|Dev2|tester|name-contains|includes\('BA'\)|\/BA\//);
    expect(tree).not.toMatch(/Dev1|Dev2|tester|Dispatcher|Spec/);
    expect(formCss).toContain('.row');

    const none = loadBotForm();
    none.fillRequired();
    none.save();
    const createdNone = none.posts.find((m) => (m as { type?: string }).type === 'bots/create') as {
      draft?: { dispatcher?: boolean; spec?: boolean };
    };
    expect(createdNone.draft?.dispatcher).toBe(false);
    expect(createdNone.draft?.spec).toBe(false);

    const both = loadBotForm();
    both.fillRequired();
    both.dispatcher.checked = true;
    both.spec.checked = true;
    both.save();
    const createdBoth = both.posts.find((m) => (m as { type?: string }).type === 'bots/create') as {
      draft?: { dispatcher?: boolean; spec?: boolean };
    };
    expect(createdBoth.draft?.dispatcher).toBe(true);
    expect(createdBoth.draft?.spec).toBe(true);

    const edit = loadBotForm();
    edit.dispatch({
      type: 'form/load',
      bots: [],
      bot: {
        id: 'b1',
        name: 'Alpha',
        handle: 'alpha',
        persona: 'A person',
        role: 'lead',
        instructions: '',
        active: true,
        dispatcher: true,
        spec: false,
      },
    });
    expect(edit.dispatcher.checked).toBe(true);
    expect(edit.spec.checked).toBe(false);
    edit.spec.checked = true;
    edit.save();
    const updated = edit.posts.find((m) => (m as { type?: string }).type === 'bots/update') as {
      patch?: { dispatcher?: boolean; spec?: boolean };
    };
    expect(updated.patch?.dispatcher).toBe(true);
    expect(updated.patch?.spec).toBe(true);
  });

  it('paints the Work gate copy exactly and does not fall through to Debate', () => {
    expect(chatJs).toContain('Work needs one Dispatcher and one Spec.');
    expect(chatJs).toContain("msg.code === 'work-gate'");
    expect(chatJs).toContain("msg.code === 'work-running'");
    expect(chatJs).toContain('Work batch still running.');
    expect(COPY.workNeedsRoles).toBe('Work needs one Dispatcher and one Spec.');
    expect(COPY.workBatchRunning).toBe('Work batch still running.');
    const errorFn = chatJs.slice(chatJs.indexOf("msg.type === 'error'"), chatJs.indexOf("msg.type === 'changeset/apply-failed'"));
    expect(errorFn).toContain("el.setAttribute('aria-live', 'polite')");
    expect(errorFn).toContain('announceOnce');
    expect(errorFn).not.toMatch(/modal|form\/error|runType = 'debate'/);
    expect(sendNowFn).not.toContain("runType: 'debate'");
    expect(chatJs).not.toContain('silent Debate');
  });

  it('unlocks the composer during Work-batch and keeps §26 Debate lock', () => {
    expect(lockFn).toContain('const deliverableAsk = !!(state.run && state.run.deliverableAsk)');
    expect(lockFn).toContain('!!state.splitOpen || (!!state.debateRunning && !deliverableAsk)');
    expect(lockFn).toContain('state.workBatch && ready && !state.splitOpen');
    expect(lockFn).toContain("send.textContent = 'Send'");
    expect(lockFn).toContain('input.disabled = false');
    expect(lockFn).toContain('workStop.hidden = false');
    expect(lockFn).toContain("'Debate running…'");
    expect(sendNowFn).toContain('state.splitOpen || state.debateRunning');
    expect(sendNowFn).toContain('state.debateRunning && !state.workBatch');
    expect(pickerFn).toContain('state.splitOpen || state.debateRunning && !state.workBatch');
    expect(pickerFn).not.toMatch(/worker-assign|assign-widget|role picker/);
    expect(chatJs).not.toContain('id="worker-assign"');
  });

  it('shows distinct static in-flight and waiting chips as @{handle}', () => {
    expect(chrome.isWorkTurn('spec')).toBe(true);
    expect(chrome.isWorkTurn('dispatch')).toBe(true);
    expect(chrome.isWorkTurn('work')).toBe(true);
    expect(chrome.isWorkTurn('propose')).toBe(false);
    expect(chrome.isDebateTurn('propose')).toBe(true);
    expect(chrome.isDebateTurn('work')).toBe(false);
    expect(chrome.shouldShowInFlightChips(['alpha', 'beta'])).toBe(true);
    expect(chatJs).toContain('function workInFlightHandles');
    expect(chatJs).toContain('function waitingHandles');
    expect(chatJs).toContain("state.run.runType !== 'work'");
    expect(chipsFn).toContain("label.textContent = '@' + handles[i]");
    expect(chipsFn).toContain("glyph.textContent = '\\u25cf'");
    expect(chipsFn).toContain("glyph.setAttribute('aria-hidden', 'true')");
    expect(chipsFn).toContain('e.preventDefault()');
    expect(chipsFn).not.toContain('postMessage');
    expect(waitFn).toContain("className = 'run-board-waiting-chip'");
    expect(waitFn).toContain("glyph.textContent = '\\u25cb'");
    expect(waitFn).toContain("label.textContent = '@' + handles[i]");
    expect(waitFn).toContain('e.preventDefault()');
    expect(waitFn).not.toContain('postMessage');
    expect(chipsFn + waitFn).not.toMatch(/packet|Event Bus|path list|chase/i);
    expect(chatCss).toMatch(/\.run-board-inflight-chip\s*\{[^}]*animation:\s*none/s);
    expect(chatCss).toMatch(/\.run-board-waiting-chip\s*\{[^}]*animation:\s*none/s);
    expect(chatJs).not.toContain("type: 'changeset/approve'");
    expect(chipsFn).not.toContain('mcp/actions');
    expect(chipsFn).not.toContain('OpenSpec');
    expect(chatJs).not.toContain('id="run-board-packets"');
  });

  it('keeps one Files list from changeset/preview, collision notes, and Approve off until settle', () => {
    expect(showFilesFn).toContain('state.previewFiles = files || []');
    expect(showFilesFn).toContain("Proposed changes · '");
    expect(showFilesFn).not.toMatch(/collision|workerFiles|N Approve/);
    expect(chatJs).toContain("msg.type === 'changeset/preview'");
    expect(chatJs).toContain('showFiles(msg.files || [])');
    expect(chatJs).toContain(' · collision');
    expect(chatJs).toContain('/ · collision$/');
    expect(COPY.skippedCollision('src/a.ts')).toBe('Skipped src/a.ts · collision');
    expect(chatJs).toContain('announceOnce');
    expect(chatJs).not.toContain("type: 'changeset/approve'");
    expect(chatJs).not.toContain("type: 'mcp/actions-approve'");
    expect(reviewTree).toContain("sectionItem('Files', 'filesSection', 'reviewFilesSection')");
    expect(reviewTree).toContain("sectionItem('MCP actions', 'mcpSection', 'reviewMcpSection')");
    expect(reviewChrome).toContain('specIds');
    expect(proposedFileChrome({ path: 'src/a.ts', op: 'create', specIds: ['BR-6'] }).description).toContain('BR-6');
    expect(chatJs).not.toMatch(/specIds|OpenSpec chip/);
  });

  it('lets Work-batch HV overlap without merging bubbles', () => {
    expect(chatJs).toContain('flights: {}');
    expect(chatJs).toContain('function flightFor(botId)');
    expect(turnStart).toContain('state.flights[msg.botId] = flight');
    expect(turnStart).toContain('isWorkTurn(msg.turn)');
    expect(tokenHandler).toContain('const current = flightFor(msg.botId)');
    expect(chatJs).not.toMatch(/mergeBubbles|merge-bubbles|combineArticles/);
    expect(chrome.isWorkTurn('spec')).toBe(true);
    expect(chrome.isDebateTurn('spec')).toBe(false);
  });

  it('Stop posts chat/stop only and pack-overflow stays QC-3 without Event Bus chrome', () => {
    expect(onSendFn).toContain("vscode.postMessage({ type: 'chat/stop' })");
    expect(showSplitFn).toContain("vscode.postMessage({ type: 'chat/stop' })");
    expect(chatJs).toContain("type: 'chat/stop'");
    expect(chatJs).not.toContain("type: 'split/stop'");
    expect(chatJs).not.toContain('stop-one');
    expect(chatJs).not.toContain("type: 'work/stop'");
    expect(overflowFn).toContain("className = 'error system'");
    expect(chatJs).toContain("Prompt doesn't fit Copilot");
    expect(overflowFn).toContain('message || PACK_OVERFLOW_COPY');
    expect(overflowFn).not.toMatch(/Event Bus|packet id|inbox|subscriber/i);
    expect(overflowFn).not.toContain('lockComposer()');
    expect(chrome.canAnnounceArticle(1000, 2500)).toBe(false);
    expect(chrome.canAnnounceArticle(1000, 3000)).toBe(true);
    expect(turnStart).toContain('class="article-live sr-only" aria-live="polite"');
  });

  it('consumes existing Swarm members only and does not reopen §20–§26 or Event Bus chrome', () => {
    expect(proto).toContain("type: 'chat/send'; text: string; runType?: 'work' | 'debate'");
    expect(proto).toContain("type: 'chat/stop'");
    expect(proto).toContain("type: 'run/state'; state: RunStateDto");
    expect(proto).toContain("type: 'chat/board'; board: RunBoardDto");
    expect(proto).toContain("type: 'changeset/preview'");
    expect(proto).toContain("type: 'bots/snapshot'");
    expect(proto).not.toMatch(/type: 'event-bus|type: 'eventBus|type: 'bus\//);
    expect(chatJs).toContain("msg.type === 'run/state'");
    expect(chatJs).toContain("msg.type === 'chat/board'");
    expect(chatJs).toContain("msg.type === 'bots/snapshot'");
    expect(chatJs).not.toMatch(/vscode\.lm/);
    expect(chatJs).not.toMatch(/Event Bus|packet id|packet row|subscriber list|inbox count/i);
    expect(chatCss).not.toMatch(/Event Bus|packet-row|packetId/i);
    expect(formJs).not.toMatch(/vscode\.lm/);
    expect(pkg.contributes.viewsContainers.activitybar).toHaveLength(1);
    expect(pkg.contributes.views.botrider.map((v) => v.id)).toEqual([
      'botrider.bots',
      'botrider.chat',
      'botrider.contextMap',
      'botrider.review',
    ]);
    expect(chatJs).not.toMatch(/Argue|idle follow|compare-to-spec|Graphify/);
    expect(formJs).not.toMatch(/Argue|Graphify/);
    expect(lockFn).toContain("'Debate running…'");
    expect(chatJs).toContain("placeholder=\"Message the swarm. Use @handle to lock a bot.\"");
    expect(formMarkup).toContain('id="attach-agent-btn"');
    expect(formMarkup).toContain('id="model"');
    expect(formMarkup).toContain('id="export-btn"');
  });
});
