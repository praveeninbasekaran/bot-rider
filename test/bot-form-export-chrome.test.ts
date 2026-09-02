import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COPY } from '../src/app/copy';
import { BOT_EXPORT_COMMANDS } from '../src/app/bot-export';

const root = join(__dirname, '..');
const formJs = readFileSync(join(root, 'media/bot-form.js'), 'utf8');
const formCss = readFileSync(join(root, 'media/bot-form.css'), 'utf8');
const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
const chatCss = readFileSync(join(root, 'media/chat.css'), 'utf8');
const proto = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');
const attachChrome = readFileSync(join(root, 'media/bot-form.js'), 'utf8');

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
    'export-dirty-title',
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
          : id === 'export-dirty-title'
            ? 'p'
            : 'input',
    );
    el.id = id;
    if (id === 'active') el.checked = true;
    if (id === 'export-dirty-modal') el.hidden = true;
    if (id === 'export-dirty-title') el.textContent = COPY.dirtyExportPrompt;
    if (id === 'export-dirty-save') el.textContent = COPY.dirtyExportSave;
    if (id === 'export-dirty-without') el.textContent = COPY.dirtyExportWithoutSaving;
    if (id === 'export-dirty-cancel') el.textContent = COPY.dirtyExportCancel;
    if (id === 'export-btn') el.textContent = 'Export';
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
    byId,
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
      get instructions() {
        return byId.get('instructions')!.value;
      },
      set instructions(v: string) {
        byId.get('instructions')!.value = v;
      },
    },
    err: byId.get('err')!,
    exportBtn: byId.get('export-btn')!,
    modal: byId.get('export-dirty-modal')!,
    dirtySave: byId.get('export-dirty-save')!,
    dirtyWithout: byId.get('export-dirty-without')!,
    dirtyCancel: byId.get('export-dirty-cancel')!,
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
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  contributes: {
    commands: { command: string; title: string; icon?: string }[];
    menus: Record<string, { command: string; when?: string; group?: string }[]>;
    viewsWelcome: { view: string; when: string; contents: string }[];
    views: Record<string, { id: string }[]>;
  };
};

describe('Bot form export chrome (§23)', () => {
  it('places secondary Export in the existing footer: left of Save, right of Cancel', () => {
    const footerAt = markup.indexOf('class="footer"');
    const cancelAt = markup.indexOf('id="cancel"', footerAt);
    const exportAt = markup.indexOf('id="export-btn"', footerAt);
    const saveAt = markup.indexOf('type="submit"', footerAt);
    expect(footerAt).toBeGreaterThan(-1);
    expect(cancelAt).toBeGreaterThan(footerAt);
    expect(exportAt).toBeGreaterThan(cancelAt);
    expect(saveAt).toBeGreaterThan(exportAt);
    expect(markup).toContain('id="export-btn">Export</button>');
    expect(markup).toMatch(/id="export-btn"[^>]*class="secondary"|class="secondary"[^>]*id="export-btn"/);
    expect((markup.match(/class="footer"/g) ?? []).length).toBe(1);
    expect(formCss).toContain('.footer');
    expect(formCss).toContain('button.secondary');
  });

  it('dirty modal uses host COPY keys and three buttons', () => {
    expect(COPY.dirtyExportPrompt).toBe('Save before export?');
    expect(COPY.dirtyExportSave).toBe('Save');
    expect(COPY.dirtyExportWithoutSaving).toBe('Export without saving');
    expect(COPY.dirtyExportCancel).toBe('Cancel');
    expect(markup).toContain(COPY.dirtyExportPrompt);
    expect(markup).toContain(`id="export-dirty-save">${COPY.dirtyExportSave}</button>`);
    expect(markup).toContain(`id="export-dirty-without">${COPY.dirtyExportWithoutSaving}</button>`);
    expect(markup).toContain(`id="export-dirty-cancel">${COPY.dirtyExportCancel}</button>`);
    expect(formCss).toContain('.export-dirty-modal');
    expect(formCss).toContain('.export-dirty-actions');
  });

  it('clean Edit posts bots/export-self without draft and without a modal', () => {
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
        active: true,
      },
    });
    const before = ui.posts.length;
    ui.exportBtn.click();
    expect(ui.modal.hidden).toBe(true);
    const exported = ui.posts.slice(before).filter((m) => (m as { type?: string }).type === 'bots/export-self');
    expect(exported).toEqual([{ type: 'bots/export-self' }]);
    expect(ui.posts.slice(before).some((m) => {
      const t = (m as { type?: string }).type;
      return t === 'bots/create' || t === 'bots/update';
    })).toBe(false);
  });

  it('dirty Edit shows the modal; Cancel posts nothing', () => {
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
        active: true,
      },
    });
    ui.fields.persona = 'changed';
    const before = ui.posts.length;
    ui.exportBtn.click();
    expect(ui.modal.hidden).toBe(false);
    expect(ui.posts.slice(before)).toEqual([]);
    ui.dirtyCancel.click();
    expect(ui.modal.hidden).toBe(true);
    expect(ui.posts.slice(before)).toEqual([]);
  });

  it('Export without saving posts export-self with draft and does not persist', () => {
    const ui = loadBotForm();
    ui.dispatch({
      type: 'form/load',
      workspaceEmpty: false,
      defaults: { persona: COPY.defaultNewBotPersona, instructions: COPY.defaultNewBotInstructions },
    });
    ui.fillRequired();
    ui.fields.instructions = 'draft only';
    const before = ui.posts.length;
    ui.exportBtn.click();
    expect(ui.modal.hidden).toBe(false);
    ui.dirtyWithout.click();
    const next = ui.posts.slice(before);
    expect(next.some((m) => (m as { type?: string }).type === 'bots/create')).toBe(false);
    expect(next.some((m) => (m as { type?: string }).type === 'bots/update')).toBe(false);
    const exported = next.find((m) => (m as { type?: string }).type === 'bots/export-self') as {
      type: string;
      draft?: {
        name: string;
        handle: string;
        persona: string;
        role: string;
        instructions: string;
        active: boolean;
        modelId?: string | null;
        attachments?: { kind?: string; path: string; name: string; snapshot: string }[];
      };
    };
    expect(exported.draft).toEqual({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'A person',
      role: 'lead',
      instructions: 'draft only',
      active: true,
    });
    expect(exported.draft).not.toHaveProperty('colorIndex');
    expect(exported.draft).not.toHaveProperty('id');
  });

  it('Save on dirty New persists then posts export-self without draft', () => {
    const ui = loadBotForm();
    ui.dispatch({
      type: 'form/load',
      workspaceEmpty: false,
      defaults: { persona: COPY.defaultNewBotPersona },
    });
    ui.fillRequired();
    const before = ui.posts.length;
    ui.exportBtn.click();
    ui.dirtySave.click();
    const next = ui.posts.slice(before);
    const types = next.map((m) => (m as { type?: string }).type);
    expect(types).toContain('bots/create');
    expect(types).toContain('bots/export-self');
    expect(types.indexOf('bots/create')).toBeLessThan(types.indexOf('bots/export-self'));
    const exported = next.find((m) => (m as { type?: string }).type === 'bots/export-self') as {
      draft?: unknown;
    };
    expect(exported).toEqual({ type: 'bots/export-self' });
    expect(exported).not.toHaveProperty('draft');
  });

  it('Save on dirty Edit persists update then export-self without draft', () => {
    const ui = loadBotForm();
    ui.dispatch({
      type: 'form/load',
      workspaceEmpty: false,
      bot: {
        id: 'bot-1',
        name: 'Alpha',
        handle: 'alpha',
        persona: 'p',
        role: 'lead',
        instructions: 'i',
        active: true,
      },
    });
    ui.fields.role = 'reviewer';
    const before = ui.posts.length;
    ui.exportBtn.click();
    ui.dirtySave.click();
    const next = ui.posts.slice(before);
    const update = next.find((m) => (m as { type?: string }).type === 'bots/update') as {
      type: string;
      id: string;
      patch?: { role?: string };
    };
    expect(update.id).toBe('bot-1');
    expect(update.patch?.role).toBe('reviewer');
    expect(next.some((m) => (m as { type?: string }).type === 'bots/create')).toBe(false);
    expect(next.filter((m) => (m as { type?: string }).type === 'bots/export-self')).toEqual([
      { type: 'bots/export-self' },
    ]);
  });

  it('invalid BR-2 draft shows existing form errors and never opens the modal or posts export-self', () => {
    const ui = loadBotForm();
    ui.dispatch({
      type: 'form/load',
      workspaceEmpty: false,
      defaults: { persona: COPY.defaultNewBotPersona },
    });
    const before = ui.posts.length;
    ui.exportBtn.click();
    expect(ui.modal.hidden).toBe(true);
    expect(ui.err.textContent).toBe('Name is required.');
    expect(ui.posts.slice(before).some((m) => (m as { type?: string }).type === 'bots/export-self')).toBe(
      false,
    );
    ui.fields.name = 'Alpha';
    ui.fields.handle = 'alpha';
    ui.fields.persona = '';
    ui.fields.role = 'lead';
    ui.exportBtn.click();
    expect(ui.modal.hidden).toBe(true);
    expect(ui.err.textContent).toBe('Persona is required.');
    expect(ui.posts.slice(before)).toEqual([]);
  });

  it('export-self draft attachments match protocol shape (kind/path/name/snapshot)', () => {
    const ui = loadBotForm();
    ui.dispatch({
      type: 'form/load',
      workspaceEmpty: false,
      defaults: { persona: COPY.defaultNewBotPersona },
    });
    ui.fillRequired();
    ui.dispatch({
      type: 'bots/attach-added',
      slot: 'skills',
      files: [{ path: 'docs/SKILL.md', name: 'SKILL.md', snapshot: 'snap' }],
    });
    ui.exportBtn.click();
    ui.dirtyWithout.click();
    const exported = [...ui.posts].reverse().find((m) => (m as { type?: string }).type === 'bots/export-self') as {
      draft?: { attachments?: { kind?: string; path: string; name: string; snapshot: string; slot?: string }[] };
    };
    expect(exported.draft?.attachments).toEqual([
      { path: 'docs/SKILL.md', name: 'SKILL.md', snapshot: 'snap', kind: 'skills' },
    ]);
    expect(exported.draft?.attachments?.[0]).not.toHaveProperty('slot');
  });

  it('UI never reads/writes the interchange file, never calls vscode.lm, never executes', () => {
    expect(formJs).not.toMatch(/showSaveDialog|showOpenDialog|showQuickPick|writeFile|readFile/);
    expect(formJs).not.toMatch(/vscode\.lm|selectChatModels|sendRequest/);
    expect(formJs).not.toMatch(/child_process|spawn\(|eval\(|hooks-runner/);
    expect(formJs).toContain("type: 'bots/export-self'");
    expect(formJs).not.toMatch(/format:\s*['"]botrider\.bots\.v1['"]/);
    expect(proto).toMatch(/type: 'bots\/export-self'/);
    expect(chatJs).not.toMatch(/export-self|id="export-btn"|Save before export/);
    expect(chatCss).not.toMatch(/export-dirty-modal|id="export-btn"/);
    expect(attachChrome).toContain('class="attach-block"');
    expect(formJs).toContain('id="model"');
  });
});

describe('§23 menus and empty welcome (shipped view / context ids)', () => {
  it('wires camelCase export/import commands to shipped botrider.bots view and hasBots', () => {
    expect(pkg.contributes.views.botrider.map((v) => v.id)).toContain('botrider.bots');
    expect(BOT_EXPORT_COMMANDS).toEqual({
      export: 'botRider.bots.export',
      exportSelected: 'botRider.bots.exportSelected',
      exportAll: 'botRider.bots.exportAll',
      import: 'botRider.bots.import',
    });

    const itemCtx = pkg.contributes.menus['view/item/context'];
    const exportBot = itemCtx.find((m) => m.command === 'botRider.bots.export');
    expect(exportBot?.when).toBe('view == botrider.bots && viewItem == bot');
    expect(exportBot?.group).not.toMatch(/^inline/);
    expect(pkg.contributes.commands.find((c) => c.command === 'botRider.bots.export')?.title).toBe(
      'Export Bot',
    );

    const titles = pkg.contributes.menus['view/title'];
    const exportAll = titles.find((m) => m.command === 'botRider.bots.exportAll');
    expect(exportAll?.when).toBe('view == botrider.bots && botrider.hasBots');
    expect(exportAll?.group).not.toBe('navigation');
    expect(pkg.contributes.commands.find((c) => c.command === 'botRider.bots.exportAll')?.title).toBe(
      'Export All',
    );

    const importTitle = titles.find((m) => m.command === 'botRider.bots.import');
    expect(importTitle?.when).toBe('view == botrider.bots');
    expect(importTitle?.group).toMatch(/^navigation/);
    expect(pkg.contributes.commands.find((c) => c.command === 'botRider.bots.import')).toMatchObject({
      title: 'Import',
      icon: '$(desktop-download)',
    });

    const exportSelectedTitle = titles.find((m) => m.command === 'botRider.bots.exportSelected');
    expect(exportSelectedTitle?.when).toBe('view == botrider.bots && listHasSelectionOrFocus');
    expect(exportSelectedTitle?.group ?? '').not.toMatch(/^navigation|^inline/);
    expect(pkg.contributes.commands.find((c) => c.command === 'botRider.bots.exportSelected')?.title).toBe(
      'Export Selected',
    );

    const palette = pkg.contributes.menus.commandPalette;
    expect(palette.find((m) => m.command === 'botRider.bots.export')?.when).toBe('false');
    expect(palette.find((m) => m.command === 'botRider.bots.exportSelected')?.when).toBe(
      'view == botrider.bots && listHasSelectionOrFocus',
    );
    expect(palette.find((m) => m.command === 'botRider.bots.exportAll')?.when).toBe('botrider.hasBots');
  });

  it('empty welcome keeps New Bot and adds Import; does not change Swarm', () => {
    const bots = pkg.contributes.viewsWelcome.find((v) => v.view === 'botrider.bots');
    expect(bots?.when).toBe('!botrider.hasBots');
    expect(bots?.contents).toBe(
      'No bots yet. Create a bot with a name, persona, and role, then send a master prompt in Swarm.\n[New Bot](command:botrider.bots.create)\n[Import](command:botRider.bots.import)',
    );
    expect(bots?.contents).not.toMatch(/Marketplace/i);
    expect(pkg.contributes.viewsWelcome.find((v) => v.view === 'botrider.chat')).toBeUndefined();
    expect(chatJs).not.toMatch(/botRider\.bots\.import|botrider\.bots\.import/);
  });

  it('does not reopen §20 slots, §22 model, Swarm, or leftover bugs', () => {
    expect(formJs).toContain('class="attach-block"');
    expect(formJs).toContain('id="model"');
    expect(formJs).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
    expect(formJs).not.toMatch(/F7 parallel|Event Bus|Graphify/i);
    expect(formJs).not.toMatch(/fourth sidebar|token meter/i);
  });
});
