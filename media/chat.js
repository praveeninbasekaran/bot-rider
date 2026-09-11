(function () {
  const vscode = acquireVsCodeApi();
  const expandedPanel = document.body.classList.contains('expanded');
  const state = {
    bots: [],
    run: { round: 0, splitOpen: false, debateRunning: false, frozenBotIds: [], phase: 'idle' },
    copilotStatus: 'settling',
    scheduler: { maxConcurrent: 4, requests: [] },
    expanded: false,
    splitOpen: false,
    debateRunning: false,
    lastPhaseKey: '',
    lastTurn: '',
    current: null,
    flights: {},
    pendingSend: '',
    pickerIndex: 0,
    pickerOpen: false,
    previewFiles: [],
    pendingMcpActions: [],
    mcpFailedMessage: '',
    board: null,
    boardCollapsed: false,
    todosExpanded: false,
    lastBoardGoal: '',
    runType: 'debate',
    workBatch: false,
    completedBots: {},
    announced: {},
    lastArguePath: '',
    lastArgueRoundKey: '',
    onboarding: { open: false, complete: false, sampleTask: '' },
    maxVisibleArticles: 3,
    expandedArticles: [],
    decision: null,
    synthesis: null,
    a11yQueue: [],
    a11yTimer: null,
    lastError: '',
    articleSequence: 0,
    recovery: null,
  };

  if (document.body.classList.contains('vscode-high-contrast')) {
    document.body.classList.add('high-contrast');
  }

  const root = document.createElement('div');
  root.className = 'swarm';
  root.innerHTML =
    '<div id="expand-banner" class="expand-banner"><span>Expanded in editor</span><button id="focus-expanded" type="button">Focus</button></div>' +
    '<div id="banner" class="banner"><span id="banner-text"></span><button id="recheck" type="button">Sign in to GitHub Copilot</button></div>' +
    '<div id="scheduler-status" class="scheduler-status" hidden></div>' +
    '<div id="context-status" class="scheduler-status" hidden></div>' +
    '<section id="onboarding" class="onboarding" hidden aria-label="Getting started">' +
    '<div class="onboarding-head"><strong>Getting started</strong><button id="onboarding-dismiss" type="button" class="review-link">Hide</button></div>' +
    '<p id="onboarding-copilot">Checking GitHub Copilot…</p>' +
    '<p><strong>Spec</strong> defines requirements and acceptance. <strong>Dispatcher</strong> proposes dependency-aware assignments. Both are protected core bots.</p>' +
    '<p><strong>Debate</strong> compares ideas. <strong>Work</strong> runs Spec, Dispatcher, then ready workers.</p>' +
    '<div class="onboarding-actions"><button type="button" data-worker-template="coder">Add Coder</button><button type="button" data-worker-template="reviewer">Add Reviewer</button><button type="button" data-worker-template="writer">Add Writer</button><button id="onboarding-sample" type="button">Use sample task</button></div>' +
    '<p>When work is proposed, open <strong>Proposed Changes</strong>. Review Files as diffs/previews and approve MCP actions separately.</p>' +
    '<div class="onboarding-actions"><button id="onboarding-files" type="button">Open Files review</button><button id="onboarding-mcp" type="button">Open MCP review</button></div>' +
    '</section>' +
    '<section id="recovery" class="onboarding recovery" hidden aria-label="Recovered work"></section>' +
    '<div id="empty" class="empty-pane" hidden></div>' +
    '<section id="run-board" class="run-board" hidden aria-label="Run">' +
    '<button type="button" id="run-board-toggle" class="run-board-toggle" aria-expanded="true">' +
    '<span id="run-board-label" class="run-board-label">Run</span>' +
    '<span id="run-board-summary" class="run-board-summary" hidden>' +
    '<span id="run-board-summary-goal" class="run-board-summary-goal"></span>' +
    '<span id="run-board-summary-count" class="run-board-summary-count"></span>' +
    '</span></button>' +
    '<div id="run-board-body" class="run-board-body"></div>' +
    '</section>' +
    '<section id="activity-timeline" class="activity-timeline" hidden aria-label="Activity"><strong>Activity</strong><div id="activity-list" role="list"></div></section>' +
    '<section id="synthesis-card" class="summary-card synthesis-card" hidden aria-label="Synthesis"></section>' +
    '<section id="decision-card" class="summary-card decision-card" hidden aria-label="Decision"></section>' +
    '<div id="thread" class="thread" role="log" aria-live="off"></div>' +
    '<div id="live" class="sr-only" aria-live="polite"></div>' +
    '<div id="run-board-goal-live" class="sr-only" aria-live="polite"></div>' +
    '<div class="composer-wrap">' +
    '<div id="picker" class="picker" role="listbox"></div>' +
    '<div class="composer"><textarea id="input" rows="2" placeholder="Message the swarm. Use @handle to lock a bot."></textarea>' +
    '<div id="run-type" class="run-type" role="radiogroup" aria-label="Debate">' +
    '<button type="button" id="run-type-work" class="run-type-btn" role="radio" aria-checked="false" data-run-type="work">Work</button>' +
    '<button type="button" id="run-type-debate" class="run-type-btn is-selected" role="radio" aria-checked="true" data-run-type="debate">Debate</button>' +
    '</div>' +
    '<button id="send" class="send-btn" type="button">Send</button>' +
    '<button id="work-stop" class="send-btn work-stop" type="button" hidden>Stop</button></div>' +
    '<div id="helper" class="helper"></div>' +
    '</div>';
  document.body.appendChild(root);

  const thread = document.getElementById('thread');
  const empty = document.getElementById('empty');
  const banner = document.getElementById('banner');
  const bannerText = document.getElementById('banner-text');
  const schedulerStatus = document.getElementById('scheduler-status');
  const contextStatus = document.getElementById('context-status');
  const onboarding = document.getElementById('onboarding');
  const recovery = document.getElementById('recovery');
  const onboardingCopilot = document.getElementById('onboarding-copilot');
  const expandBanner = document.getElementById('expand-banner');
  const live = document.getElementById('live');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const workStop = document.getElementById('work-stop');
  const runTypeGroup = document.getElementById('run-type');
  const runTypeWork = document.getElementById('run-type-work');
  const runTypeDebate = document.getElementById('run-type-debate');
  const picker = document.getElementById('picker');
  const helper = document.getElementById('helper');
  const recheck = document.getElementById('recheck');
  const runBoard = document.getElementById('run-board');
  const runBoardToggle = document.getElementById('run-board-toggle');
  const runBoardLabel = document.getElementById('run-board-label');
  const runBoardSummary = document.getElementById('run-board-summary');
  const runBoardSummaryGoal = document.getElementById('run-board-summary-goal');
  const runBoardSummaryCount = document.getElementById('run-board-summary-count');
  const runBoardBody = document.getElementById('run-board-body');
  const boardGoalLive = document.getElementById('run-board-goal-live');
  const activityTimeline = document.getElementById('activity-timeline');
  const activityList = document.getElementById('activity-list');
  const synthesisCard = document.getElementById('synthesis-card');
  const decisionCard = document.getElementById('decision-card');

  const PACK_OVERFLOW_COPY =
    "Prompt doesn't fit Copilot\nThe minimum context for this turn is larger than Copilot's window.\nShorten the prompt or shrink the active editor. Required context was not dropped.";

  function paintScheduler(snapshot) {
    state.scheduler = snapshot || { maxConcurrent: 4, requests: [] };
    const requests = Array.isArray(state.scheduler.requests) ? state.scheduler.requests : [];
    const queued = requests.filter((item) => item.state === 'queued').length;
    const active = requests.filter((item) => item.state === 'inFlight').length;
    const retrying = requests.filter((item) => item.state === 'retrying').length;
    schedulerStatus.hidden = true;
    schedulerStatus.textContent =
      'Copilot · ' + active + '/' + state.scheduler.maxConcurrent + ' active' +
      (queued ? ' · ' + queued + ' queued' : '') +
      (retrying ? ' · ' + retrying + ' retrying' : '');
    renderActivityTimeline();
  }

  function activityRows() {
    const rows = {};
    const rank = { completed: 1, blocked: 2, queued: 3, retrying: 4, inFlight: 5, speaking: 6, failed: 7 };
    function put(id, handle, status, detail) {
      const key = id || handle;
      if (!key || (rows[key] && rank[rows[key].status] > rank[status])) return;
      rows[key] = { id: id || '', handle: handle || id || 'bot', status: status, detail: detail || '' };
    }
    const requests = (state.scheduler && state.scheduler.requests) || [];
    requests.forEach(function (item) {
      put(item.botId, item.handle, item.state, item.state === 'queued' ? 'waiting for Copilot' : item.state);
    });
    const todos = (state.board && state.board.todos) || [];
    todos.forEach(function (todo) {
      const match = String(todo.text || '').match(/@([a-z0-9][a-z0-9_-]*)/i);
      if (/blocked:/i.test(todo.text || '')) {
        put('', match && match[1], 'blocked', String(todo.text).split(/blocked:/i)[1] || 'dependency');
      }
    });
    Object.keys(state.completedBots).forEach(function (id) {
      const bot = state.bots.find(function (item) { return item.id === id; });
      put(id, bot && bot.handle, 'completed', 'settled');
    });
    Object.keys(state.flights).forEach(function (id) {
      const flight = state.flights[id];
      put(id, flight && flight.handle, 'speaking', flight && flight.turn);
    });
    if (state.lastError) {
      put('system', 'swarm', 'failed', state.lastError);
    }
    return Object.keys(rows).map(function (key) { return rows[key]; }).sort(function (a, b) {
      return a.handle.localeCompare(b.handle);
    });
  }

  function renderActivityTimeline() {
    const rows = activityRows();
    activityTimeline.hidden = rows.length === 0;
    activityList.replaceChildren();
    rows.forEach(function (row) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'activity-row status-' + row.status;
      button.setAttribute('role', 'listitem');
      button.setAttribute('data-bot-id', row.id);
      button.textContent = '@' + row.handle + ' · ' + row.status + (row.detail ? ' · ' + row.detail.trim() : '');
      button.addEventListener('click', function () {
        const matches = row.id ? thread.querySelectorAll('[data-bot-id="' + row.id + '"]') : [];
        const article = matches.length ? matches[matches.length - 1] : null;
        if (article) {
          setArticleExpanded(article, true);
          article.focus();
          article.scrollIntoView({ block: 'nearest' });
        }
      });
      activityList.appendChild(button);
    });
  }

  function setArticleExpanded(article, expanded) {
    if (!article) return;
    const toggle = article.querySelector('.article-toggle');
    const body = article.querySelector('.article-body');
    if (!toggle || !body) return;
    const id = article.getAttribute('data-article-id');
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    body.hidden = !expanded;
    state.expandedArticles = state.expandedArticles.filter(function (item) { return item !== id; });
    if (expanded) {
      state.expandedArticles.push(id);
      while (state.expandedArticles.length > state.maxVisibleArticles) {
        const oldest = state.expandedArticles.shift();
        const previous = thread.querySelector('[data-article-id="' + oldest + '"]');
        if (previous && previous !== article) setArticleExpanded(previous, false);
      }
    }
  }

  function paintSynthesis(synthesis) {
    state.synthesis = synthesis || null;
    synthesisCard.hidden = !synthesis;
    synthesisCard.replaceChildren();
    if (!synthesis) return;
    const title = document.createElement('strong');
    title.textContent = 'Synthesis · @' + synthesis.handle;
    const body = document.createElement('div');
    body.className = 'article-body';
    paintArticle(body, synthesis.text || '');
    synthesisCard.appendChild(title);
    synthesisCard.appendChild(body);
    announceOnce('Synthesis ready');
  }

  function paintDecision(decision) {
    state.decision = decision || null;
    decisionCard.hidden = !decision;
    decisionCard.replaceChildren();
    if (!decision) return;
    const title = document.createElement('strong');
    title.textContent = decision.status === 'accepted' ? 'Decision accepted' : 'Decision needs you';
    const recommendation = document.createElement('p');
    recommendation.textContent = decision.recommendation || '';
    decisionCard.appendChild(title);
    decisionCard.appendChild(recommendation);
    if (decision.dissentSummary) {
      const dissent = document.createElement('p');
      dissent.className = 'decision-dissent';
      dissent.textContent = decision.dissentSummary;
      decisionCard.appendChild(dissent);
    }
    announceOnce(title.textContent);
  }

  document.getElementById('focus-expanded').addEventListener('click', function () {
    vscode.postMessage({ type: 'ui/focus-expanded' });
  });
  recheck.addEventListener('click', function () {
    vscode.postMessage({ type: 'copilot/recheck' });
  });
  document.getElementById('onboarding-dismiss').addEventListener('click', function () {
    vscode.postMessage({ type: 'onboarding/dismiss' });
  });
  document.getElementById('onboarding-sample').addEventListener('click', function () {
    input.value = state.onboarding.sampleTask || '';
    input.focus();
  });
  document.getElementById('onboarding-files').addEventListener('click', function () {
    vscode.postMessage({ type: 'ui/focus-review-files' });
  });
  document.getElementById('onboarding-mcp').addEventListener('click', function () {
    vscode.postMessage({ type: 'ui/focus-review-mcp' });
  });
  root.querySelectorAll('[data-worker-template]').forEach(function (button) {
    button.addEventListener('click', function () {
      vscode.postMessage({ type: 'onboarding/template', template: button.getAttribute('data-worker-template') });
    });
  });
  runBoardToggle.addEventListener('click', function () {
    if (runBoard.hidden) {
      return;
    }
    state.boardCollapsed = !state.boardCollapsed;
    paintBoard(state.board);
  });
  send.addEventListener('click', onSendOrStop);
  workStop.addEventListener('click', function () {
    vscode.postMessage({ type: 'chat/stop' });
  });
  runTypeWork.addEventListener('click', function () {
    setRunType('work');
  });
  runTypeDebate.addEventListener('click', function () {
    setRunType('debate');
  });
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

  function selectedRunType() {
    return state.runType === 'work' ? 'work' : 'debate';
  }

  function setRunType(next) {
    state.runType = next === 'work' ? 'work' : 'debate';
    paintRunType();
  }

  function paintRunType() {
    const selected = selectedRunType();
    const workOn = selected === 'work';
    runTypeGroup.setAttribute('aria-label', workOn ? 'Work' : 'Debate');
    runTypeWork.classList.toggle('is-selected', workOn);
    runTypeDebate.classList.toggle('is-selected', !workOn);
    runTypeWork.setAttribute('aria-checked', workOn ? 'true' : 'false');
    runTypeDebate.setAttribute('aria-checked', workOn ? 'false' : 'true');
  }

  function onSendOrStop() {
    if (state.debateRunning && !state.workBatch && !isArgueRun()) {
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
    if (!text || state.splitOpen || state.debateRunning && !state.workBatch && !isArgueRun() || state.copilotStatus !== 'ready') {
      return;
    }
    const runType = selectedRunType();
    vscode.postMessage({ type: 'chat/send', text: input.value, runType: runType });
    const appendImmediately = state.workBatch || isArgueRun() || !state.debateRunning;
    if (appendImmediately) {
      appendUser(input.value);
      input.value = '';
      state.pendingSend = '';
      closePicker();
    }
    renderPicker();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function appendInline(el, text) {
    const parts = String(text).split('`');
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1 && i < parts.length - 1) {
        const code = document.createElement('code');
        code.className = 'article-inline';
        code.textContent = parts[i];
        el.appendChild(code);
      } else if (parts[i]) {
        el.appendChild(document.createTextNode(parts[i]));
      }
    }
  }

  function splitArticleBlocks(text) {
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        const inner = [];
        i += 1;
        while (i < lines.length && !/^\s*```/.test(lines[i])) {
          inner.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) {
          i += 1;
        }
        blocks.push({ kind: 'fence', body: inner.join('\n') });
        continue;
      }
      const trimmed = line.trim();
      if (!trimmed) {
        i += 1;
        continue;
      }
      const heading = trimmed.match(/^#{1,3}(?!#)\s*(.*)$/);
      if (heading) {
        const sentence = (heading[1] || '').trim();
        if (sentence) {
          blocks.push({ kind: 'heading', text: sentence });
        }
        i += 1;
        continue;
      }
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
        const items = [];
        while (i < lines.length) {
          const item = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
          if (!item) {
            break;
          }
          items.push((item[1] || '').trim());
          i += 1;
        }
        if (items.length) {
          blocks.push({ kind: 'list', items: items });
        }
        continue;
      }
      blocks.push({ kind: 'para', text: trimmed });
      i += 1;
    }
    return blocks;
  }

  function paintArticle(host, text) {
    host.replaceChildren();
    const blocks = splitArticleBlocks(text);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.kind === 'fence') {
        const pre = document.createElement('pre');
        pre.className = 'article-fence';
        pre.textContent = block.body;
        host.appendChild(pre);
        continue;
      }
      if (block.kind === 'heading') {
        const p = document.createElement('p');
        p.className = 'article-heading';
        appendInline(p, block.text);
        host.appendChild(p);
        continue;
      }
      if (block.kind === 'list') {
        const ul = document.createElement('ul');
        ul.className = 'article-list';
        for (let j = 0; j < block.items.length; j++) {
          const li = document.createElement('li');
          appendInline(li, block.items[j]);
          ul.appendChild(li);
        }
        host.appendChild(ul);
        continue;
      }
      const p = document.createElement('p');
      p.className = 'article-p';
      appendInline(p, block.text);
      host.appendChild(p);
    }
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
    const value = String(text || '').trim();
    if (!value || state.a11yQueue[state.a11yQueue.length - 1] === value) {
      return;
    }
    state.a11yQueue.push(value);
    drainAnnouncements();
  }

  function drainAnnouncements() {
    if (state.a11yTimer || state.a11yQueue.length === 0) {
      return;
    }
    live.textContent = state.a11yQueue.shift();
    state.a11yTimer = setTimeout(function () {
      state.a11yTimer = null;
      drainAnnouncements();
    }, 1000);
  }

  function announceOnce(text) {
    const key = String(text || '');
    if (!key || state.announced[key]) {
      return;
    }
    state.announced[key] = true;
    announce(key);
  }

  function isDebateTurn(turn) {
    return turn === 'propose' || turn === 'critique' || turn === 'objection';
  }

  function isWorkTurn(turn) {
    return turn === 'spec' || turn === 'dispatch' || turn === 'work' || turn === 'argue';
  }

  function isArgueRun() {
    return !!(state.run && state.run.argue);
  }

  function roundHeaderCopy(n, turn) {
    if (turn === 'propose') {
      return 'ROUND ' + n + ' · PROPOSE';
    }
    if (turn === 'critique') {
      return 'ROUND ' + n + ' · CRITIQUE';
    }
    if (turn === 'objection') {
      return 'ROUND ' + n + ' · OBJECTION';
    }
    return '';
  }

  function shouldShowInFlightChips(handles) {
    return (handles || []).length >= 2;
  }

  function canAnnounceArticle(lastAt, now) {
    return !lastAt || now - lastAt >= 2000;
  }

  function flightFor(botId) {
    if (botId && state.flights[botId]) {
      return state.flights[botId];
    }
    if (state.current && (!botId || state.current.botId === botId)) {
      return state.current;
    }
    return null;
  }

  function debateInFlightHandles() {
    const handles = [];
    const seen = {};
    const ids = Object.keys(state.flights);
    for (let i = 0; i < ids.length; i++) {
      const flight = state.flights[ids[i]];
      if (!flight || !isDebateTurn(flight.turn) || !flight.handle) {
        continue;
      }
      if (seen[flight.handle]) {
        continue;
      }
      seen[flight.handle] = true;
      handles.push(flight.handle);
    }
    return handles;
  }

  function workInFlightHandles() {
    const handles = [];
    const seen = {};
    const ids = Object.keys(state.flights);
    for (let i = 0; i < ids.length; i++) {
      const flight = state.flights[ids[i]];
      if (!flight || !isWorkTurn(flight.turn) || !flight.handle) {
        continue;
      }
      if (seen[flight.handle]) {
        continue;
      }
      seen[flight.handle] = true;
      handles.push(flight.handle);
    }
    return handles;
  }

  function inflightBotIds() {
    const ids = {};
    const keys = Object.keys(state.flights);
    for (let i = 0; i < keys.length; i++) {
      const flight = state.flights[keys[i]];
      if (flight && flight.botId) {
        ids[flight.botId] = true;
      }
    }
    return ids;
  }

  function handleForBotId(botId) {
    const bots = state.bots || [];
    for (let i = 0; i < bots.length; i++) {
      if (bots[i].id === botId) {
        return bots[i].handle;
      }
    }
    return '';
  }

  function waitingHandles() {
    if (!state.run || state.run.runType !== 'work' || !state.debateRunning) {
      return [];
    }
    const inflight = inflightBotIds();
    const frozen = state.run.frozenBotIds || [];
    const handles = [];
    const seen = {};
    for (let i = 0; i < frozen.length; i++) {
      const id = frozen[i];
      if (!id || inflight[id] || (!isArgueRun() && state.completedBots[id])) {
        continue;
      }
      const handle = handleForBotId(id);
      if (!handle || seen[handle]) {
        continue;
      }
      seen[handle] = true;
      handles.push(handle);
    }
    return handles;
  }

  function inflightHandlesForBoard() {
    const debate = debateInFlightHandles();
    if (shouldShowInFlightChips(debate)) {
      return debate;
    }
    const work = workInFlightHandles();
    const waiting = waitingHandles();
    if (isArgueRun() && work.length >= 1) {
      return work;
    }
    if (work.length >= 2 || (work.length >= 1 && waiting.length >= 1)) {
      return work;
    }
    return [];
  }

  function shouldShowWorkChips() {
    return inflightHandlesForBoard().length > 0 || waitingHandles().length > 0;
  }

  function announceArticle(flight, text) {
    if (!flight) {
      return;
    }
    const now = Date.now();
    if (!canAnnounceArticle(flight.lastAnnounce, now)) {
      return;
    }
    flight.lastAnnounce = now;
    announce(text);
  }

  function dropFlight(botId) {
    if (botId && state.flights[botId]) {
      delete state.flights[botId];
    }
    if (state.current && botId && state.current.botId === botId) {
      const rest = Object.keys(state.flights);
      state.current = rest.length ? state.flights[rest[0]] : null;
    }
  }

  function boardIsEmpty(board) {
    if (!board) {
      return true;
    }
    const todos = board.todos || [];
    const decisions = board.decisions || [];
    const dissents = board.dissents || [];
    const files = board.files || [];
    return !board.goal && todos.length === 0 && decisions.length === 0 && dissents.length === 0 && files.length === 0;
  }

  function fileBaseName(path) {
    const p = String(path || '');
    const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return i >= 0 ? p.slice(i + 1) : p;
  }

  function todoCounts(todos) {
    const list = todos || [];
    let done = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].status === 'done') {
        done += 1;
      }
    }
    return { done: done, total: list.length };
  }

  function hideBoardChrome() {
    runBoard.hidden = true;
    runBoard.classList.remove('is-collapsed');
    runBoardBody.replaceChildren();
    state.boardCollapsed = false;
    state.todosExpanded = false;
    state.lastBoardGoal = '';
    boardGoalLive.textContent = '';
  }

  function todoItem(todo) {
    const li = document.createElement('li');
    li.setAttribute('role', 'listitem');
    li.className = 'run-board-todo';
    const status = todo.status === 'current' ? 'current' : todo.status === 'done' ? 'done' : 'pending';
    const glyph = document.createElement('span');
    glyph.className = 'run-board-todo-glyph is-' + status;
    glyph.setAttribute('aria-hidden', 'true');
    if (status === 'done') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'run-board-check');
      svg.setAttribute('width', '11');
      svg.setAttribute('height', '11');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('focusable', 'false');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('d', 'M14.35 3.65 6.2 11.8 1.65 7.26l1.2-1.2 3.35 3.34 6.95-6.95z');
      svg.appendChild(path);
      glyph.appendChild(svg);
    } else if (status === 'current') {
      glyph.textContent = '\u25cf';
    } else {
      glyph.textContent = '\u25cb';
    }
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = status + ', ';
    const text = document.createElement('span');
    text.className = 'run-board-todo-text';
    text.textContent = todo.text || '';
    li.appendChild(glyph);
    li.appendChild(sr);
    li.appendChild(text);
    return li;
  }

  function fileChip(file) {
    const inSet = !!file.inChangeset;
    const el = document.createElement(inSet ? 'button' : 'span');
    if (inSet) {
      el.type = 'button';
    }
    el.className = 'run-board-file' + (inSet ? ' is-proposed' : '');
    el.textContent = fileBaseName(file.path);
    el.title = inSet ? 'Open diff' : 'Not proposed yet';
    if (inSet) {
      el.addEventListener('click', function () {
        vscode.postMessage({ type: 'review/open-diff', path: file.path });
      });
    }
    return el;
  }

  function renderBoardBody(board) {
    runBoardBody.replaceChildren();
    if (!board) {
      return;
    }
    const todos = board.todos || [];
    const decisions = board.decisions || [];
    const dissents = board.dissents || [];
    const files = board.files || [];

    if (board.goal) {
      const goal = document.createElement('div');
      goal.className = 'run-board-goal';
      goal.textContent = board.goal;
      runBoardBody.appendChild(goal);
    }

    if (todos.length) {
      const list = document.createElement('ul');
      list.className = 'run-board-todos';
      list.setAttribute('role', 'list');
      const limit = state.todosExpanded || todos.length <= 7 ? todos.length : 7;
      for (let i = 0; i < limit; i++) {
        list.appendChild(todoItem(todos[i]));
      }
      runBoardBody.appendChild(list);
      if (!state.todosExpanded && todos.length > 7) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'run-board-more';
        more.textContent = '+' + (todos.length - 7) + ' more';
        more.addEventListener('click', function (e) {
          e.stopPropagation();
          state.todosExpanded = true;
          paintBoard(state.board);
        });
        runBoardBody.appendChild(more);
      }
    }

    if (decisions.length) {
      const list = document.createElement('ul');
      list.className = 'run-board-decisions';
      list.setAttribute('role', 'list');
      for (let i = 0; i < decisions.length; i++) {
        const li = document.createElement('li');
        li.setAttribute('role', 'listitem');
        li.className = 'run-board-decision';
        li.textContent = decisions[i];
        list.appendChild(li);
      }
      runBoardBody.appendChild(list);
    }

    if (dissents.length) {
      const list = document.createElement('ul');
      list.className = 'run-board-dissents';
      list.setAttribute('role', 'list');
      const limit = dissents.length > 4 ? 4 : dissents.length;
      for (let i = 0; i < limit; i++) {
        const d = dissents[i];
        const li = document.createElement('li');
        li.setAttribute('role', 'listitem');
        li.className = 'run-board-dissent';
        li.textContent = '@' + (d.handle || '') + ' \u2014 ' + (d.text || '');
        list.appendChild(li);
      }
      runBoardBody.appendChild(list);
      if (dissents.length > 4) {
        const more = document.createElement('div');
        more.className = 'run-board-more';
        more.textContent = '+' + (dissents.length - 4) + ' more';
        runBoardBody.appendChild(more);
      }
    }

    if (files.length) {
      const wrap = document.createElement('div');
      wrap.className = 'run-board-files';
      const limit = files.length > 6 ? 6 : files.length;
      for (let i = 0; i < limit; i++) {
        wrap.appendChild(fileChip(files[i]));
      }
      if (files.length > 6) {
        const more = document.createElement('span');
        more.className = 'run-board-more';
        more.textContent = '+' + (files.length - 6) + ' more';
        wrap.appendChild(more);
      }
      runBoardBody.appendChild(wrap);
    }
  }

  function renderInFlightChips() {
    const existing = document.getElementById('run-board-inflight');
    if (existing) {
      existing.remove();
    }
    const handles = inflightHandlesForBoard();
    if (!handles.length) {
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'run-board-inflight';
    wrap.className = 'run-board-inflight';
    wrap.setAttribute('aria-label', 'In flight');
    for (let i = 0; i < handles.length; i++) {
      const chip = document.createElement('span');
      chip.className = 'run-board-inflight-chip';
      const glyph = document.createElement('span');
      glyph.className = 'run-board-inflight-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = '\u25cf';
      const label = document.createElement('span');
      label.className = 'run-board-inflight-handle';
      label.textContent = '@' + handles[i];
      chip.appendChild(glyph);
      chip.appendChild(label);
      chip.addEventListener('click', function (e) {
        e.preventDefault();
      });
      wrap.appendChild(chip);
    }
    runBoardBody.insertBefore(wrap, runBoardBody.firstChild);
  }

  function renderWaitingChips() {
    const existing = document.getElementById('run-board-waiting');
    if (existing) {
      existing.remove();
    }
    const handles = waitingHandles();
    if (!handles.length) {
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'run-board-waiting';
    wrap.className = 'run-board-waiting';
    wrap.setAttribute('aria-label', 'Waiting');
    for (let i = 0; i < handles.length; i++) {
      const chip = document.createElement('span');
      chip.className = 'run-board-waiting-chip';
      const glyph = document.createElement('span');
      glyph.className = 'run-board-waiting-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = '\u25cb';
      const label = document.createElement('span');
      label.className = 'run-board-waiting-handle';
      label.textContent = '@' + handles[i];
      chip.appendChild(glyph);
      chip.appendChild(label);
      chip.addEventListener('click', function (e) {
        e.preventDefault();
      });
      wrap.appendChild(chip);
    }
    const inflight = document.getElementById('run-board-inflight');
    if (inflight && inflight.nextSibling) {
      runBoardBody.insertBefore(wrap, inflight.nextSibling);
    } else if (inflight) {
      runBoardBody.appendChild(wrap);
    } else {
      runBoardBody.insertBefore(wrap, runBoardBody.firstChild);
    }
  }

  function paintBoard(board) {
    state.board = board || null;
    const handles = debateInFlightHandles();
    if (boardIsEmpty(board) && !shouldShowInFlightChips(handles) && !shouldShowWorkChips()) {
      hideBoardChrome();
      return;
    }
    runBoard.hidden = false;
    const collapsed = !!state.boardCollapsed;
    runBoard.classList.toggle('is-collapsed', collapsed);
    const todos = (board && board.todos) || [];
    const counts = todoCounts(todos);
    runBoardToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    runBoardToggle.setAttribute(
      'aria-label',
      'Run, ' + counts.done + ' of ' + counts.total + ' todos, ' + (collapsed ? 'collapsed' : 'expanded'),
    );
    const goalText = String((board && board.goal) || '');
    runBoardSummaryGoal.textContent = goalText;
    if (counts.total === 0) {
      runBoardSummaryCount.textContent = '';
      runBoardSummaryCount.hidden = true;
    } else {
      runBoardSummaryCount.textContent = (goalText ? ' \u00b7 ' : '') + counts.done + '/' + counts.total;
      runBoardSummaryCount.hidden = false;
    }
    runBoardLabel.hidden = collapsed;
    runBoardSummary.hidden = !collapsed;
    runBoardBody.hidden = collapsed;
    renderBoardBody(board);
    renderInFlightChips();
    renderWaitingChips();
    if (goalText !== state.lastBoardGoal) {
      boardGoalLive.textContent = goalText;
      state.lastBoardGoal = goalText;
    }
  }

  function paintPackOverflow(message) {
    const el = document.createElement('div');
    el.className = 'error system';
    el.setAttribute('aria-live', 'polite');
    el.textContent = message || PACK_OVERFLOW_COPY;
    const host = findOverflowHost();
    if (host) {
      const bubble = host.querySelector('.bubble') || host;
      bubble.appendChild(el);
    } else {
      thread.appendChild(el);
    }
    thread.scrollTop = thread.scrollHeight;
  }

  function findOverflowHost() {
    const ids = Object.keys(state.flights);
    if (ids.length === 1 && state.flights[ids[0]] && state.flights[ids[0]].turn === 'direct') {
      return state.flights[ids[0]].el;
    }
    return null;
  }

  function reduceMotion() {
    if (document.body.classList.contains('vscode-reduce-motion')) {
      return true;
    }
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function mcpTurnAllowed(turn) {
    return turn === 'propose' || turn === 'critique' || turn === 'direct';
  }

  function mcpSkipBody(reason, server, message) {
    if (reason === 'missing') {
      return 'Not in this workspace.';
    }
    if (reason === 'unauthenticated') {
      return 'Not signed in. Sign in from VS Code MCP settings.';
    }
    if (reason === 'tool-missing') {
      return 'Tool not available.';
    }
    if (reason === 'mutating-blocked') {
      return "Writes through " + server + " aren't available in Bot Rider.";
    }
    const raw = String(message || '')
      .replace(/\s+/g, ' ')
      .trim();
    return raw.slice(0, 140);
  }

  function mcpPreviewText(preview) {
    const text = String(preview || '')
      .replace(/\r/g, '')
      .trim();
    if (!text) {
      return '';
    }
    const first = text[0];
    if (first === '{' || first === '[') {
      return '';
    }
    return text.split('\n').slice(0, 3).join('\n');
  }

  function findMcpArticle(botId) {
    const flight = flightFor(botId);
    if (flight && flight.el) {
      return flight.el;
    }
    if (state.current && state.current.el && state.current.botId === botId) {
      return state.current.el;
    }
    let found = null;
    const msgs = thread.querySelectorAll('.msg');
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].getAttribute('data-bot-id') === botId) {
        found = msgs[i];
      }
    }
    return found;
  }

  function findMcpInFlight(botId, server, tool) {
    const rows = thread.querySelectorAll('.mcp-read.is-reading');
    let found = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.getAttribute('data-server') !== server || row.getAttribute('data-tool') !== tool) {
        continue;
      }
      const host = row.closest('.msg');
      if (!host || host.getAttribute('data-bot-id') !== botId) {
        continue;
      }
      found = row;
    }
    return found;
  }

  function insertMcpRow(article, row) {
    const bubble = article.querySelector('.bubble') || article;
    const body = bubble.querySelector('.article-body') || bubble.querySelector('.body');
    bubble.insertBefore(row, body || null);
  }

  function canPaintNewMcpRow(article) {
    if (!mcpTurnAllowed(state.lastTurn)) {
      return false;
    }
    if (!article) {
      return false;
    }
    return mcpTurnAllowed(article.getAttribute('data-turn'));
  }

  function createMcpStartRow(msg) {
    const row = document.createElement('div');
    row.className = 'mcp-read is-reading';
    row.setAttribute('data-server', msg.server);
    row.setAttribute('data-tool', msg.tool);
    const title = document.createElement('span');
    title.className = 'mcp-read-title';
    title.textContent = 'Reading ' + msg.server + ' · ' + msg.tool;
    row.appendChild(title);
    if (reduceMotion()) {
      const staticLabel = document.createElement('span');
      staticLabel.className = 'mcp-read-static';
      staticLabel.textContent = 'Reading…';
      row.appendChild(staticLabel);
    } else {
      const spinner = document.createElement('span');
      spinner.className = 'mcp-read-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      row.appendChild(spinner);
    }
    return row;
  }

  function paintMcpEnd(row, msg) {
    const preview = mcpPreviewText(msg.preview);
    row.className = 'mcp-read is-done';
    row.setAttribute('data-server', msg.server);
    row.setAttribute('data-tool', msg.tool);
    row.setAttribute('aria-label', '@' + msg.handle + ' read ' + msg.server + ' ' + msg.tool);
    row.removeAttribute('role');
    row.replaceChildren();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mcp-read-toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Read ' + msg.server + ' ' + msg.tool + ', collapsed');
    const chevron = document.createElement('span');
    chevron.className = 'mcp-read-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.className = 'mcp-read-title';
    title.textContent = 'Read ' + msg.server + ' · ' + msg.tool;
    btn.appendChild(chevron);
    btn.appendChild(title);
    row.appendChild(btn);
    if (preview) {
      const previewEl = document.createElement('div');
      previewEl.className = 'mcp-read-preview';
      previewEl.hidden = true;
      previewEl.textContent = preview;
      btn.addEventListener('click', function () {
        const open = btn.getAttribute('aria-expanded') === 'true';
        const next = !open;
        btn.setAttribute('aria-expanded', next ? 'true' : 'false');
        btn.setAttribute('aria-label', 'Read ' + msg.server + ' ' + msg.tool + ', ' + (next ? 'expanded' : 'collapsed'));
        previewEl.hidden = !next;
        row.classList.toggle('is-expanded', next);
      });
      row.appendChild(previewEl);
    } else {
      btn.disabled = true;
    }
  }

  function paintMcpSkip(row, msg) {
    row.className = 'mcp-read ' + (msg.reason === 'error' ? 'is-error' : 'is-skip');
    row.setAttribute('data-server', msg.server);
    row.setAttribute('data-tool', msg.tool);
    row.setAttribute('role', 'status');
    row.removeAttribute('aria-label');
    row.replaceChildren();
    const title = document.createElement('span');
    title.className = 'mcp-read-title';
    title.textContent = 'Skipped ' + msg.server + ' · ' + msg.tool;
    const body = document.createElement('span');
    body.className = 'mcp-read-body';
    body.textContent = mcpSkipBody(msg.reason, msg.server, msg.message);
    row.appendChild(title);
    row.appendChild(body);
  }

  function onMcpReadStart(msg) {
    const article = findMcpArticle(msg.botId);
    if (!canPaintNewMcpRow(article)) {
      return;
    }
    const inFlight = findMcpInFlight(msg.botId, msg.server, msg.tool);
    if (inFlight && inFlight.closest('.msg') === article) {
      return;
    }
    insertMcpRow(article, createMcpStartRow(msg));
    announce('@' + msg.handle + ' is reading ' + msg.server);
    thread.scrollTop = thread.scrollHeight;
  }

  function onMcpReadEnd(msg) {
    const inFlight = findMcpInFlight(msg.botId, msg.server, msg.tool);
    if (inFlight) {
      paintMcpEnd(inFlight, msg);
      thread.scrollTop = thread.scrollHeight;
      return;
    }
    const article = findMcpArticle(msg.botId);
    if (!canPaintNewMcpRow(article)) {
      return;
    }
    const row = document.createElement('div');
    paintMcpEnd(row, msg);
    insertMcpRow(article, row);
    thread.scrollTop = thread.scrollHeight;
  }

  function onMcpSkip(msg) {
    const inFlight = findMcpInFlight(msg.botId, msg.server, msg.tool);
    if (inFlight) {
      paintMcpSkip(inFlight, msg);
      thread.scrollTop = thread.scrollHeight;
      return;
    }
    const article = findMcpArticle(msg.botId);
    if (!canPaintNewMcpRow(article)) {
      return;
    }
    const row = document.createElement('div');
    paintMcpSkip(row, msg);
    insertMcpRow(article, row);
    thread.scrollTop = thread.scrollHeight;
  }

  function appendUser(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = 'You';
    const body = document.createElement('div');
    body.className = 'body article-body';
    paintArticle(body, text);
    bubble.appendChild(meta);
    bubble.appendChild(body);
    el.appendChild(bubble);
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
  }

  function appendNotice(text) {
    const el = document.createElement('div');
    el.className = 'notice';
    el.textContent = text;
    if (/ · collision$/.test(String(text || ''))) {
      el.setAttribute('aria-live', 'polite');
      announceOnce(text);
    }
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
  }

  function markInterrupted() {
    const ids = Object.keys(state.flights);
    if (!ids.length && !state.current) {
      return;
    }
    const seen = {};
    function markOne(flight) {
      if (!flight || !flight.el || seen[flight.botId]) {
        return;
      }
      seen[flight.botId] = true;
      const host = flight.el;
      if (host.querySelector('.interrupted')) {
        return;
      }
      if (flight.speak) flight.speak.style.display = 'none';
      if (flight.think) flight.think.style.display = 'none';
      const note = document.createElement('div');
      note.className = 'notice interrupted';
      note.textContent = 'Interrupted';
      const bubble = host.querySelector('.bubble') || host;
      bubble.appendChild(note);
    }
    for (let i = 0; i < ids.length; i++) {
      markOne(state.flights[ids[i]]);
    }
    if (state.current) {
      markOne(state.current);
    }
    state.flights = {};
    state.current = null;
    paintBoard(state.board);
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
    if (!match || state.splitOpen || state.debateRunning && !state.workBatch && !isArgueRun()) {
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
    const deliverableAsk = !!(state.run && state.run.deliverableAsk);
    const locked = !ready || !!state.splitOpen || (!!state.debateRunning && !deliverableAsk);
    input.disabled = locked;
    if (state.debateRunning && !deliverableAsk) {
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
    if (state.workBatch && ready && !state.splitOpen) {
      input.disabled = false;
      send.disabled = false;
      send.textContent = 'Send';
      input.placeholder = 'Message the swarm. Use @handle to lock a bot.';
      helper.textContent = '';
      workStop.hidden = false;
    } else if (isArgueRun() && ready && !state.splitOpen) {
      input.disabled = false;
      send.disabled = false;
      send.textContent = 'Send';
      input.placeholder = 'Message the swarm. Use @handle to lock a bot.';
      helper.textContent = '';
      workStop.hidden = false;
    } else {
      workStop.hidden = true;
    }
  }

  function renderCopilot() {
    const status = state.copilotStatus;
    paintOnboarding();
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

  function paintOnboarding(next) {
    if (next) {
      state.onboarding = next;
    }
    onboarding.hidden = !state.onboarding.open;
    if (state.copilotStatus === 'ready') {
      onboardingCopilot.textContent = 'GitHub Copilot is ready.';
    } else if (state.copilotStatus === 'settling') {
      onboardingCopilot.textContent = 'Checking GitHub Copilot…';
    } else {
      onboardingCopilot.textContent = 'GitHub Copilot needs attention. Use the sign-in or retry action above.';
    }
  }

  function paintRecovery(next) {
    state.recovery = next || null;
    recovery.hidden = !next || !next.available;
    recovery.replaceChildren();
    if (!next || !next.available) return;
    const title = document.createElement('strong');
    title.textContent = 'Recovered work is available';
    const detail = document.createElement('p');
    detail.textContent =
      (next.phase ? 'Last phase: ' + next.phase + '. ' : '') +
      next.fileCount + ' file proposal(s), ' + next.mcpCount + ' MCP action(s). Nothing will run automatically.';
    recovery.appendChild(title);
    recovery.appendChild(detail);
    const actions = document.createElement('div');
    actions.className = 'onboarding-actions';
    [
      ['Review pending', 'recovery/review', true],
      ['Resume', 'recovery/resume', !!next.canResume],
      ['Discard', 'recovery/discard', true],
    ].forEach(function (entry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry[0];
      button.disabled = !entry[2];
      button.addEventListener('click', function () { vscode.postMessage({ type: entry[1] }); });
      actions.appendChild(button);
    });
    recovery.appendChild(actions);
    announceOnce('Recovered work is available');
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

  function argueHeaderPath(text) {
    const m = String(text || '').match(/^ARGUE · (.+)$/);
    return m ? m[1] : '';
  }

  function argueRoundNumber(text) {
    const m = String(text || '').match(/^Argue round ([12])$/);
    return m ? Number(m[1]) : 0;
  }

  function paintArguePathHeader(path) {
    const p = String(path || '');
    if (!p || state.lastArguePath === p) {
      return false;
    }
    state.lastArguePath = p;
    const rh = document.createElement('div');
    rh.className = 'round-header is-argue';
    rh.textContent = 'ARGUE · ' + p;
    thread.appendChild(rh);
    announceOnce(rh.textContent);
    thread.scrollTop = thread.scrollHeight;
    return true;
  }

  function paintArgueRoundHeader(n) {
    const round = n === 2 ? 2 : n === 1 ? 1 : 0;
    if (!round) {
      return false;
    }
    const path = (state.run && state.run.arguePath) || state.lastArguePath || '';
    const key = path + ':' + round;
    if (state.lastArgueRoundKey === key) {
      return false;
    }
    state.lastArgueRoundKey = key;
    const rh = document.createElement('div');
    rh.className = 'round-header is-argue';
    rh.textContent = 'Argue round ' + round;
    thread.appendChild(rh);
    announce(rh.textContent);
    thread.scrollTop = thread.scrollHeight;
    return true;
  }

  function paintArgueNotice(text) {
    const path = argueHeaderPath(text);
    if (path) {
      paintArguePathHeader(path);
      return true;
    }
    const n = argueRoundNumber(text);
    if (n) {
      paintArgueRoundHeader(n);
      return true;
    }
    return false;
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
    if (turn === 'argue') {
      if (state.run && state.run.arguePath) {
        paintArguePathHeader(state.run.arguePath);
      }
      const argueRound = round === 2 ? 2 : round === 1 ? 1 : (state.run && state.run.argueRound);
      paintArgueRoundHeader(argueRound);
      return;
    }
    if (turn === 'propose' || turn === 'critique') {
      const key = n + ':' + turn;
      if (key === state.lastPhaseKey) {
        return;
      }
      const prev = state.lastPhaseKey;
      state.lastPhaseKey = key;
      const rh = document.createElement('div');
      rh.className = 'round-header';
      rh.textContent = roundHeaderCopy(n, turn);
      thread.appendChild(rh);
      if (turn === 'critique' && prev) {
        announce(rh.textContent);
      }
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
    card.innerHTML =
      '<h3>' +
      esc(title) +
      '</h3><p>' +
      esc(body) +
      '</p>' +
      '<ul class="split-positions"></ul>' +
      '<div class="split-actions">' +
      '<button type="button" id="split-continue">Continue</button>' +
      '<button type="button" id="split-pick">Pick a bot to decide</button>' +
      '<button type="button" class="secondary" id="split-stop">Stop</button></div>';
    const list = card.querySelector('.split-positions');
    positions.forEach(function (p) {
      const li = document.createElement('li');
      const handle = document.createElement('strong');
      handle.textContent = '@' + (p.handle || '');
      const article = document.createElement('div');
      article.className = 'article-body';
      paintArticle(article, p.text || '');
      li.appendChild(handle);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(article);
      list.appendChild(li);
    });
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
    paintReviewStrip();
  }

  function hideMcpActions() {
    state.pendingMcpActions = [];
    state.mcpFailedMessage = '';
    paintReviewStrip();
  }

  function showMcpActions(actions) {
    state.pendingMcpActions = actions || [];
    state.mcpFailedMessage = '';
    paintReviewStrip();
  }

  function countLabel(count, singular, plural) {
    return count + ' ' + (count === 1 ? singular : plural);
  }

  function reviewFocusButton(text, type) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-link';
    button.textContent = text;
    button.addEventListener('click', function () {
      vscode.postMessage({ type: type });
    });
    return button;
  }

  function paintReviewStrip() {
    let strip = document.getElementById('review-strip');
    const fileCount = state.previewFiles.length;
    const mcpCount = state.pendingMcpActions.length;
    if (!fileCount && !mcpCount) {
      if (strip) {
        strip.remove();
      }
      return;
    }
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'review-strip';
      strip.className = 'files-banner review-strip';
      thread.appendChild(strip);
    }
    strip.replaceChildren();
    const label = document.createElement('span');
    const counts = [];
    if (fileCount) {
      counts.push(countLabel(fileCount, 'file', 'files'));
    }
    if (mcpCount) {
      counts.push(countLabel(mcpCount, 'MCP action', 'MCP actions'));
    }
    label.textContent = 'Review · ' + counts.join(' · ');
    strip.appendChild(label);
    if (fileCount) {
      strip.appendChild(reviewFocusButton('Files', 'ui/focus-review-files'));
    }
    if (mcpCount) {
      strip.appendChild(reviewFocusButton('MCP', 'ui/focus-review-mcp'));
    }
    if (state.mcpFailedMessage) {
      const failure = document.createElement('span');
      failure.className = 'review-failure';
      failure.setAttribute('role', 'alert');
      failure.textContent = state.mcpFailedMessage;
      strip.appendChild(failure);
    }
    thread.scrollTop = thread.scrollHeight;
  }

  function appendSnapshotError(entry) {
    if (entry.code === 'pack-overflow') {
      paintPackOverflow(entry.text);
      return;
    }
    const el = document.createElement('div');
    el.className = 'error';
    el.setAttribute('role', 'alert');
    el.textContent = entry.text || entry.code || 'Error';
    thread.appendChild(el);
  }

  function appendSnapshotBot(entry) {
    if (entry.turn === 'implement' || entry.turn === 'consensus' || entry.turn === 'synthesis') {
      return;
    }
    maybePhaseHeader(entry.turn, entry.handle, entry.round);
    const el = document.createElement('div');
    el.className = 'msg';
    el.setAttribute('data-bot-id', entry.botId);
    el.setAttribute('data-turn', entry.turn);
    el.setAttribute('data-handle', entry.handle);
    el.setAttribute('data-article-id', String(++state.articleSequence));
    el.setAttribute('tabindex', '-1');
    const solo = entry.solo ? '<span>SOLO · @' + esc(entry.handle) + '</span>' : '';
    const disclosure = entry.solo
      ? ''
      : '<button type="button" class="article-toggle" aria-expanded="false">Show response</button>';
    el.innerHTML =
      avatarSvg(entry.name, entry.colorIndex) +
      '<div class="bubble"><div class="meta"><span>' +
      esc(entry.name) +
      '</span><span class="handle">@' +
      esc(entry.handle) +
      '</span>' +
      solo +
      '</div>' +
      (entry.inactiveNotice ? '<div class="notice">' + esc(entry.inactiveNotice) + '</div>' : '') +
      disclosure +
      '<div class="body article-body"' + (entry.solo ? '' : ' hidden') + '><p class="article-p article-stream"></p></div>' +
      '<div class="article-live sr-only" aria-live="off"></div></div>';
    const toggle = el.querySelector('.article-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        setArticleExpanded(el, toggle.getAttribute('aria-expanded') !== 'true');
      });
    }
    const body = el.querySelector('.article-body');
    if (entry.complete) {
      paintArticle(body, entry.text || '');
      if (entry.interrupted) {
        const interrupted = document.createElement('div');
        interrupted.className = 'notice interrupted';
        interrupted.textContent = 'Interrupted';
        (el.querySelector('.bubble') || el).appendChild(interrupted);
      }
    } else {
      const flight = {
        botId: entry.botId,
        name: entry.name,
        handle: entry.handle,
        turn: entry.turn,
        el: el,
        body: body,
        stream: el.querySelector('.article-stream'),
        think: null,
        speak: null,
        live: el.querySelector('.article-live'),
        lastAnnounce: 0,
      };
      if (flight.stream && entry.text) {
        flight.stream.textContent = entry.text;
      }
      state.flights[entry.botId] = flight;
      state.current = flight;
    }
    if (entry.complete) {
      state.completedBots[entry.botId] = true;
    }
    thread.appendChild(el);
  }

  function restoreTranscript(snapshot) {
    const data = snapshot || {};
    thread.replaceChildren();
    state.flights = {};
    state.current = null;
    state.completedBots = {};
    state.announced = {};
    state.lastPhaseKey = '';
    state.lastTurn = '';
    state.pendingSend = '';
    state.expandedArticles = [];
    state.articleSequence = 0;
    state.run = data.run || { round: 0, splitOpen: false, debateRunning: false, frozenBotIds: [], phase: 'idle' };
    state.splitOpen = !!state.run.splitOpen;
    state.debateRunning = !!state.run.debateRunning;
    state.workBatch = !!state.run.workBatch;
    state.board = data.board || null;
    const entries = (data.entries || []).slice().sort(function (a, b) {
      return Number(a.sequence || 0) - Number(b.sequence || 0);
    });
    entries.forEach(function (entry) {
      if (entry.kind === 'user') {
        appendUser(entry.text || '');
      } else if (entry.kind === 'bot') {
        appendSnapshotBot(entry);
      } else if (entry.kind === 'notice') {
        appendNotice(entry.text || '');
      } else if (entry.kind === 'error') {
        appendSnapshotError(entry);
      }
    });
    if (data.split && state.splitOpen && !isArgueRun()) {
      showSplit(data.split);
    } else {
      hideSplit();
    }
    paintBoard(state.board);
    paintSynthesis(data.synthesis);
    paintDecision(data.decision);
    renderActivityTimeline();
    if ((data.pendingFiles || []).length) {
      showFiles(data.pendingFiles);
    }
    showMcpActions(data.pendingMcpActions || []);
    empty.hidden = entries.length > 0;
    lockComposer();
    renderEmpty();
    thread.scrollTop = thread.scrollHeight;
  }

  window.addEventListener('message', function (event) {
    const msg = event.data || {};
    if (msg.type === 'onboarding/state') {
      paintOnboarding(msg);
      return;
    }
    if (msg.type === 'recovery/state') {
      paintRecovery(msg.recovery);
      return;
    }
    if (msg.type === 'chat/transcript-snapshot') {
      restoreTranscript(msg.snapshot);
    } else if (msg.type === 'bots/snapshot') {
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
    } else if (msg.type === 'copilot/scheduler') {
      paintScheduler(msg.snapshot);
    } else if (msg.type === 'ui/preferences') {
      state.maxVisibleArticles = Math.max(1, Math.min(12, Number(msg.maxVisibleArticles) || 3));
    } else if (msg.type === 'context/status') {
      contextStatus.hidden = false;
      contextStatus.textContent =
        'Task context: ' + msg.includedChars + ' characters' +
        ((msg.dropped || []).length ? ' · ' + msg.dropped.length + ' optional item(s) dropped' : '');
    } else if (msg.type === 'chat/synthesis') {
      paintSynthesis(msg.synthesis);
    } else if (msg.type === 'chat/decision') {
      paintDecision(msg.decision);
    } else if (msg.type === 'run/state') {
      const wasRunning = state.debateRunning;
      state.run = msg.state || state.run;
      state.splitOpen = !!(state.run && state.run.splitOpen);
      state.debateRunning = !!(state.run && state.run.debateRunning);
      state.workBatch = !!(state.run && state.run.workBatch);
      if (isArgueRun()) {
        hideSplit();
        if (state.run.arguePath) {
          paintArguePathHeader(state.run.arguePath);
        }
        if (state.run.argueRound === 1 || state.run.argueRound === 2) {
          paintArgueRoundHeader(state.run.argueRound);
        }
      } else {
        state.lastArguePath = '';
        state.lastArgueRoundKey = '';
      }
      if (!state.debateRunning || (!wasRunning && state.debateRunning)) {
        state.completedBots = {};
      }
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
      paintBoard(state.board);
      renderActivityTimeline();
    } else if (msg.type === 'chat/turn-start') {
      state.lastTurn = msg.turn;
      if (msg.turn === 'implement' || msg.turn === 'consensus' || msg.turn === 'synthesis') {
        return;
      }
      maybePhaseHeader(msg.turn, msg.handle, msg.round);
      const el = document.createElement('div');
      el.className = 'msg';
      el.setAttribute('data-bot-id', msg.botId);
      el.setAttribute('data-turn', msg.turn);
      el.setAttribute('data-handle', msg.handle);
      el.setAttribute('data-article-id', String(++state.articleSequence));
      el.setAttribute('tabindex', '-1');
      const solo = msg.solo ? '<span>SOLO · @' + esc(msg.handle) + '</span>' : '';
      const disclosure = msg.solo
        ? ''
        : '<button type="button" class="article-toggle" aria-expanded="false">Show response</button>';
      el.innerHTML =
        avatarSvg(msg.name, msg.colorIndex) +
        '<div class="bubble"><div class="meta"><span>' +
        esc(msg.name) +
        '</span><span class="handle">@' +
        esc(msg.handle) +
        '</span>' +
        solo +
        '</div>' +
        (msg.inactiveNotice ? '<div class="notice">' + esc(msg.inactiveNotice) + '</div>' : '') +
        disclosure +
        '<div class="body article-body"' + (msg.solo ? '' : ' hidden') + '><p class="article-p article-stream"></p></div>' +
        '<div class="article-live sr-only" aria-live="off"></div></div>';
      const articleToggle = el.querySelector('.article-toggle');
      if (articleToggle) {
        articleToggle.addEventListener('click', function () {
          setArticleExpanded(el, articleToggle.getAttribute('aria-expanded') !== 'true');
        });
      }
      const flight = {
        botId: msg.botId,
        name: msg.name,
        handle: msg.handle,
        turn: msg.turn,
        el: el,
        body: el.querySelector('.article-body'),
        stream: el.querySelector('.article-stream'),
        think: null,
        speak: null,
        live: el.querySelector('.article-live'),
        lastAnnounce: 0,
      };
      state.flights[msg.botId] = flight;
      state.current = flight;
      announceArticle(flight, msg.name + ' is thinking');
      thread.appendChild(el);
      empty.hidden = true;
      if (isDebateTurn(msg.turn) || isWorkTurn(msg.turn)) {
        paintBoard(state.board);
      }
      renderActivityTimeline();
      thread.scrollTop = thread.scrollHeight;
    } else if (msg.type === 'chat/token') {
      const current = flightFor(msg.botId);
      if (current && current.stream) {
        current.stream.appendChild(document.createTextNode(msg.delta || ''));
        if (current.think) current.think.style.display = 'none';
        if (current.speak) current.speak.style.display = 'inline';
        announceArticle(current, (current.name || 'Bot') + ' is speaking');
        thread.scrollTop = thread.scrollHeight;
      }
    } else if (msg.type === 'chat/mcp-read-start' || msg.type === 'chat/mcp-read-end' || msg.type === 'chat/mcp-skip') {
      switch (msg.type) {
        case 'chat/mcp-read-start':
          onMcpReadStart(msg);
          break;
        case 'chat/mcp-read-end':
          onMcpReadEnd(msg);
          break;
        case 'chat/mcp-skip':
          onMcpSkip(msg);
          break;
      }
    } else if (msg.type === 'chat/turn-end') {
      const current = flightFor(msg.botId);
      if (current && current.speak) current.speak.style.display = 'none';
      if (current && current.think) current.think.style.display = 'none';
      if (msg.text !== undefined && current && current.body) {
        paintArticle(current.body, msg.text);
      }
      if (current) {
        announceArticle(current, (current.name || 'Bot') + ' finished');
      }
      if ((msg.botId || (current && current.botId)) && state.run && state.run.runType === 'work') {
        state.completedBots[msg.botId || current.botId] = true;
      }
      dropFlight(msg.botId || (current && current.botId));
      if (msg.botId || (current && current.botId)) {
        state.completedBots[msg.botId || current.botId] = true;
      }
      renderActivityTimeline();
      if (isDebateTurn(msg.turn) || isWorkTurn(msg.turn) || !msg.turn) {
        paintBoard(state.board);
      }
    } else if (msg.type === 'chat/split') {
      if (isArgueRun()) {
        hideSplit();
        lockComposer();
      } else {
        if (msg.paused) {
          markInterrupted();
        }
        state.splitOpen = true;
        lockComposer();
        showSplit(msg);
      }
    } else if (msg.type === 'chat/notice') {
      if (msg.text === 'Interrupted') {
        markInterrupted();
        if (isArgueRun()) {
          hideSplit();
        }
      } else if (paintArgueNotice(msg.text || '')) {
        hideSplit();
      } else {
        hideSplit();
        appendNotice(msg.text || '');
      }
    } else if (msg.type === 'chat/board') {
      paintBoard(msg.board);
      renderActivityTimeline();
    } else if (msg.type === 'error' && msg.code === 'pack-overflow') {
      state.lastError = msg.message || msg.code;
      paintPackOverflow(msg.message);
      renderActivityTimeline();
    } else if (msg.type === 'error') {
      state.lastError = msg.message || msg.code;
      const el = document.createElement('div');
      el.className = 'error';
      const workCopy =
        msg.code === 'work-gate' ||
        msg.code === 'work-running' ||
        msg.message === 'Work needs one Dispatcher and one Spec.' ||
        msg.message === 'Work batch still running.';
      if (workCopy) {
        el.setAttribute('aria-live', 'polite');
        el.textContent = msg.message || msg.code;
        if (msg.code === 'work-gate' || msg.code === 'work-running') {
          state.pendingSend = '';
        }
        announceOnce(el.textContent);
      } else {
        el.setAttribute('role', 'alert');
        if (msg.code === 'unknown-handle') {
          el.textContent = unknownCopy(msg.message);
        } else if (msg.code === 'zero-active') {
          el.textContent = 'Activate a bot or @mention one.';
        } else {
          el.textContent = msg.message || msg.code;
        }
      }
      thread.appendChild(el);
      thread.scrollTop = thread.scrollHeight;
      renderActivityTimeline();
    } else if (msg.type === 'changeset/apply-failed') {
      state.lastError = msg.message || 'Apply failed';
      const el = document.createElement('div');
      el.className = 'error';
      el.setAttribute('role', 'alert');
      el.textContent = msg.message || '';
      thread.appendChild(el);
      renderActivityTimeline();
    } else if (msg.type === 'changeset/stale') {
      const el = document.createElement('div');
      el.className = 'error stale-patch';
      el.setAttribute('role', 'alert');
      const text = document.createElement('span');
      text.textContent = msg.message || 'Workspace files changed.';
      const regenerate = document.createElement('button');
      regenerate.type = 'button';
      regenerate.textContent = 'Regenerate stale patches';
      regenerate.addEventListener('click', function () {
        vscode.postMessage({ type: 'changeset/regenerate-stale' });
      });
      el.appendChild(text);
      el.appendChild(regenerate);
      thread.appendChild(el);
      announceOnce(text.textContent);
    } else if (msg.type === 'changeset/preview') {
      showFiles(msg.files || []);
    } else if (msg.type === 'changeset/cleared') {
      showFiles([]);
    } else if (msg.type === 'mcp/actions-preview') {
      showMcpActions(msg.actions || []);
    } else if (msg.type === 'mcp/actions-cleared') {
      hideMcpActions();
    } else if (msg.type === 'mcp/actions-failed') {
      state.lastError = msg.message || 'MCP actions failed';
      state.mcpFailedMessage = msg.message || 'MCP actions failed';
      paintReviewStrip();
      appendSnapshotError({ kind: 'error', text: state.mcpFailedMessage });
      renderActivityTimeline();
    }
  });

  paintRunType();
  renderCopilot();
  renderExpand();
  lockComposer();
})();
