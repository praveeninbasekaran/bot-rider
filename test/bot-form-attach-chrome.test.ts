import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COPY } from '../src/app/copy';

const root = join(__dirname, '..');
const formJs = readFileSync(join(root, 'media/bot-form.js'), 'utf8');
const formCss = readFileSync(join(root, 'media/bot-form.css'), 'utf8');
const panel = readFileSync(join(root, 'src/adapters/bot-form-panel.ts'), 'utf8');
const proto = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');

function loadBotForm() {
  const posts: unknown[] = [];
  const byId = new Map<string, FakeEl>();
  const listeners: Record<string, ((ev: { data?: unknown }) => void)[]> = {};

  class FakeEl {
    id = '';
    value = '';
    hidden = false;
    disabled = false;
    checked = false;
    textContent = '';
    innerHTML = '';
    className = '';
    type = '';
    children: FakeEl[] = [];
    attrs: Record<string, string> = {};
    handlers: Record<string, ((ev?: { preventDefault(): void }) => void)[]> = {};
    constructor(readonly tagName = 'div') {}
    appendChild(child: FakeEl) {
      this.children.push(child);
      if (child.id) byId.set(child.id, child);
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
  }

  const form = new FakeEl('form');
  form.id = 'bot-form';
  byId.set('bot-form', form);
  const ids = [
    'name',
    'handle',
    'persona',
    'role',
    'instructions',
    'active',
    'err',
    'delete-btn',
    'cancel',
    'attach-btn',
    'attach-hint',
    'attach-list',
    'attach-skips',
  ];
  for (const id of ids) {
    const el = new FakeEl(id === 'persona' || id === 'instructions' ? 'textarea' : 'input');
    el.id = id;
    if (id === 'active') el.checked = true;
    if (id === 'attach-hint') {
      el.textContent = 'Open a folder to attach files.';
      el.hidden = true;
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
    },
    attachBtn: byId.get('attach-btn')!,
    attachHint: byId.get('attach-hint')!,
    attachList: byId.get('attach-list')!,
    attachSkips: byId.get('attach-skips')!,
    dispatch(data: unknown) {
      for (const fn of listeners.message ?? []) fn({ data });
    },
  };
}

const markup = formJs.slice(formJs.indexOf('form.innerHTML'), formJs.indexOf('const name ='));
const mappedFn = formJs.slice(formJs.indexOf('function applyMapped'), formJs.indexOf('function setNoFolder'));
const emptyFn = formJs.slice(formJs.indexOf('function fieldIsEmpty'), formJs.indexOf('function applyMapped'));
const skipFn = formJs.slice(formJs.indexOf('function skipCopy'), formJs.indexOf('function formAttachments'));
const messageHandler = formJs.slice(formJs.indexOf("window.addEventListener('message'"), formJs.indexOf("vscode.postMessage({ type: 'form/ready' })"));

describe('Bot form attachment chrome (§20)', () => {
  it('places Attached files after System instructions and before Active', () => {
    const instructionsAt = markup.indexOf('System instructions');
    const attachAt = markup.indexOf('Attached files');
    const activeAt = markup.indexOf('Active in swarm');
    expect(instructionsAt).toBeGreaterThan(-1);
    expect(attachAt).toBeGreaterThan(instructionsAt);
    expect(activeAt).toBeGreaterThan(attachAt);
    expect(markup).toContain('>Attach...</button>');
    expect(markup).toContain('id="attach-btn"');
    expect(markup).toContain('Open a folder to attach files.');
    expect(formJs).toContain("type: 'bots/attach-pick'");
  });

  it('renders {name} · {path} labels and Remove posts bots/attach-remove', () => {
    expect(formJs).toContain("file.name + ' · ' + file.path");
    expect(formJs).toContain("type: 'bots/attach-remove'");
    expect(formJs).toContain("path: file.path");
    expect(formJs).toContain("aria-label', 'Remove'");
    expect(formJs).not.toMatch(/attach-row[\s\S]{0,200}createElement\('a'\)/);
    expect(formJs).not.toMatch(/href\s*=\s*['"]file:/);
    expect(formCss).toContain('.attach-row');
    expect(formCss).toContain('.icon-close');
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
    expect(formJs.slice(formJs.indexOf('function formAttachments'), formJs.indexOf('function addFiles'))).not.toMatch(/skip/i);
    expect(formJs.slice(formJs.indexOf('function addSkip'), formJs.indexOf('function validate'))).not.toContain('attachments.push');
    expect(COPY.attachSkipTooLarge('huge.bin')).toBe('Skipped huge.bin · too large');
    expect(COPY.attachSkipUnreadable('x.md')).toBe("Skipped x.md · Can't read this file.");
    expect(COPY.attachSkipBinary('x.bin')).toBe('Skipped x.bin · Binary file.');
    expect(COPY.attachSkipOutside('x.md')).toBe('Skipped x.md · Not in this workspace.');
  });

  it('disables Attach on workspace-empty without probing disk', () => {
    expect(formJs).toContain("msg.type === 'workspace-empty'");
    expect(formJs).toContain('msg.workspaceEmpty === true');
    expect(formJs).toContain('setNoFolder(true)');
    expect(formJs).toContain('attachBtn.disabled = !!on');
    expect(formJs).toContain(COPY.attachNoFolder);
    expect(formJs).not.toMatch(/fs\.|readFile|readdir|statSync|workspace\.fs|showOpenDialog/);
    expect(panel).toContain("type: 'workspace-empty'");
    expect(panel).toContain('workspaceEmpty');
    expect(panel).toContain('workspaceFolders');
  });

  it('includes host-given attachments on create/update and keeps handle collision copy', () => {
    expect(formJs).toContain('attachments: formAttachments()');
    expect(formJs).toContain('attachments: draft.attachments');
    expect(formJs).toContain('if (file.snapshot) item.snapshot = file.snapshot');
    expect(formJs).toContain('addFiles(bot.attachments)');
    expect(formJs).toContain("msg.type === 'bots/attach-added'");
    expect(formJs).toContain("'@' + h + ' is already taken.'");
    expect(proto).toContain("type: 'bots/attach-pick'; slot: AttachmentKind");
    expect(proto).toContain("type: 'bots/attach-remove'; slot: AttachmentKind; path: string");
    expect(proto).toContain("type: 'bots/attach-added'; slot: AttachmentKind;");
    expect(proto).toContain("type: 'bots/attach-skipped'");
    expect(proto).toContain('slot: AttachmentKind');
    expect(proto).toContain("type: 'bots/attach-mapped'");
    expect(proto).not.toMatch(/type: 'bots\/attach-pick' \}/);
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

  it('lists host-added rows, skip notices, and workspace-empty without failing Save', () => {
    const ui = loadBotForm();
    ui.dispatch({ type: 'workspace-empty' });
    expect(ui.attachBtn.disabled).toBe(true);
    expect(ui.attachHint.hidden).toBe(false);
    expect(ui.attachHint.textContent).toBe('Open a folder to attach files.');

    ui.dispatch({ type: 'form/load', workspaceEmpty: false, defaults: { persona: COPY.defaultNewBotPersona } });
    ui.fields.name = 'Alpha';
    ui.fields.handle = 'alpha';
    ui.fields.persona = 'A person';
    ui.dispatch({
      type: 'bots/attach-added',
      files: [{ path: 'docs/AGENTS.md', name: 'AGENTS.md' }],
    });
    ui.dispatch({
      type: 'bots/attach-skipped',
      name: 'huge.bin',
      reason: 'too-large',
      message: COPY.attachSkipTooLarge('huge.bin'),
    });
    expect(ui.attachList.children[0]?.children[0]?.textContent).toBe('AGENTS.md · docs/AGENTS.md');
    expect(ui.attachSkips.children[0]?.children[0]?.textContent).toBe('Skipped huge.bin · too large');
    expect(ui.posts.some((m) => (m as { type?: string }).type === 'form/ready')).toBe(true);
  });

  it('stays chrome-only: no execute, wizard, token, or pack UI', () => {
    expect(formJs).not.toMatch(/spawn|hooks-runner|eval\(|child_process|TokenGovernor|pack-overflow|bulk|wizard/i);
    expect(formCss).not.toMatch(/token meter|pack-overflow|wizard/i);
    expect(formJs).not.toMatch(/E2E-BUG-002|E2E-BUG-003|E2E-BUG-009|E2E-BUG-014/);
  });
});
