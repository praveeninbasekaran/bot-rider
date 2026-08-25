(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('bot-form') || document.body.appendChild(document.createElement('form'));
  form.id = 'bot-form';
  let editingId = null;
  let handleTouched = false;

  form.innerHTML =
    '<label>Name <input id="name" required /></label>' +
    '<label>Handle <input id="handle" required pattern="[a-z0-9][a-z0-9_-]{0,31}" /></label>' +
    '<label>Persona <textarea id="persona"></textarea></label>' +
    '<label>Role <textarea id="role"></textarea></label>' +
    '<label>System instructions <textarea id="instructions"></textarea></label>' +
    '<label class="row"><input id="active" type="checkbox" checked /> Active</label>' +
    '<div id="err" class="error"></div>' +
    '<button type="submit">Save</button>';

  const name = document.getElementById('name');
  const handle = document.getElementById('handle');
  const persona = document.getElementById('persona');
  const role = document.getElementById('role');
  const instructions = document.getElementById('instructions');
  const active = document.getElementById('active');
  const err = document.getElementById('err');

  handle.addEventListener('input', function () {
    handleTouched = true;
  });
  name.addEventListener('input', function () {
    if (!handleTouched && !editingId) {
      handle.value = derive(name.value);
    }
  });

  function derive(n) {
    var s = String(n).toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9_-]/g, '');
    if (!s || !/^[a-z0-9]/.test(s)) s = 'bot' + s;
    return s.slice(0, 32) || 'bot';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.textContent = '';
    const payload = {
      name: name.value,
      handle: handle.value.trim().toLowerCase(),
      persona: persona.value,
      role: role.value,
      instructions: instructions.value,
      active: active.checked,
    };
    if (editingId) {
      vscode.postMessage(Object.assign({ type: 'bots/update', id: editingId }, payload));
    } else {
      vscode.postMessage(Object.assign({ type: 'bots/create' }, payload));
    }
  });

  window.addEventListener('message', function (event) {
    const msg = event.data || {};
    if (msg.type === 'form/load') {
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
      }
    }
  });

  vscode.postMessage({ type: 'form/ready' });
})();
