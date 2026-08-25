(function () {
  const vscode = acquireVsCodeApi();
  const expandedPanel = document.body.classList.contains('expanded');
  const state = {
    bots: [],
    run: { round: 0, splitOpen: false, debateRunning: false, frozenBotIds: [], phase: 'idle' },
    copilotStatus: 'settling',
    expanded: false,
    splitOpen: false,
    debateRunning: false,
    lastPhaseKey: '',
    current: null,
    pendingSend: '',
    pickerIndex: 0,
    pickerOpen: false,
    previewFiles: [],
  };

  if (document.body.classList.contains('vscode-high-contrast')) {
    document.body.classList.add('high-contrast');
  }

  const root = document.createElement('div');
  root.className = 'swarm';
  root.innerHTML =
    '<div id="expand-banner" class="expand-banner"><span>Expanded in editor</span><button id="focus-expanded" type="button">Focus</button></div>' +
    '<div id="banner" class="banner"><span id="banner-text"></span><button id="recheck" type="button">Sign in to GitHub Copilot</button></div>' +
    '<div id="empty" class="empty-pane" hidden></div>' +
    '<div id="thread" class="thread" role="log" aria-live="polite"></div>' +
    '<div id="live" class="sr-only" aria-live="polite"></div>' +
    '<div class="composer-wrap">' +
    '<div id="picker" class="picker" role="listbox"></div>' +
    '<div class="composer"><textarea id="input" rows="2" placeholder="Message the swarm. Use @handle to lock a bot."></textarea><button id="send" class="send-btn" type="button">Send</button></div>' +
    '<div id="helper" class="helper"></div>' +
    '</div>';
  document.body.appendChild(root);

  const thread = document.getElementById('thread');
  const empty = document.getElementById('empty');
  const banner = document.getElementById('banner');
  const bannerText = document.getElementById('banner-text');
  const expandBanner = document.getElementById('expand-banner');
  const live = document.getElementById('live');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const picker = document.getElementById('picker');
  const helper = document.getElementById('helper');
  const recheck = document.getElementById('recheck');

  document.getElementById('focus-expanded').addEventListener('click', function () {
    vscode.postMessage({ type: 'ui/focus-expanded' });
  });
  recheck.addEventListener('click', function () {
    vscode.postMessage({ type: 'copilot/recheck' });
  });
  send.addEventListener('click', onSendOrStop);
  input.addEventListener('keydown', onKey);
  input.addEventListener('input', function () {
    renderPicker();
    renderEmpty();
  });

  setTimeout(function () {
    if (state.copilotStatus === 'settling') {
      state.copilotStatus = 'noPermissions';
      renderCopilot();
    }
  }, 3000);

  function onSendOrStop() {
    if (state.debateRunning) {
      vscode.postMessage({ type: 'chat/stop' });
      return;
    }
    sendNow();
  }

  function onKey(e) {
    if (state.pickerOpen) {
      const rows = picker.querySelectorAll('.picker-row');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.pickerIndex = Math.min(state.pickerIndex + 1, Math.max(0, rows.length - 1));
        highlightPicker();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.pickerIndex = Math.max(state.pickerIndex - 1, 0);
        highlightPicker();
        return;
      }
      if (e.key === 'Enter' && rows.length) {
        e.preventDefault();
        const target = rows[state.pickerIndex] || rows[0];
        insertHandle(target.getAttribute('data-handle'));
        return;
      }
      if (e.key === 'Tab' && rows.length) {
        e.preventDefault();
        insertHandle(rows[0].getAttribute('data-handle'));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePicker();
        return;
      }
    }
    const sendCombo = e.key === 'Enter' && (e.metaKey || e.ctrlKey);
    if (sendCombo || (e.key === 'Enter' && !e.shiftKey && !e.isComposing)) {
      e.preventDefault();
      onSendOrStop();
    }
  }

  function sendNow() {
    const text = input.value.trim();
    if (!text || state.splitOpen || state.debateRunning || state.copilotStatus !== 'ready') {
      return;
    }
    state.pendingSend = input.value;
    vscode.postMessage({ type: 'chat/send', text: input.value });
    renderPicker();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function avatarSvg(name, colorIndex) {
    const colors = ['#4fc1ff', '#c586c0', '#4ec9b0', '#dcdcaa', '#ce9178', '#9cdcfe', '#d7ba7d', '#f14c4c'];
    const color = colors[(((colorIndex % 8) + 8) % 8)];
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    const ini =
      parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : (String(name).trim().slice(0, 2) || '?').toUpperCase();
    return (
      '<svg class="avatar" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="' +
      color +
      '"/><text x="12" y="16" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#ffffff">' +
      esc(ini) +
      '</text></svg>'
    );
  }

  function activeBots() {
    return (state.bots || []).filter(function (b) {
      return b.active;
    });
  }

  function announce(text) {
    live.textContent = text;
  }

  function appendUser(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = '<div class="bubble"><div class="meta">You</div><div class="body">' + esc(text) + '</div></div>';
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
  }

  function appendNotice(text) {
    const el = document.createElement('div');
    el.className = 'notice';
    el.textContent = text;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
  }

  function markInterrupted() {
    if (!state.current) {
      return;
    }
    const host = state.current.el || (state.current.pre && state.current.pre.closest('.msg'));
    if (!host || host.querySelector('.interrupted')) {
      return;
    }
    if (state.current.speak) state.current.speak.style.display = 'none';
    if (state.current.think) state.current.think.style.display = 'none';
    const note = document.createElement('div');
    note.className = 'notice interrupted';
    note.textContent = 'Interrupted';
    const bubble = host.querySelector('.bubble') || host;
    bubble.appendChild(note);
    thread.scrollTop = thread.scrollHeight;
  }

  function closePicker() {
    state.pickerOpen = false;
    picker.classList.remove('open');
    picker.replaceChildren();
  }

  function highlightPicker() {
    const rows = picker.querySelectorAll('.picker-row');
    rows.forEach(function (row, i) {
      row.classList.toggle('active', i === state.pickerIndex);
    });
  }

  function renderPicker() {
    const match = input.value.match(/(?:^|\s)@([A-Za-z0-9_-]*)$/);
    picker.replaceChildren();
    if (!match || state.splitOpen || state.debateRunning) {
      closePicker();
      return;
    }
    const q = match[1].toLowerCase();
    const bots = (state.bots || []).slice().sort(function (a, b) {
      return Number(b.active) - Number(a.active);
    });
    const filtered = bots.filter(function (bot) {
      const hay = (bot.handle + ' ' + bot.name + ' ' + bot.role).toLowerCase();
      return !q || hay.indexOf(q) !== -1;
    });
    state.pickerOpen = true;
    picker.classList.add('open');
    if (!filtered.length) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'picker-empty';
      emptyRow.textContent = 'No matching bot';
      picker.appendChild(emptyRow);
      return;
    }
    filtered.forEach(function (bot, i) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'picker-row' + (bot.active ? '' : ' inactive');
      b.setAttribute('data-handle', bot.handle);
      b.setAttribute('role', 'option');
      b.innerHTML =
        avatarSvg(bot.name, bot.colorIndex) +
        '<span class="picker-meta"><span class="handle">@' +
        esc(bot.handle) +
        '</span><span>' +
        esc(bot.name) +
        '</span><span>' +
        esc(bot.role || '') +
        '</span>' +
        (bot.active ? '' : '<span>Inactive</span>') +
        '</span>';
      b.addEventListener('click', function () {
        insertHandle(bot.handle);
      });
      picker.appendChild(b);
      if (i === 0) {
        b.classList.add('active');
      }
    });
    state.pickerIndex = 0;
  }

  function insertHandle(handle) {
    if (!handle) {
      return;
    }
    const v = input.value;
    const insert = '@' + handle + ' ';
    const m = v.match(/(?:^|\s)@[A-Za-z0-9_-]*$/);
    if (m) {
      const at = m[0].indexOf('@');
      const start = v.length - m[0].length + at;
      input.value = v.slice(0, start) + insert;
    } else {
      input.value = v + (v && !/\s$/.test(v) ? ' ' : '') + insert;
    }
    input.focus();
    closePicker();
  }

  function lockComposer() {
    const ready = state.copilotStatus === 'ready';
    const locked = !ready || !!state.splitOpen || !!state.debateRunning;
    input.disabled = locked;
    if (state.debateRunning) {
      send.disabled = false;
      send.textContent = 'Stop';
      input.placeholder = 'Debate running…';
      helper.textContent = '';
    } else if (state.splitOpen) {
      send.disabled = true;
      send.textContent = 'Send';
      input.placeholder = 'Message the swarm. Use @handle to lock a bot.';
      helper.textContent = 'Resolve the split to send a new prompt.';
    } else {
      send.disabled = locked;
      send.textContent = 'Send';
      input.placeholder = ready && activeBots().length === 0
        ? 'Activate a bot, or @mention one.'
        : 'Message the swarm. Use @handle to lock a bot.';
      helper.textContent = '';
    }
  }

  function renderCopilot() {
    const status = state.copilotStatus;
    banner.classList.remove('visible');
    empty.hidden = true;
    if (status === 'ready') {
      renderEmpty();
      lockComposer();
      return;
    }
    if (status === 'settling') {
      empty.hidden = false;
      empty.innerHTML = '<h2>Getting Copilot ready…</h2><p>Checking GitHub Copilot in VS Code.</p>';
      lockComposer();
      return;
    }
    empty.hidden = false;
    if (status === 'missing') {
      empty.innerHTML =
        '<h2>No Copilot models available</h2><p>VS Code returned no models. Check Copilot Chat is enabled and you have access.</p><button type="button" id="empty-retry">Retry</button>';
      empty.querySelector('#empty-retry').addEventListener('click', function () {
        vscode.postMessage({ type: 'copilot/recheck' });
      });
    } else if (status === 'quota') {
      banner.classList.add('visible');
      bannerText.textContent = 'Copilot rate or quota limit reached. Wait and try again.';
      recheck.textContent = 'Retry';
      empty.hidden = true;
    } else if (status === 'blocked') {
      banner.classList.add('visible');
      bannerText.textContent = 'Copilot declined this request.';
      recheck.textContent = 'Retry';
      empty.hidden = true;
    } else if (status === 'notFound') {
      banner.classList.add('visible');
      bannerText.textContent = 'Copilot model is unavailable.';
      recheck.textContent = 'Retry';
      empty.hidden = true;
    } else if (status === 'hung') {
      banner.classList.add('visible');
      bannerText.textContent = 'GitHub Copilot did not respond within 60 seconds. Stop is still available.';
      empty.hidden = true;
    } else {
      empty.innerHTML =
        '<h2>GitHub Copilot is not signed in</h2><p>Bot Rider uses Copilot models locally through VS Code.</p><button type="button" id="empty-signin">Sign in to GitHub Copilot</button>';
      empty.querySelector('#empty-signin').addEventListener('click', function () {
        vscode.postMessage({ type: 'copilot/recheck' });
      });
    }
    lockComposer();
  }

  function renderEmpty() {
    if (state.copilotStatus !== 'ready') {
      return;
    }
    if (thread.childElementCount > 0) {
      empty.hidden = true;
      return;
    }
    if (activeBots().length === 0) {
      empty.hidden = false;
      empty.innerHTML =
        '<h2>No active bots</h2><p>No active bots. Toggle a bot on in Bots, or @mention a bot for a solo turn.</p>';
    } else {
      empty.hidden = true;
    }
  }

  function renderExpand() {
    if (expandedPanel) {
      expandBanner.classList.remove('visible');
      return;
    }
    expandBanner.classList.toggle('visible', !!state.expanded);
  }

  function maybePhaseHeader(turn, handle, round) {
    const n = round || (state.run && state.run.round) || 0;
    if (turn === 'direct') {
      const rh = document.createElement('div');
      rh.className = 'round-header';
      rh.textContent = 'SOLO · @' + handle;
      thread.appendChild(rh);
      return;
    }
    if (turn === 'propose' || turn === 'critique') {
      const key = n + ':' + turn;
      if (key === state.lastPhaseKey) {
        return;
      }
      state.lastPhaseKey = key;
      const rh = document.createElement('div');
      rh.className = 'round-header';
      rh.textContent = 'ROUND ' + n + ' · ' + (turn === 'propose' ? 'PROPOSE' : 'CRITIQUE');
      thread.appendChild(rh);
    }
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
    const paused = !!msg.paused || (msg.title && /paused/i.test(msg.title));
    const title = msg.title || (paused ? 'Debate paused' : 'No consensus');
    const body =
      msg.reason ||
      (paused ? 'Debate paused. Positions so far:' : 'The swarm did not agree after two rounds.');
    const positions = msg.positions || [];
    const positionHtml =
      '<ul class="split-positions">' +
      positions
        .map(function (p) {
          return '<li><strong>@' + esc(p.handle) + '</strong> ' + esc(p.text || '') + '</li>';
        })
        .join('') +
      '</ul>';
    card.innerHTML =
      '<h3>' +
      esc(title) +
      '</h3><p>' +
      esc(body) +
      '</p>' +
      positionHtml +
      '<div class="split-actions">' +
      '<button type="button" id="split-continue">Continue</button>' +
      '<button type="button" id="split-pick">Pick a bot to decide</button>' +
      '<button type="button" class="secondary" id="split-stop">Stop</button></div>';
    const continueBtn = card.querySelector('#split-continue');
    continueBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'split/continue' });
    });
    card.querySelector('#split-pick').addEventListener('click', function () {
      vscode.postMessage({ type: 'ui/pick' });
    });
    card.querySelector('#split-stop').addEventListener('click', function () {
      vscode.postMessage({ type: 'chat/stop' });
    });
    continueBtn.focus();
    thread.scrollTop = thread.scrollHeight;
  }

  function hideSplit() {
    const card = document.getElementById('split-card');
    if (card) {
      card.remove();
    }
  }

  function unknownCopy(message) {
    const raw = String(message || '');
    const m = raw.match(/No bot named @?(.+)\.?$/);
    const token = m ? m[1].replace(/^"|"$/g, '').replace(/\.$/, '') : raw;
    return 'No bot named "' + token + '".';
  }

  function showFiles(files) {
    state.previewFiles = files || [];
    const n = state.previewFiles.length;
    const wrap = document.createElement('div');
    wrap.className = 'files-banner';
    const label = document.createElement('span');
    label.textContent = 'Proposed changes · ' + (n === 1 ? '1 file' : n + ' files');
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'review-link';
    link.textContent = 'Review';
    link.addEventListener('click', function () {
      const first = state.previewFiles[0];
      if (first) {
        vscode.postMessage({ type: 'review/open-diff', path: first.path, op: first.op });
      }
    });
    wrap.appendChild(label);
    wrap.appendChild(link);
    thread.appendChild(wrap);
    thread.scrollTop = thread.scrollHeight;
  }

  window.addEventListener('message', function (event) {
    const msg = event.data || {};
    if (msg.type === 'bots/snapshot') {
      state.bots = msg.bots || [];
      renderPicker();
      renderEmpty();
      lockComposer();
    } else if (msg.type === 'ui/expanded') {
      state.expanded = !!msg.expanded;
      renderExpand();
    } else if (msg.type === 'copilot/status') {
      state.copilotStatus = msg.status || state.copilotStatus;
      if (msg.message && msg.status !== 'ready' && msg.status !== 'missing' && msg.status !== 'noPermissions') {
        banner.classList.add('visible');
        bannerText.textContent = msg.message;
      }
      renderCopilot();
    } else if (msg.type === 'run/state') {
      state.run = msg.state || state.run;
      state.splitOpen = !!(state.run && state.run.splitOpen);
      state.debateRunning = !!(state.run && state.run.debateRunning);
      if (state.debateRunning && state.pendingSend) {
        appendUser(state.pendingSend);
        input.value = '';
        state.pendingSend = '';
        closePicker();
      }
      lockComposer();
      if (!state.splitOpen) {
        hideSplit();
      }
      renderEmpty();
    } else if (msg.type === 'chat/turn-start') {
      if (msg.turn === 'implement' || msg.turn === 'consensus') {
        return;
      }
      maybePhaseHeader(msg.turn, msg.handle, msg.round);
      const el = document.createElement('div');
      el.className = 'msg';
      const solo = msg.solo ? '<span>SOLO · @' + esc(msg.handle) + '</span>' : '';
      const chips =
        '<span class="chips"><span class="chip think">thinking</span><span class="chip speak" style="display:none">speaking</span></span>';
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
      state.current = {
        botId: msg.botId,
        name: msg.name,
        el: el,
        pre: el.querySelector('pre'),
        think: el.querySelector('.think'),
        speak: el.querySelector('.speak'),
      };
      announce(msg.name + ' is thinking');
      thread.appendChild(el);
      empty.hidden = true;
      thread.scrollTop = thread.scrollHeight;
    } else if (msg.type === 'chat/token') {
      if (state.current && state.current.pre && (!msg.botId || msg.botId === state.current.botId)) {
        state.current.pre.appendChild(document.createTextNode(msg.delta || ''));
        if (state.current.think) state.current.think.style.display = 'none';
        if (state.current.speak) state.current.speak.style.display = 'inline';
        announce((state.current.name || 'Bot') + ' is speaking');
        thread.scrollTop = thread.scrollHeight;
      }
    } else if (msg.type === 'chat/turn-end') {
      if (state.current && state.current.speak) state.current.speak.style.display = 'none';
      if (state.current && state.current.think) state.current.think.style.display = 'none';
      if (msg.text !== undefined && state.current && state.current.pre) {
        state.current.pre.textContent = msg.text;
      }
      announce((state.current && state.current.name ? state.current.name : 'Bot') + ' finished');
      state.current = null;
    } else if (msg.type === 'chat/split') {
      if (msg.paused) {
        markInterrupted();
      }
      state.splitOpen = true;
      lockComposer();
      showSplit(msg);
    } else if (msg.type === 'chat/notice') {
      if (msg.text === 'Interrupted') {
        markInterrupted();
      } else {
        hideSplit();
        appendNotice(msg.text || '');
      }
    } else if (msg.type === 'error') {
      const el = document.createElement('div');
      el.className = 'error';
      el.setAttribute('role', 'alert');
      if (msg.code === 'unknown-handle') {
        el.textContent = unknownCopy(msg.message);
      } else if (msg.code === 'zero-active') {
        el.textContent = 'Activate a bot or @mention one.';
      } else {
        el.textContent = msg.message || msg.code;
      }
      thread.appendChild(el);
      thread.scrollTop = thread.scrollHeight;
    } else if (msg.type === 'changeset/apply-failed') {
      const el = document.createElement('div');
      el.className = 'error';
      el.setAttribute('role', 'alert');
      el.textContent = msg.message || '';
      thread.appendChild(el);
    } else if (msg.type === 'changeset/preview') {
      showFiles(msg.files || []);
    }
  });

  renderCopilot();
  renderExpand();
  lockComposer();
})();
