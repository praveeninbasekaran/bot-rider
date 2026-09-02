import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COPY } from '../src/app/copy';

const root = join(__dirname, '..');
const formJs = readFileSync(join(root, 'media/bot-form.js'), 'utf8');
const formCss = readFileSync(join(root, 'media/bot-form.css'), 'utf8');
const panel = readFileSync(join(root, 'src/adapters/bot-form-panel.ts'), 'utf8');
const tree = readFileSync(join(root, 'src/adapters/bots-tree.ts'), 'utf8');
const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
const proto = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');

const SLOTS = ['agent', 'skills', 'scripts', 'instructions', 'prompts', 'hooks'] as const;
const HOST_MODELS = [
  { id: 'copilot/gpt-4.1', label: 'GPT 4.1' },
  { id: 'copilot/gpt-5', label: 'GPT 5' },
] as const;

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
  change() {
    for (const fn of this.handlers.change ?? []) fn({ preventDefault() {} });
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
    const el = new FakeEl(
      id === 'persona' || id === 'instructions'
        ? 'textarea'
        : id === 'model'
          ? 'select'
          : id === 'model-hint'
            ? 'span'
            : 'input',
    );
    el.id = id;
    if (id === 'active') el.checked = true;
    if (id === 'export-dirty-modal') el.hidden = true;
    if (id === 'attach-hint') {
      el.textContent = 'Open a folder to attach files.';
      el.hidden = true;
    }
    if (id.endsWith('-btn') && id.startsWith('attach-')) {
      el.textContent = 'Attach...';
    }
    if (id === 'model') el.disabled = true;
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
    fields: {
      get name() {
        return byId.get('name')!.value;
      },
      set name(v: string) {
        byId.get('name')!.value = v;
      },
      get handle() {
        return byId.get('handle')!.value;
      },
      set handle(v: string) {
        byId.get('handle')!.value = v;
      },
      get persona() {
        return byId.get('persona')!.value;
      },
      set persona(v: string) {
        byId.get('persona')!.value = v;
      },
      get role() {
        return byId.get('role')!.value;
      },
      set role(v: string) {
        byId.get('role')!.value = v;
      },
    },
    model: byId.get('model')!,
    modelHint: byId.get('model-hint')!,
    dispatch(data: unknown) {
      for (const fn of listeners.message ?? []) fn({ data });
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

const markup = formJs.slice(formJs.indexOf('form.innerHTML'), formJs.indexOf('const name ='));
const messageHandler = formJs.slice(
  formJs.indexOf("window.addEventListener('message'"),
  formJs.indexOf("vscode.postMessage({ type: 'form/ready' })"),
);

function lastCreate(posts: unknown[]) {
  return [...posts].reverse().find((m) => (m as { type?: string }).type === 'bots/create') as {
    draft?: { modelId?: string | null; modelLabel?: string };
  };
}

function lastUpdate(posts: unknown[]) {
  return [...posts].reverse().find((m) => (m as { type?: string }).type === 'bots/update') as {
    patch?: { modelId?: string | null; modelLabel?: string };
  };
}

describe('Bot form model chrome (§22)', () => {
  it('places native Model select after System instructions and before §20 slots and Active', () => {
    const instructionsAt = markup.indexOf('System instructions');
    const modelAt = markup.indexOf('>Model <select');
    const attachAt = markup.indexOf('class="attach-block"');
    const agentAt = markup.indexOf('>Agent</div>');
    const activeAt = markup.indexOf('Active in swarm');
    expect(instructionsAt).toBeGreaterThan(-1);
    expect(modelAt).toBeGreaterThan(instructionsAt);
    expect(attachAt).toBeGreaterThan(modelAt);
    expect(agentAt).toBeGreaterThan(attachAt);
    expect(activeAt).toBeGreaterThan(agentAt);
    expect(markup).toContain('id="model"');
    expect(markup).not.toMatch(/<select[^>]*required/);
    expect(markup).toContain(COPY.gettingCopilotModels);
    expect(formJs).toContain("getElementById('model')");
    expect(formCss).toContain('select:disabled');
    expect(formCss).toContain('.model-hint');
  });

  it('always paints Use extension default first, then host models[] id/label only', () => {
    expect(formJs).toContain(COPY.useExtensionDefault);
    expect(formJs).toContain('opt.value = entry.id');
    expect(formJs).toContain('opt.textContent = entry.label');
    expect(formJs).toContain("msg.type === 'bots/models'");
    expect(formJs).toContain('applyBotsModels(msg)');
    expect(markup).not.toMatch(/<option/);
    expect(formJs).not.toMatch(/vscode\.lm/);
    expect(formJs).not.toMatch(/selectChatModels/);
    expect(panel).toContain('watchFormModels');
    expect(panel).toContain('bot?.modelId');
    expect(proto).toContain("type: 'bots/models'");

    const ui = loadBotForm();
    expect(ui.model.children[0]?.value).toBe('');
    expect(ui.model.children[0]?.textContent).toBe(COPY.useExtensionDefault);
    expect(ui.model.children).toHaveLength(1);
    ui.dispatch({
      type: 'bots/models',
      models: HOST_MODELS,
      selectedId: null,
      status: 'ready',
    });
    expect(ui.model.children.map((c) => c.value)).toEqual(['', 'copilot/gpt-4.1', 'copilot/gpt-5']);
    expect(ui.model.children.map((c) => c.textContent)).toEqual([
      COPY.useExtensionDefault,
      'GPT 4.1',
      'GPT 5',
    ]);
    expect(ui.model.value).toBe('');
    expect(ui.model.disabled).toBe(false);
    expect(ui.modelHint.hidden).toBe(true);
  });

  it('loading disables the control on the default with Getting Copilot models…', () => {
    const ui = loadBotForm();
    expect(ui.model.disabled).toBe(true);
    expect(ui.model.value).toBe('');
    expect(ui.modelHint.textContent).toBe(COPY.gettingCopilotModels);
    expect(ui.modelHint.hidden).toBe(false);
    ui.dispatch({ type: 'bots/models', models: [], selectedId: null, status: 'loading' });
    expect(ui.model.disabled).toBe(true);
    expect(ui.model.value).toBe('');
    expect(ui.model.children[0]?.textContent).toBe(COPY.useExtensionDefault);
    expect(ui.modelHint.textContent).toBe(COPY.gettingCopilotModels);
  });

  it('unavailable / no models disables the control with Copilot sign-in copy', () => {
    expect(formJs).toContain(COPY.signInToPickModel);
    expect(formJs).not.toMatch(/botrider\.copilot\.recheck/);
    expect(formJs).not.toMatch(/empty-signin|id="recheck"/);
    const ui = loadBotForm();
    ui.dispatch({ type: 'bots/models', models: [], selectedId: null, status: 'unavailable' });
    expect(ui.model.disabled).toBe(true);
    expect(ui.model.value).toBe('');
    expect(ui.modelHint.textContent).toBe(COPY.signInToPickModel);
    expect(ui.modelHint.hidden).toBe(false);
    expect(ui.model.children.map((c) => c.value)).toEqual(['']);
  });

  it('saved id missing after refresh resets to default with exact helper copy', () => {
    expect(formJs).toContain(COPY.savedModelUnavailable);
    const ui = loadBotForm();
    ui.dispatch({
      type: 'form/load',
      workspaceEmpty: false,
      bot: {
        id: '1',
        name: 'Alpha',
        handle: 'alpha',
        persona: 'p',
        role: 'lead',
        instructions: 'i',
        modelId: 'copilot/gone',
      },
    });
    ui.dispatch({
      type: 'bots/models',
      models: HOST_MODELS,
      selectedId: null,
      status: 'ready',
    });
    expect(ui.model.disabled).toBe(false);
    expect(ui.model.value).toBe('');
    expect(ui.modelHint.textContent).toBe(COPY.savedModelUnavailable);
    expect(ui.modelHint.hidden).toBe(false);
    expect(ui.model.children[0]?.textContent).toBe(COPY.useExtensionDefault);
  });

  it('selects host selectedId when it is in models[]', () => {
    const ui = loadBotForm();
    ui.dispatch({
      type: 'form/load',
      workspaceEmpty: false,
      bot: {
        id: '1',
        name: 'Alpha',
        handle: 'alpha',
        persona: 'p',
        role: 'lead',
        instructions: 'i',
        modelId: 'copilot/gpt-5',
      },
    });
    ui.dispatch({
      type: 'bots/models',
      models: HOST_MODELS,
      selectedId: 'copilot/gpt-5',
      status: 'ready',
    });
    expect(ui.model.disabled).toBe(false);
    expect(ui.model.value).toBe('copilot/gpt-5');
    expect(ui.modelHint.hidden).toBe(true);
  });

  it('persists modelId id-only on create/update and empty as null', () => {
    const ui = loadBotForm();
    ui.dispatch({ type: 'form/load', workspaceEmpty: false, defaults: { persona: COPY.defaultNewBotPersona } });
    ui.dispatch({
      type: 'bots/models',
      models: HOST_MODELS,
      selectedId: null,
      status: 'ready',
    });
    ui.fillRequired();
    ui.save();
    expect(lastCreate(ui.posts).draft?.modelId).toBeNull();
    expect(lastCreate(ui.posts).draft).not.toHaveProperty('modelLabel');

    ui.model.value = 'copilot/gpt-4.1';
    ui.save();
    const picked = lastCreate(ui.posts);
    expect(picked.draft?.modelId).toBe('copilot/gpt-4.1');
    expect(JSON.stringify(picked)).not.toContain('GPT 4.1');
    expect(picked.draft).not.toHaveProperty('modelLabel');

    ui.dispatch({
      type: 'form/load',
      workspaceEmpty: false,
      bot: {
        id: '1',
        name: 'Alpha',
        handle: 'alpha',
        persona: 'p',
        role: 'lead',
        instructions: 'i',
        modelId: 'copilot/gpt-4.1',
      },
    });
    ui.dispatch({
      type: 'bots/models',
      models: HOST_MODELS,
      selectedId: 'copilot/gpt-4.1',
      status: 'ready',
    });
    ui.fillRequired();
    ui.fields.persona = 'p';
    ui.save();
    expect(lastUpdate(ui.posts).patch?.modelId).toBe('copilot/gpt-4.1');
    expect(lastUpdate(ui.posts).patch).not.toHaveProperty('modelLabel');
  });

  it('allows Save while disabled and persists unset', () => {
    const ui = loadBotForm();
    ui.dispatch({ type: 'form/load', workspaceEmpty: false, defaults: { persona: COPY.defaultNewBotPersona } });
    ui.dispatch({ type: 'bots/models', models: [], selectedId: null, status: 'loading' });
    ui.fillRequired();
    ui.save();
    expect(ui.model.disabled).toBe(true);
    expect(lastCreate(ui.posts).draft?.modelId).toBeNull();

    ui.dispatch({ type: 'bots/models', models: [], selectedId: null, status: 'unavailable' });
    ui.save();
    expect(ui.model.disabled).toBe(true);
    expect(lastCreate(ui.posts).draft?.modelId).toBeNull();
  });

  it('does not add a tree model subtitle or Swarm per-message picker', () => {
    expect(tree).toContain('bot.active ? bot.role : `${bot.role} · Inactive`');
    expect(tree).not.toMatch(/modelId/);
    expect(tree).not.toMatch(/model subtitle/i);
    expect(formJs).not.toMatch(/subtitle/);
    expect(chatJs).not.toMatch(/bots\/models/);
    expect(chatJs).not.toMatch(/Use extension default/);
    expect(chatJs).not.toMatch(/id="model"/);
    expect(formJs).not.toMatch(/vendor:\s*'openai'|anthropic|gemini/i);
  });

  it('stays chrome-only: no F7, leftovers, vscode.lm, or §20 reopen', () => {
    expect(formJs).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
    expect(formCss).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
    expect(formJs).not.toMatch(/F7 parallel|Event Bus|Graphify/i);
    expect(formJs).not.toMatch(/vscode\.lm|selectChatModels|sendRequest/);
    expect(formJs).toContain('class="attach-block"');
    expect(formJs).toContain("type: 'bots/attach-pick', slot: slot");
    expect(messageHandler).not.toMatch(/vscode\.lm/);
    expect(panel).not.toMatch(/sendRequest/);
  });
});
