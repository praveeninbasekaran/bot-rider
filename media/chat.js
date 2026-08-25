(function () {
  const vscode = acquireVsCodeApi();
  const state = {
    bots: [],
    splitOpen: false,
    debateRunning: false,
    lastRound: 0,
    currentPre: null,
  };

  const root = document.createElement('div');
  root.className = 'swarm';
  root.innerHTML =
    '<div id="banner" class="banner"><span id="banner-text"></span><button id="recheck" type="button">Sign in to GitHub Copilot</button></div>' +
    '<div id="thread" class="thread"></div>' +
    '<div class="composer-wrap">' +
    '<div id="picker" class="picker"></div>' +
    '<div class="composer"><textarea id="input" rows="2" placeholder="Message the swarm. Use @handle to lock a bot."></textarea><button id="send" class="send-btn" type="button">Send</button></div>' +
    '<div id="helper" class="helper"></div>' +
    '</div>';
  document.body.appendChild(root);

  const thread = document.getElementById('thread');
  const banner = document.getElementById('banner');
  const bannerText = document.getElementById('banner-text');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const picker = document.getElementById('picker');
  const helper = document.getElementById('helper');

  document.getElementById('recheck').addEventListener('click', function () {
    vscode.postMessage({ type: 'copilot/recheck' });
  });
  send.addEventListener('click', sendNow);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendNow();
    }
  });
  input.addEventListener('input', renderPicker);

  function sendNow() {
    const text = input.value.trim();
    if (!text || state.splitOpen) {
      return;
    }
    appendUser(text);
    vscode.postMessage({ type: 'chat/send', text: input.value });
    input.value = '';
    renderPicker();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function avatarSvg(name, colorIndex) {
    const colors = ['#4fc1ff', '#c586c0', '#4ec9b0', '#dcdcaa', '#ce9178', '#9cdcfe', '#d7ba7d', '#f14c4c'];
    const color = colors[((colorIndex % colors.length) + colors.length) % colors.length];
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    const ini = parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : (String(name).trim().slice(0, 2) || '?').toUpperCase();
    return (
      '<svg class="avatar" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="' +
      color +
      '"/><text x="12" y="16" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#ffffff">' +
      esc(ini) +
      '</text></svg>'
    );
  }

  function appendUser(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = '<div class="bubble"><div class="meta">You</div><div class="body">' + esc(text) + '</div></div>';
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
  }

  function renderPicker() {
    const q = (input.value.match(/(?:^|\s)@([a-z0-9_-]*)$/i) || [])[1];
    picker.replaceChildren();
    const bots = state.bots || [];
    bots.forEach(function (bot) {
      if (q !== undefined && bot.handle.indexOf(q.toLowerCase()) !== 0) {
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '@' + bot.handle;
      b.addEventListener('click', function () {
        insertHandle(bot.handle);
      });
      picker.appendChild(b);
    });
  }

  function insertHandle(handle) {
    const v = input.value;
    const m = v.match(/(?:^|\s)@[a-z0-9_-]*$/i);
    const insert = '@' + handle + ' ';
    if (m) {
      const start = v.length - m[0].length + (m[0][0] === '@' ? 0 : 1);
      const prefix = m[0][0] === '@' ? '' : m[0][0];
      input.value = v.slice(0, start) + prefix + insert;
    } else {
      input.value = v + (v && !/\s$/.test(v) ? ' ' : '') + insert;
    }
    input.focus();
    renderPicker();
  }

  function lockComposer() {
    const locked = !!state.splitOpen;
    input.disabled = locked;
    send.disabled = locked;
    helper.textContent = locked ? 'Resolve the split to send a new prompt.' : '';
  }

  function showSplit(msg) {
    let card = document.getElementById('split-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'split-card';
      card.className = 'split-card';
      thread.appendChild(card);
    }
    card.classList.add('visible');
    card.innerHTML =
      '<h3>' +
      esc(msg.title || 'No consensus') +
      '</h3><p>' +
      esc(msg.reason || '') +
      '</p><div class="split-actions">' +
      '<button type="button" id="split-continue">Continue</button>' +
      '<button type="button" id="split-pick">Pick a bot to decide</button>' +
      '<button type="button" class="secondary" id="split-stop">Stop</button></div>';
    card.querySelector('#split-continue').addEventListener('click', function () {
      vscode.postMessage({ type: 'split/continue' });
    });
    card.querySelector('#split-pick').addEventListener('click', function () {
      vscode.postMessage({ type: 'split/pick' });
    });
    card.querySelector('#split-stop').addEventListener('click', function () {
      vscode.postMessage({ type: 'chat/stop' });
    });
    thread.scrollTop = thread.scrollHeight;
  }

  function hideSplit() {
    const card = document.getElementById('split-card');
    if (card) {
      card.classList.remove('visible');
    }
  }

  window.addEventListener('message', function (event) {
    const msg = event.data || {};
    if (msg.type === 'bots/snapshot') {
      state.bots = msg.bots || [];
      renderPicker();
    } else if (msg.type === 'copilot/status') {
      if (msg.status === 'ready') {
        banner.classList.remove('visible');
      } else if (msg.status && msg.status !== 'settling') {
        banner.classList.add('visible');
        bannerText.textContent =
          msg.message ||
          (msg.status === 'missing'
            ? 'GitHub Copilot is required to send messages.'
            : 'GitHub Copilot: ' + msg.status);
      }
    } else if (msg.type === 'run/state') {
      state.splitOpen = !!(msg.state && msg.state.splitOpen);
      state.debateRunning = !!(msg.state && msg.state.debateRunning);
      lockComposer();
      if (!state.splitOpen) {
        hideSplit();
      }
    } else if (msg.type === 'chat/turn-start') {
      if (msg.round && msg.round !== state.lastRound) {
        state.lastRound = msg.round;
        const rh = document.createElement('div');
        rh.className = 'round-header';
        rh.textContent = 'Round ' + msg.round;
        thread.appendChild(rh);
      }
      const el = document.createElement('div');
      el.className = 'msg';
      const solo = msg.solo ? '<span>SOLO · @' + esc(msg.handle) + '</span>' : '';
      const chips =
        '<span class="chips"><span class="chip" id="chip-think">thinking</span><span class="chip" id="chip-speak" style="display:none">speaking</span></span>';
      el.innerHTML =
        avatarSvg(msg.name, msg.colorIndex) +
        '<div class="bubble"><div class="meta"><span>' +
        esc(msg.name) +
        '</span><span class="handle">@' +
        esc(msg.handle) +
        '</span>' +
        solo +
        chips +
        '</div>' +
        (msg.inactiveNotice ? '<div class="notice">' + esc(msg.inactiveNotice) + '</div>' : '') +
        '<div class="body"><pre class="body"></pre></div></div>';
      state.currentPre = el.querySelector('pre');
      state.think = el.querySelector('#chip-think');
      state.speak = el.querySelector('#chip-speak');
      thread.appendChild(el);
      thread.scrollTop = thread.scrollHeight;
    } else if (msg.type === 'chat/token') {
      if (state.currentPre) {
        state.currentPre.appendChild(document.createTextNode(msg.text || ''));
        if (state.think) state.think.style.display = 'none';
        if (state.speak) state.speak.style.display = 'inline';
        thread.scrollTop = thread.scrollHeight;
      }
    } else if (msg.type === 'chat/turn-end') {
      if (state.speak) state.speak.style.display = 'none';
      if (state.think) state.think.style.display = 'none';
      if (msg.text !== undefined && state.currentPre) {
        state.currentPre.textContent = msg.text;
      }
      state.currentPre = null;
    } else if (msg.type === 'chat/split') {
      showSplit(msg);
    } else if (msg.type === 'error') {
      const el = document.createElement('div');
      el.className = 'error';
      el.textContent = msg.message || msg.code;
      thread.appendChild(el);
      thread.scrollTop = thread.scrollHeight;
    } else if (msg.type === 'changeset/apply-failed') {
      const el = document.createElement('div');
      el.className = 'error';
      el.textContent = msg.message || '';
      thread.appendChild(el);
    } else if (msg.type === 'changeset/preview') {
      const el = document.createElement('div');
      el.className = 'notice';
      el.textContent = 'Proposed changes are ready in Review.';
      thread.appendChild(el);
    }
  });

  renderPicker();
  lockComposer();
})();
