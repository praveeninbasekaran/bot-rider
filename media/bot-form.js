(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('bot-form') || document.body.appendChild(document.createElement('form'));
  form.id = 'bot-form';
  let editingId = null;
  let handleTouched = false;
  let others = [];

  form.innerHTML =
    '<label>Name <input id="name" required /></label>' +
    '<label>Handle <span class="handle-field"><span class="prefix">@</span><input id="handle" required pattern="[a-z0-9][a-z0-9_-]{0,31}" /></span></label>' +
    '<label>Persona <textarea id="persona" required></textarea></label>' +
    '<label>Role <input id="role" required /></label>' +
    '<label>System instructions <textarea id="instructions"></textarea></label>' +
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

  function derive(n) {
    var s = String(n)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
    if (!s || !/^[a-z0-9]/.test(s)) s = 'bot' + s;
    return s.slice(0, 32) || 'bot';
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
      const bot = msg.bot;
      if (bot) {
        editingId = bot.id;
        handleTouched = true;
        name.value = bot.name;
        handle.value = bot.handle;
        persona.value = bot.persona;
        role.value = bot.role;
        instructions.value = bot.instructions;
        active.checked = !!bot.active;
        deleteBtn.hidden = false;
      } else if (msg.defaults) {
        if (!persona.value.trim()) {
          persona.value = msg.defaults.persona || '';
        }
        if (!instructions.value.trim()) {
          instructions.value = msg.defaults.instructions || '';
        }
      }
    } else if (msg.type === 'form/error') {
      err.textContent = msg.message || '';
    } else if (msg.type === 'bots/attach-mapped') {
      if (msg.name && !name.value.trim()) {
        name.value = msg.name;
      }
      if (msg.handle && !handle.value.trim()) {
        handle.value = msg.handle;
        handleTouched = true;
      }
      if (msg.persona && !persona.value.trim()) {
        persona.value = msg.persona;
      }
    }
  });

  vscode.postMessage({ type: 'form/ready' });
})();
