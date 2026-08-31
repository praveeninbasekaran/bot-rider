(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('bot-form') || document.body.appendChild(document.createElement('form'));
  form.id = 'bot-form';
  let editingId = null;
  let handleTouched = false;
  let others = [];
  let attachments = [];
  let placeholders = { name: '', handle: '', persona: '' };
  const DEFAULT_NEW_BOT_PERSONA = 'A thoughtful teammate who talks like a person.';
  const SLOT_IDS = ['agent', 'skills', 'scripts', 'instructions', 'prompts', 'hooks'];
  const MARKDOWN_TEXT_FILTER = 'Markdown / text';
  const SCRIPT_HOOK_FILTER = 'Markdown / text plus .py .js .ts .sh .bash .zsh .ps1';

  form.innerHTML =
    '<label>Name <input id="name" required /></label>' +
    '<label>Handle <span class="handle-field"><span class="prefix">@</span><input id="handle" required pattern="[a-z0-9][a-z0-9_-]{0,31}" /></span></label>' +
    '<label>Persona <textarea id="persona" required></textarea></label>' +
    '<label>Role <input id="role" required /></label>' +
    '<label>System instructions <textarea id="instructions"></textarea></label>' +
    '<div class="attach-block">' +
    '<div class="attach-slot" data-slot="agent">' +
    '<div class="attach-label">Agent</div>' +
    '<p class="attach-filter">' + MARKDOWN_TEXT_FILTER + '</p>' +
    '<button type="button" class="attach-pick" id="attach-agent-btn">Attach...</button>' +
    '<ul id="attach-agent-list" class="attach-list"></ul>' +
    '</div>' +
    '<div class="attach-slot" data-slot="skills">' +
    '<div class="attach-label">Skills</div>' +
    '<p class="attach-filter">' + MARKDOWN_TEXT_FILTER + '</p>' +
    '<button type="button" class="attach-pick" id="attach-skills-btn">Attach...</button>' +
    '<ul id="attach-skills-list" class="attach-list"></ul>' +
    '</div>' +
    '<div class="attach-slot" data-slot="scripts">' +
    '<div class="attach-label">Scripts</div>' +
    '<p class="attach-filter">' + SCRIPT_HOOK_FILTER + '</p>' +
    '<button type="button" class="attach-pick" id="attach-scripts-btn">Attach...</button>' +
    '<ul id="attach-scripts-list" class="attach-list"></ul>' +
    '</div>' +
    '<div class="attach-slot" data-slot="instructions">' +
    '<div class="attach-label">Instructions</div>' +
    '<p class="attach-filter">' + MARKDOWN_TEXT_FILTER + '</p>' +
    '<button type="button" class="attach-pick" id="attach-instructions-btn">Attach...</button>' +
    '<ul id="attach-instructions-list" class="attach-list"></ul>' +
    '</div>' +
    '<div class="attach-slot" data-slot="prompts">' +
    '<div class="attach-label">Prompts</div>' +
    '<p class="attach-filter">' + MARKDOWN_TEXT_FILTER + '</p>' +
    '<button type="button" class="attach-pick" id="attach-prompts-btn">Attach...</button>' +
    '<ul id="attach-prompts-list" class="attach-list"></ul>' +
    '</div>' +
    '<div class="attach-slot" data-slot="hooks">' +
    '<div class="attach-label">Hooks</div>' +
    '<p class="attach-filter">' + SCRIPT_HOOK_FILTER + '</p>' +
    '<button type="button" class="attach-pick" id="attach-hooks-btn">Attach...</button>' +
    '<ul id="attach-hooks-list" class="attach-list"></ul>' +
    '</div>' +
    '<ul id="attach-untyped-list" class="attach-list"></ul>' +
    '<p id="attach-hint" class="attach-hint" hidden>Open a folder to attach files.</p>' +
    '<ul id="attach-skips" class="attach-skips"></ul>' +
    '</div>' +
    '<label class="row"><input id="active" type="checkbox" checked /> Active in swarm</label>' +
    '<div id="err" class="error" role="alert"></div>' +
    '<div class="footer"><button type="button" class="link grow" id="delete-btn" hidden>Delete</button><button type="button" class="secondary" id="cancel">Cancel</button><button type="submit">Save</button></div>';

  const name = document.getElementById('name');
  const handle = document.getElementById('handle');
  const persona = document.getElementById('persona');
  const role = document.getElementById('role');
  const instructions = document.getElementById('instructions');
  const active = document.getElementById('active');
  const err = document.getElementById('err');
  const deleteBtn = document.getElementById('delete-btn');
  const attachHint = document.getElementById('attach-hint');
  const attachSkips = document.getElementById('attach-skips');
  const attachUntypedList = document.getElementById('attach-untyped-list');

  handle.addEventListener('input', function () {
    handleTouched = true;
  });
  name.addEventListener('input', function () {
    if (!handleTouched && !editingId) {
      handle.value = derive(name.value);
    }
  });
  document.getElementById('cancel').addEventListener('click', function () {
    vscode.postMessage({ type: 'form/cancel' });
  });
  deleteBtn.addEventListener('click', function () {
    vscode.postMessage({ type: 'bots/delete', id: editingId });
  });
  SLOT_IDS.forEach(function (slot) {
    document.getElementById('attach-' + slot + '-btn').addEventListener('click', function () {
      vscode.postMessage({ type: 'bots/attach-pick', slot: slot });
    });
  });

  function derive(n) {
    var s = String(n)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
    if (!s || !/^[a-z0-9]/.test(s)) s = 'bot' + s;
    return s.slice(0, 32) || 'bot';
  }

  function fieldIsEmpty(value, placeholder) {
    var text = String(value || '').trim();
    if (!text) return true;
    if (editingId) return false;
    var ph = String(placeholder || '').trim();
    return !!ph && text === ph;
  }

  function applyMapped(msg) {
    if (msg.name && fieldIsEmpty(name.value, placeholders.name)) {
      name.value = msg.name;
    }
    if (msg.handle && fieldIsEmpty(handle.value, placeholders.handle)) {
      handle.value = msg.handle;
      handleTouched = true;
    }
    if (msg.persona && fieldIsEmpty(persona.value, placeholders.persona)) {
      persona.value = msg.persona;
    }
  }

  function setNoFolder(on) {
    SLOT_IDS.forEach(function (slot) {
      document.getElementById('attach-' + slot + '-btn').disabled = !!on;
    });
    attachHint.hidden = !on;
  }

  function skipCopy(fileName, reason, message) {
    if (message) return message;
    if (reason === 'unreadable') return 'Skipped ' + fileName + " · Can't read this file.";
    if (reason === 'binary') return 'Skipped ' + fileName + ' · Binary file.';
    if (reason === 'too-large') return 'Skipped ' + fileName + ' · too large';
    if (reason === 'outside-workspace') return 'Skipped ' + fileName + ' · Not in this workspace.';
    return 'Skipped ' + fileName;
  }

  function formAttachments() {
    return attachments.map(function (file) {
      var item = { path: file.path, name: file.name };
      if (file.slot) {
        item.slot = file.slot;
        item.kind = file.slot;
      }
      if (file.snapshot) item.snapshot = file.snapshot;
      return item;
    });
  }

  function addFiles(slot, files) {
    if (slot === 'agent') {
      attachments = attachments.filter(function (held) {
        return held.slot !== 'agent';
      });
    }
    (files || []).forEach(function (file) {
      if (!file || !file.path) return;
      var s = slot || file.slot || file.kind;
      if (s === 'agent') {
        attachments = attachments.filter(function (held) {
          return held.slot !== 'agent';
        });
      }
      if (s) {
        if (attachments.some(function (held) { return held.slot === s && held.path === file.path; })) return;
        var slotted = { path: file.path, name: file.name || file.path, slot: s };
        if (file.snapshot) slotted.snapshot = file.snapshot;
        attachments.push(slotted);
        return;
      }
      if (attachments.some(function (held) { return !held.slot && held.path === file.path; })) return;
      var untyped = { path: file.path, name: file.name || file.path };
      if (file.snapshot) untyped.snapshot = file.snapshot;
      attachments.push(untyped);
    });
    paintAttachments();
  }

  function paintSlotList(slot, files) {
    var list = document.getElementById('attach-' + slot + '-list');
    list.textContent = '';
    files.forEach(function (file) {
      list.appendChild(rowFor(file, slot));
    });
    if (slot === 'agent') {
      document.getElementById('attach-agent-btn').textContent = files.length ? 'Replace...' : 'Attach...';
    }
  }

  function rowFor(file, slot) {
    var li = document.createElement('li');
    li.className = 'attach-row';
    var label = document.createElement('span');
    label.className = 'attach-row-label';
    label.textContent = file.name + ' · ' + file.path;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-close';
    btn.setAttribute('aria-label', 'Remove');
    btn.textContent = '\u00d7';
    btn.addEventListener('click', function () {
      if (slot) {
        vscode.postMessage({ type: 'bots/attach-remove', slot: slot, path: file.path });
        attachments = attachments.filter(function (held) {
          return !(held.slot === slot && held.path === file.path);
        });
      } else {
        attachments = attachments.filter(function (held) {
          return held.slot || held.path !== file.path;
        });
      }
      paintAttachments();
    });
    li.appendChild(label);
    li.appendChild(btn);
    return li;
  }

  function paintAttachments() {
    SLOT_IDS.forEach(function (slot) {
      paintSlotList(
        slot,
        attachments.filter(function (file) {
          return file.slot === slot;
        }),
      );
    });
    attachUntypedList.textContent = '';
    attachments
      .filter(function (file) {
        return !file.slot;
      })
      .forEach(function (file) {
        attachUntypedList.appendChild(rowFor(file, null));
      });
  }

  function addSkip(msg) {
    var li = document.createElement('li');
    li.className = 'attach-skip';
    var text = document.createElement('span');
    text.textContent = skipCopy(msg.name, msg.reason, msg.message);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-close';
    btn.setAttribute('aria-label', 'Dismiss');
    btn.textContent = '\u00d7';
    btn.addEventListener('click', function () {
      li.remove();
    });
    li.appendChild(text);
    li.appendChild(btn);
    attachSkips.appendChild(li);
  }

  function validate() {
    const n = name.value.trim();
    const h = handle.value.trim().toLowerCase();
    if (!n) return 'Name is required.';
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(n)) {
      return 'Use letters, numbers, spaces, hyphens, or underscores.';
    }
    if (others.some(function (b) { return b.name.toLowerCase() === n.toLowerCase() && b.id !== editingId; })) {
      return 'A bot named "' + n + '" already exists.';
    }
    if (!h) return 'Handle is required.';
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(h)) {
      return 'Use a–z, 0–9, hyphen, or underscore. Start with a letter or number.';
    }
    if (others.some(function (b) { return b.handle.toLowerCase() === h && b.id !== editingId; })) {
      return '@' + h + ' is already taken.';
    }
    if (!persona.value.trim()) return 'Persona is required.';
    if (!role.value.trim()) return 'Role is required.';
    return '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const message = validate();
    err.textContent = message;
    if (message) {
      return;
    }
    const draft = {
      name: name.value.trim(),
      handle: handle.value.trim().toLowerCase(),
      persona: persona.value.trim(),
      role: role.value.trim(),
      instructions: instructions.value,
      active: active.checked,
      colorIndex: 0,
      attachments: formAttachments(),
    };
    if (editingId) {
      vscode.postMessage({
        type: 'bots/update',
        id: editingId,
        patch: {
          name: draft.name,
          handle: draft.handle,
          persona: draft.persona,
          role: draft.role,
          instructions: draft.instructions,
          attachments: draft.attachments,
        },
        active: draft.active,
        name: draft.name,
        handle: draft.handle,
        persona: draft.persona,
        role: draft.role,
        instructions: draft.instructions,
      });
    } else {
      vscode.postMessage({ type: 'bots/create', draft: draft });
    }
  });

  window.addEventListener('message', function (event) {
    const msg = event.data || {};
    if (msg.type === 'form/load') {
      others = msg.bots || [];
      attachments = [];
      attachSkips.textContent = '';
      const bot = msg.bot;
      if (bot) {
        editingId = bot.id;
        handleTouched = true;
        placeholders = { name: '', handle: '', persona: '' };
        name.value = bot.name;
        handle.value = bot.handle;
        persona.value = bot.persona;
        role.value = bot.role;
        instructions.value = bot.instructions;
        active.checked = !!bot.active;
        deleteBtn.hidden = false;
        addFiles(undefined, bot.attachments);
      } else {
        editingId = null;
        placeholders = {
          name: (msg.defaults && msg.defaults.name) || '',
          handle: (msg.defaults && msg.defaults.handle) || '',
          persona: (msg.defaults && msg.defaults.persona) || DEFAULT_NEW_BOT_PERSONA,
        };
        if (msg.defaults) {
          if (!persona.value.trim()) {
            persona.value = msg.defaults.persona || '';
          }
          if (!instructions.value.trim()) {
            instructions.value = msg.defaults.instructions || '';
          }
        }
        paintAttachments();
      }
      if (msg.workspaceEmpty === true) {
        setNoFolder(true);
      } else if (msg.workspaceEmpty === false) {
        setNoFolder(false);
      }
    } else if (msg.type === 'workspace-empty') {
      setNoFolder(true);
    } else if (msg.type === 'form/error') {
      err.textContent = msg.message || '';
    } else if (msg.type === 'bots/attach-added') {
      addFiles(msg.slot, msg.files);
    } else if (msg.type === 'bots/attach-skipped') {
      addSkip(msg);
    } else if (msg.type === 'bots/attach-mapped') {
      applyMapped(msg);
    }
  });

  vscode.postMessage({ type: 'form/ready' });
})();
