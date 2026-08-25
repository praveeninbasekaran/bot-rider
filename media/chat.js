(function () {
  const vscode = acquireVsCodeApi();
  const state = {
    bots: [],
    run: { round: 0, splitOpen: false, debateRunning: false, frozenBotIds: [], phase: 'idle' },
    splitOpen: false,
    lastHeaderRound: 0,
    current: null,
    positions: [],
    showedPickLine: false,
    showedStopLine: false,
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

  function botById(id) {
    return (state.bots || []).find(function (b) {
      return b.id === id;
    });
  }

  function botByHandle(handle) {
    const h = String(handle || '').toLowerCase();
    return (state.bots || []).find(function (b) {
      return b.handle === h;
    });
  }

  function avatarSvg(name, colorIndex) {
    const colors = ['#4fc1ff', '#c586c0', '#4ec9b0', '#dcdcaa', '#ce9178', '#9cdcfe', '#d7ba7d', '#f14c4c'];
    const color = colors[((colorIndex % colors.length) + colors.length) % colors.length];
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

  function renderPicker() {
    picker.replaceChildren();
    if (state.splitOpen) {
      return;
    }
    const match = input.value.match(/(?:^|\s)@([a-z0-9_-]*)$/i);
    if (!match) {
      return;
    }
    const q = match[1].toLowerCase();
    (state.bots || []).forEach(function (bot) {
      if (bot.handle.indexOf(q) !== 0) {
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
    const insert = '@' + handle + ' ';
    const m = v.match(/(?:^|\s)@[a-z0-9_-]*$/i);
    if (m) {
      const at = m[0].indexOf('@');
      const start = v.length - m[0].length + at;
      input.value = v.slice(0, start) + insert;
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

  function splitCopy(cause) {
    if (cause === 'continue') {
      return { title: 'No consensus', body: 'Still no consensus after the extra round.' };
    }
    if (cause === 'interrupt') {
      return { title: 'Debate paused', body: 'Debate paused. Positions so far:' };
    }
    return { title: 'No consensus', body: 'The swarm did not agree after two rounds.' };
  }

  function postPick(botId) {
    if (!botId) {
      return;
    }
    vscode.postMessage({ type: 'split/pick', botId: botId });
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
    const copy = splitCopy(msg.cause);
    const positions = msg.positions || [];
    state.positions = positions;
    let positionHtml = '';
    if (msg.cause === 'interrupt' || positions.length) {
      positionHtml =
        '<ul class="split-positions">' +
        positions
          .map(function (p) {
            return '<li><strong>@' + esc(p.handle) + '</strong> ' + esc(p.text || '') + '</li>';
          })
          .join('') +
        '</ul>';
    }
    card.innerHTML =
      '<h3>' +
      esc(copy.title) +
      '</h3><p>' +
      esc(copy.body) +
      '</p>' +
      positionHtml +
      '<div class="split-actions">' +
      '<button type="button" class="primary" id="split-continue">Continue</button>' +
      '<button type="button" id="split-pick">Pick a bot to decide</button>' +
      '<button type="button" class="secondary" id="split-stop">Stop</button></div>' +
      '<div id="split-pick-list" class="split-pick-list"></div>';
    card.querySelector('#split-continue').addEventListener('click', function () {
      vscode.postMessage({ type: 'split/continue' });
    });
    card.querySelector('#split-pick').addEventListener('click', function () {
      const choices = state.positions || [];
      if (choices.length === 1) {
        postPick(choices[0].botId);
        return;
      }
      const list = card.querySelector('#split-pick-list');
      list.replaceChildren();
      choices.forEach(function (p) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = '@' + p.handle;
        b.addEventListener('click', function () {
          postPick(p.botId);
        });
        list.appendChild(b);
      });
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

  function copilotBanner(status) {
    if (status === 'ready') {
      banner.classList.remove('visible');
      return;
    }
    banner.classList.add('visible');
    if (status === 'missing') {
      bannerText.textContent = 'GitHub Copilot is not available. Sign in to GitHub Copilot, then retry Send.';
    } else if (status === 'noPermissions') {
      bannerText.textContent = 'Bot Rider does not have permission to use GitHub Copilot yet.';
    } else if (status === 'hung') {
      bannerText.textContent = 'GitHub Copilot did not respond within 60 seconds. Stop is still available.';
    } else {
      bannerText.textContent = 'GitHub Copilot: ' + status;
    }
  }

  function maybeRoundHeader(turn, handle) {
    const round = (state.run && state.run.round) || 0;
    if (turn === 'direct') {
      const rh = document.createElement('div');
      rh.className = 'round-header';
      rh.textContent = 'SOLO · @' + handle;
      thread.appendChild(rh);
      return;
    }
    if (turn === 'propose' || turn === 'critique') {
      if (round && round !== state.lastHeaderRound) {
        state.lastHeaderRound = round;
        const rh = document.createElement('div');
        rh.className = 'round-header';
        rh.textContent = 'ROUND ' + round + ' · PROPOSE / CRITIQUE';
        thread.appendChild(rh);
      }
    }
  }

  window.addEventListener('message', function (event) {
    const msg = event.data || {};
    if (msg.type === 'bots/snapshot') {
      state.bots = msg.bots || [];
      renderPicker();
    } else if (msg.type === 'copilot/status') {
      copilotBanner(msg.status);
    } else if (msg.type === 'run/state') {
      const wasSplit = !!state.splitOpen;
      state.run = msg.state || state.run;
      state.splitOpen = !!(state.run && state.run.splitOpen);
      lockComposer();
      if (!state.splitOpen) {
        hideSplit();
      }
      if (
        wasSplit &&
        !state.splitOpen &&
        state.run.phase === 'idle' &&
        !state.run.debateRunning &&
        !state.showedStopLine
      ) {
        state.showedStopLine = true;
        appendNotice('Stopped without implementation.');
      }
      if (
        wasSplit &&
        state.run.phase === 'implement' &&
        state.run.currentBotId &&
        !state.showedPickLine
      ) {
        state.showedPickLine = true;
        const picked = botById(state.run.currentBotId);
        const name = picked ? picked.name : state.run.currentBotId;
        appendNotice(name + "'s position selected as the direction.");
      }
      if (state.splitOpen) {
        state.showedPickLine = false;
        state.showedStopLine = false;
      }
    } else if (msg.type === 'chat/turn-start') {
      if (msg.turn === 'implement') {
        return;
      }
      const bot = botById(msg.botId) || botByHandle(msg.handle) || {};
      maybeRoundHeader(msg.turn, msg.handle);
      const el = document.createElement('div');
      el.className = 'msg';
      const chips =
        '<span class="chips"><span class="chip" id="chip-think">thinking</span><span class="chip" id="chip-speak" style="display:none">speaking</span></span>';
      const inactive =
        msg.turn === 'direct' && bot.active === false
          ? '<div class="notice">' + esc((bot.name || msg.handle) + ' is inactive · answering this turn only.') + '</div>'
          : '';
      el.innerHTML =
        avatarSvg(bot.name || msg.handle, bot.colorIndex || 0) +
        '<div class="bubble"><div class="meta"><span>' +
        esc(bot.name || msg.handle) +
        '</span><span class="handle">@' +
        esc(msg.handle) +
        '</span>' +
        chips +
        '</div>' +
        inactive +
        '<div class="body"><pre class="body"></pre></div></div>';
      state.current = {
        botId: msg.botId,
        pre: el.querySelector('pre'),
        think: el.querySelector('#chip-think'),
        speak: el.querySelector('#chip-speak'),
      };
      thread.appendChild(el);
      thread.scrollTop = thread.scrollHeight;
    } else if (msg.type === 'chat/token') {
      if (state.current && state.current.pre && (!msg.botId || msg.botId === state.current.botId)) {
        state.current.pre.appendChild(document.createTextNode(msg.delta || ''));
        if (state.current.think) state.current.think.style.display = 'none';
        if (state.current.speak) state.current.speak.style.display = 'inline';
        thread.scrollTop = thread.scrollHeight;
      }
    } else if (msg.type === 'chat/turn-end') {
      if (msg.turn === 'implement') {
        return;
      }
      if (state.current && state.current.speak) state.current.speak.style.display = 'none';
      if (state.current && state.current.think) state.current.think.style.display = 'none';
      state.current = null;
    } else if (msg.type === 'chat/split') {
      state.splitOpen = true;
      lockComposer();
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
      const n = (msg.files || []).length;
      appendNotice('Proposed changes · ' + n + ' files');
    } else if (msg.type === 'changeset/cleared') {
      if (msg.reason === 'approve') {
        appendNotice('Approved · ' + msg.fileCount + ' files applied.');
      } else if (msg.reason === 'reject') {
        appendNotice('Rejected · proposed edits discarded.');
      }
    }
  });

  renderPicker();
  lockComposer();
})();
