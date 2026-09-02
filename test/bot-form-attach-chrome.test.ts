import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COPY } from '../src/app/copy';

const root = join(__dirname, '..');
const formJs = readFileSync(join(root, 'media/bot-form.js'), 'utf8');
const formCss = readFileSync(join(root, 'media/bot-form.css'), 'utf8');
const panel = readFileSync(join(root, 'src/adapters/bot-form-panel.ts'), 'utf8');
const proto = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');

const SLOTS = ['agent', 'skills', 'scripts', 'instructions', 'prompts', 'hooks'] as const;
const SLOT_LABELS = ['Agent', 'Skills', 'Scripts', 'Instructions', 'Prompts', 'Hooks'] as const;

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
    slotBtn(slot: string) {
      return byId.get(`attach-${slot}-btn`)!;
    },
    slotList(slot: string) {
      return byId.get(`attach-${slot}-list`)!;
    },
    attachHint: byId.get('attach-hint')!,
    attachSkips: byId.get('attach-skips')!,
    attachUntyped: byId.get('attach-untyped-list')!,
    dispatch(data: unknown) {
      for (const fn of listeners.message ?? []) fn({ data });
    },
    save() {
      form.submit();
    },
  };
}

const markup = formJs.slice(formJs.indexOf('form.innerHTML'), formJs.indexOf('const name ='));
const mappedFn = formJs.slice(formJs.indexOf('function applyMapped'), formJs.indexOf('function setNoFolder'));
const emptyFn = formJs.slice(formJs.indexOf('function fieldIsEmpty'), formJs.indexOf('function applyMapped'));
const skipFn = formJs.slice(formJs.indexOf('function skipCopy'), formJs.indexOf('function formAttachments'));
const messageHandler = formJs.slice(
  formJs.indexOf("window.addEventListener('message'"),
  formJs.indexOf("vscode.postMessage({ type: 'form/ready' })"),
);

describe('Bot form attachment chrome (§20)', () => {
  it('places six labeled slot lists after System instructions and before Active', () => {
    const instructionsAt = markup.indexOf('System instructions');
    const activeAt = markup.indexOf('Active in swarm');
    expect(instructionsAt).toBeGreaterThan(-1);
    expect(activeAt).toBeGreaterThan(instructionsAt);
    let cursor = instructionsAt;
    for (const label of SLOT_LABELS) {
      const at = markup.indexOf(`>${label}</div>`, cursor);
      expect(at, label).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(cursor).toBeLessThan(activeAt);
    expect(markup).not.toContain('Attached files');
    expect(markup).not.toContain('id="attach-btn"');
    expect(formJs).not.toMatch(/getElementById\('attach-btn'\)/);
    for (const slot of SLOTS) {
      expect(markup).toContain(`data-slot="${slot}"`);
      expect(markup).toContain(`id="attach-${slot}-btn"`);
      expect(markup).toContain(`id="attach-${slot}-list"`);
    }
    expect(markup).toContain('Open a folder to attach files.');
    expect(formJs).toContain("type: 'bots/attach-pick', slot: slot");
  });

  it('labels picker filters and uses Replace... only on a filled Agent slot', () => {
    expect(formJs).toContain('Markdown / text');
    expect(formJs).toContain('Markdown / text plus .py .js .ts .sh .bash .zsh .ps1');
    expect(formJs).toContain("textContent = files.length ? 'Replace...' : 'Attach...'");
    expect(formJs).toContain("if (slot === 'agent')");
    const ui = loadBotForm();
    ui.dispatch({ type: 'form/load', workspaceEmpty: false, defaults: { persona: COPY.defaultNewBotPersona } });
    expect(ui.slotBtn('agent').textContent).toBe('Attach...');
    ui.dispatch({
      type: 'bots/attach-added',
      slot: 'agent',
      files: [{ path: 'docs/AGENTS.md', name: 'AGENTS.md' }],
    });
    expect(ui.slotBtn('agent').textContent).toBe('Replace...');
    expect(ui.slotList('agent').children).toHaveLength(1);
    ui.slotList('agent').children[0]!.children[1]!.click();
    expect(ui.slotList('agent').children).toHaveLength(0);
    expect(ui.slotBtn('agent').textContent).toBe('Attach...');
  });

  it('renders {name} · {path} labels and Remove posts bots/attach-remove with slot', () => {
    expect(formJs).toContain("file.name + ' · ' + file.path");
    expect(formJs).toContain("type: 'bots/attach-remove', slot: slot, path: file.path");
    expect(formJs).toContain("aria-label', 'Remove'");
    expect(formJs).not.toMatch(/attach-row[\s\S]{0,200}createElement\('a'\)/);
    expect(formJs).not.toMatch(/href\s*=\s*['"]file:/);
    expect(formCss).toContain('.attach-row');
    expect(formCss).toContain('.icon-close');
    expect(formCss).toContain('.attach-slot');
    expect(formCss).toContain('button.attach-pick:disabled');
  });

  it('treats New Bot default/placeholder persona as empty for attach-mapped', () => {
    expect(emptyFn).toContain('if (editingId) return false');
    expect(emptyFn).toContain('text === ph');
    expect(formJs).toContain(COPY.defaultNewBotPersona);
    expect(formJs).toContain('placeholders.persona');
    expect(formJs).toContain('placeholders.name');
    expect(formJs).toContain('placeholders.handle');
    expect(mappedFn).toContain('fieldIsEmpty(name.value, placeholders.name)');
    expect(mappedFn).toContain('fieldIsEmpty(handle.value, placeholders.handle)');
    expect(mappedFn).toContain('fieldIsEmpty(persona.value, placeholders.persona)');
    expect(mappedFn).not.toMatch(/role/);
    expect(mappedFn).not.toMatch(/instructions/);
    expect(messageHandler).toContain("msg.type === 'bots/attach-mapped'");
    expect(messageHandler).toContain('applyMapped(msg)');
    expect(panel).toMatch(/persona:\s*bot\?\.persona \?\? ''/);
    expect(panel).not.toContain('persona: bot?.persona ?? COPY.defaultNewBotPersona');
  });

  it('paints exact skip copy as dismissible notices and does not persist them', () => {
    expect(skipFn).toContain("Skipped ' + fileName + \" · Can't read this file.\"");
    expect(skipFn).toContain("Skipped ' + fileName + ' · Binary file.'");
    expect(skipFn).toContain("Skipped ' + fileName + ' · too large'");
    expect(skipFn).toContain("Skipped ' + fileName + ' · Not in this workspace.'");
    expect(skipFn).not.toContain('Too large');
    expect(skipFn).not.toMatch(/KiB|256/);
    expect(formJs).toContain("msg.type === 'bots/attach-skipped'");
    expect(formJs).toContain('addSkip(msg)');
    expect(formJs).toContain("aria-label', 'Dismiss'");
    expect(formJs).toContain('attachSkips.textContent = \'\'');
    expect(formJs.slice(formJs.indexOf('function formAttachments'), formJs.indexOf('function addFiles'))).not.toMatch(
      /skip/i,
    );
    expect(formJs.slice(formJs.indexOf('function addSkip'), formJs.indexOf('function validate'))).not.toContain(
      'attachments.push',
    );
    expect(COPY.attachSkipTooLarge('huge.bin')).toBe('Skipped huge.bin · too large');
    expect(COPY.attachSkipUnreadable('x.md')).toBe("Skipped x.md · Can't read this file.");
    expect(COPY.attachSkipBinary('x.bin')).toBe('Skipped x.bin · Binary file.');
    expect(COPY.attachSkipOutside('x.md')).toBe('Skipped x.md · Not in this workspace.');
  });

  it('disables every slot button on workspace-empty without probing disk', () => {
    expect(formJs).toContain("msg.type === 'workspace-empty'");
    expect(formJs).toContain('msg.workspaceEmpty === true');
    expect(formJs).toContain('setNoFolder(true)');
    expect(formJs).toContain('.disabled = !!on');
    expect(formJs).toContain(COPY.attachNoFolder);
    expect(formJs).not.toMatch(/fs\.|readFile|readdir|statSync|workspace\.fs|showOpenDialog/);
    expect(panel).toContain("type: 'workspace-empty'");
    expect(panel).toContain('workspaceEmpty');
    expect(panel).toContain('workspaceFolders');
    const ui = loadBotForm();
    ui.dispatch({ type: 'workspace-empty' });
    for (const slot of SLOTS) {
      expect(ui.slotBtn(slot).disabled).toBe(true);
    }
    expect(ui.attachHint.hidden).toBe(false);
    expect(ui.attachHint.textContent).toBe('Open a folder to attach files.');
  });

  it('includes host-given attachments with slot on create/update and keeps handle collision copy', () => {
    expect(formJs).toContain('attachments: formAttachments()');
    expect(formJs).toContain('attachments: draft.attachments');
    expect(formJs).toContain('item.slot = file.slot');
    expect(formJs).toContain('item.kind = file.slot');
    expect(formJs).toContain('if (file.snapshot) item.snapshot = file.snapshot');
    expect(formJs).toContain('addFiles(undefined, bot.attachments)');
    expect(formJs).toContain("msg.type === 'bots/attach-added'");
    expect(formJs).toContain("'@' + h + ' is already taken.'");
    expect(proto).toContain("type: 'bots/attach-pick'; slot: AttachmentKind");
    expect(proto).toContain("type: 'bots/attach-remove'; slot: AttachmentKind; path: string");
    expect(proto).toContain("type: 'bots/attach-added'; slot: AttachmentKind;");
    expect(proto).toContain("type: 'bots/attach-skipped'");
    expect(proto).toContain('slot: AttachmentKind');
    expect(proto).toContain("type: 'bots/attach-mapped'");
    expect(proto).not.toMatch(/type: 'bots\/attach-pick' \}/);
    expect(formJs).not.toMatch(/type: 'bots\/attach-pick' \}/);
    expect(panel).toContain('msg.slot');
  });

  it('applies mapped persona over the New Bot default and keeps typed fields', () => {
    const ui = loadBotForm();
    ui.dispatch({
      type: 'form/load',
      defaults: {
        persona: COPY.defaultNewBotPersona,
        instructions: COPY.defaultNewBotInstructions,
      },
      workspaceEmpty: false,
    });
    expect(ui.fields.persona).toBe(COPY.defaultNewBotPersona);
    ui.dispatch({
      type: 'bots/attach-mapped',
      name: 'Docs Agent',
      handle: 'docsagent',
      persona: 'Calm guide',
    });
    expect(ui.fields.name).toBe('Docs Agent');
    expect(ui.fields.handle).toBe('docsagent');
    expect(ui.fields.persona).toBe('Calm guide');

    ui.fields.name = 'Keep Name';
    ui.fields.handle = 'keep-handle';
    ui.fields.persona = 'I typed this';
    ui.dispatch({
      type: 'bots/attach-mapped',
      name: 'Overwrite',
      handle: 'nope',
      persona: 'Should not land',
    });
    expect(ui.fields.name).toBe('Keep Name');
    expect(ui.fields.handle).toBe('keep-handle');
    expect(ui.fields.persona).toBe('I typed this');
  });

  it('posts slot on pick, lists host-added rows, skip notices, and allows empty Agent save', () => {
    const ui = loadBotForm();
    ui.dispatch({ type: 'form/load', workspaceEmpty: false, defaults: { persona: COPY.defaultNewBotPersona } });
    ui.slotBtn('skills').click();
    expect(ui.posts.some((m) => (m as { type?: string; slot?: string }).type === 'bots/attach-pick' && (m as { slot?: string }).slot === 'skills')).toBe(
      true,
    );
    ui.fields.name = 'Alpha';
    ui.fields.handle = 'alpha';
    ui.fields.persona = 'A person';
    ui.fields.role = 'lead';
    ui.save();
    const emptyCreate = ui.posts.find((m) => (m as { type?: string }).type === 'bots/create') as {
      draft?: { attachments?: unknown[] };
    };
    expect(emptyCreate.draft?.attachments).toEqual([]);
    ui.dispatch({
      type: 'bots/attach-added',
      slot: 'skills',
      files: [{ path: 'docs/SKILL.md', name: 'SKILL.md' }],
    });
    ui.dispatch({
      type: 'bots/attach-skipped',
      slot: 'scripts',
      name: 'huge.bin',
      reason: 'too-large',
      message: COPY.attachSkipTooLarge('huge.bin'),
    });
    expect(ui.slotList('skills').children[0]?.children[0]?.textContent).toBe('SKILL.md · docs/SKILL.md');
    expect(ui.slotList('agent').children).toHaveLength(0);
    expect(ui.attachSkips.children[0]?.children[0]?.textContent).toBe('Skipped huge.bin · too large');
    ui.save();
    const creates = ui.posts.filter((m) => (m as { type?: string }).type === 'bots/create') as {
      draft?: { attachments?: { slot?: string; kind?: string; path: string; name: string; snapshot?: string }[] };
    }[];
    const create = creates[creates.length - 1];
    expect(create?.draft?.attachments).toEqual([{ path: 'docs/SKILL.md', name: 'SKILL.md', slot: 'skills', kind: 'skills' }]);
    expect(create.draft?.attachments?.some((a) => a.kind === 'agent' || a.slot === 'agent')).toBe(false);
    expect(ui.posts.some((m) => (m as { type?: string }).type === 'form/ready')).toBe(true);
  });

  it('keeps Agent at 0 or 1 and allows 0..n on the other slots, including same path in two kinds', () => {
    const ui = loadBotForm();
    ui.dispatch({ type: 'form/load', workspaceEmpty: false, defaults: { persona: COPY.defaultNewBotPersona } });
    ui.dispatch({
      type: 'bots/attach-added',
      slot: 'agent',
      files: [{ path: 'docs/AGENTS.md', name: 'AGENTS.md' }],
    });
    ui.dispatch({
      type: 'bots/attach-added',
      slot: 'agent',
      files: [{ path: 'docs/AGENT.md', name: 'AGENT.md' }],
    });
    expect(ui.slotList('agent').children).toHaveLength(1);
    expect(ui.slotList('agent').children[0]?.children[0]?.textContent).toBe('AGENT.md · docs/AGENT.md');
    ui.dispatch({
      type: 'bots/attach-added',
      slot: 'scripts',
      files: [
        { path: 'tools/run.sh', name: 'run.sh' },
        { path: 'tools/run.py', name: 'run.py' },
      ],
    });
    ui.dispatch({
      type: 'bots/attach-added',
      slot: 'hooks',
      files: [{ path: 'tools/run.sh', name: 'run.sh' }],
    });
    expect(ui.slotList('scripts').children).toHaveLength(2);
    expect(ui.slotList('hooks').children).toHaveLength(1);
    expect(ui.slotList('scripts').children[0]?.children[0]?.textContent).toBe('run.sh · tools/run.sh');
    ui.slotList('scripts').children[0]!.children[1]!.click();
    expect(ui.posts.some((m) => (m as { type?: string; slot?: string; path?: string }).type === 'bots/attach-remove' && (m as { slot?: string }).slot === 'scripts' && (m as { path?: string }).path === 'tools/run.sh')).toBe(
      true,
    );
    expect(ui.slotList('scripts').children).toHaveLength(1);
    expect(ui.slotList('hooks').children).toHaveLength(1);
  });

  it('echoes untyped leftovers without a slot heading and does not invent snapshot bytes', () => {
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
        attachments: [
          { path: 'old.md', name: 'old.md', snapshot: 'HOST-SNAP' },
          { path: 'docs/note.md', name: 'note.md', snapshot: 'SKILL-SNAP', kind: 'skills' },
        ],
      },
    });
    expect(ui.slotList('agent').children).toHaveLength(0);
    expect(ui.slotList('skills').children[0]?.children[0]?.textContent).toBe('note.md · docs/note.md');
    expect(ui.attachUntyped.children[0]?.children[0]?.textContent).toBe('old.md · old.md');
    ui.fields.name = 'Alpha';
    ui.fields.handle = 'alpha';
    ui.fields.persona = 'p';
    ui.fields.role = 'lead';
    ui.save();
    const update = ui.posts.find((m) => (m as { type?: string }).type === 'bots/update') as {
      patch?: { attachments?: { slot?: string; kind?: string; path: string; snapshot?: string }[] };
    };
    expect(update.patch?.attachments).toEqual([
      { path: 'old.md', name: 'old.md', snapshot: 'HOST-SNAP' },
      { path: 'docs/note.md', name: 'note.md', slot: 'skills', kind: 'skills', snapshot: 'SKILL-SNAP' },
    ]);
  });

  it('stays chrome-only: no execute, wizard, token, or pack UI', () => {
    expect(formJs).not.toMatch(/spawn|hooks-runner|eval\(|child_process|TokenGovernor|pack-overflow|bulk|wizard/i);
    expect(formCss).not.toMatch(/token meter|pack-overflow|wizard/i);
    expect(formJs).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
  });
});
