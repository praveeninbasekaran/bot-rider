(function () {
  const vscode = acquireVsCodeApi();

  const COPY = {
    noFolder: 'No folder.',
    fetching: 'Mapping this file…',
    noFiles: 'No files yet.',
    noRun: 'Send a prompt in Chat to see this run.',
  };

  const NODE_W = 148;
  const NODE_H = 32;
  const GAP_X = 56;
  const GAP_Y = 22;

  function sanitize(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function workspaceEmptyCopy(payload) {
    if (!payload) {
      return COPY.fetching;
    }
    if (!payload.nodes || payload.nodes.length === 0) {
      return COPY.noFolder;
    }
    var hasFile = false;
    for (var i = 0; i < payload.nodes.length; i++) {
      var kind = payload.nodes[i].kind;
      if (kind === 'file' || kind === 'symbol') {
        hasFile = true;
        break;
      }
    }
    if (!hasFile) {
      return COPY.noFiles;
    }
    return '';
  }

  function runEmptyCopy(payload) {
    if (!payload || !payload.nodes || payload.nodes.length === 0) {
      return COPY.noRun;
    }
    return '';
  }

  function graphForLayer(layer, workspace, run) {
    if (layer === 'run') {
      return {
        nodes: run && run.nodes ? run.nodes.slice() : [],
        edges: run && run.edges ? run.edges.slice() : [],
      };
    }
    return {
      nodes: workspace && workspace.nodes ? workspace.nodes.slice() : [],
      edges: workspace && workspace.edges ? workspace.edges.slice() : [],
    };
  }

  function edgesOnLayer(nodes, edges) {
    var ids = {};
    for (var i = 0; i < nodes.length; i++) {
      ids[nodes[i].id] = true;
    }
    var kept = [];
    for (var j = 0; j < edges.length; j++) {
      var edge = edges[j];
      if (ids[edge.from] && ids[edge.to]) {
        kept.push(edge);
      }
    }
    return kept;
  }

  function stripFields(node) {
    var fields = [];
    if (!node) {
      return fields;
    }
    if (node.label) {
      fields.push({ key: 'label', value: String(node.label) });
    }
    if (node.path) {
      fields.push({ key: 'path', value: String(node.path) });
    }
    if (node.kind) {
      fields.push({ key: 'kind', value: String(node.kind) });
    }
    return fields;
  }

  function selectPost(nodeId) {
    return { type: 'contextMap/select', nodeId: nodeId };
  }

  function openPost(node) {
    if (!node || (node.kind !== 'file' && node.kind !== 'symbol')) {
      return null;
    }
    return { type: 'contextMap/open', nodeId: node.id };
  }

  function expandPost(node) {
    if (!node || !node.uri || (node.kind !== 'file' && node.kind !== 'folder')) {
      return null;
    }
    return { type: 'contextMap/expand-file', uri: node.uri };
  }

  const state = {
    layer: 'workspace',
    workspace: null,
    run: null,
    selected: { workspace: null, run: null },
    pan: { x: 24, y: 24, k: 1 },
    dragging: null,
  };

  const root = document.createElement('div');
  root.className = 'cm-root';
  root.innerHTML =
    '<div class="cm-toggle" role="tablist" aria-label="Context Map layer">' +
    '<button type="button" class="cm-seg is-active" data-layer="workspace" role="tab" aria-selected="true">Workspace</button>' +
    '<button type="button" class="cm-seg" data-layer="run" role="tab" aria-selected="false">This run</button>' +
    '</div>' +
    '<div class="cm-stage" id="cm-stage">' +
    '<svg class="cm-canvas" id="cm-canvas" role="img" aria-label="Context Map"></svg>' +
    '<div class="cm-empty" id="cm-empty" hidden></div>' +
    '</div>' +
    '<div class="cm-strip" id="cm-strip" hidden></div>';
  document.body.appendChild(root);

  const stage = document.getElementById('cm-stage');
  const svg = document.getElementById('cm-canvas');
  const empty = document.getElementById('cm-empty');
  const strip = document.getElementById('cm-strip');
  const segs = root.querySelectorAll('.cm-seg');

  const ns = 'http://www.w3.org/2000/svg';
  const viewport = document.createElementNS(ns, 'g');
  viewport.setAttribute('class', 'cm-viewport');
  svg.appendChild(viewport);

  function sizeSvg() {
    const box = stage.getBoundingClientRect();
    svg.setAttribute('width', String(Math.max(1, box.width)));
    svg.setAttribute('height', String(Math.max(1, box.height)));
  }

  function applyPan() {
    viewport.setAttribute(
      'transform',
      'translate(' + state.pan.x + ' ' + state.pan.y + ') scale(' + state.pan.k + ')',
    );
  }

  function setLayer(layer) {
    if (layer !== 'workspace' && layer !== 'run') {
      return;
    }
    state.layer = layer;
    for (var i = 0; i < segs.length; i++) {
      var on = segs[i].getAttribute('data-layer') === layer;
      segs[i].classList.toggle('is-active', on);
      segs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    paint();
  }

  for (var s = 0; s < segs.length; s++) {
    segs[s].addEventListener('click', function (ev) {
      setLayer(ev.currentTarget.getAttribute('data-layer'));
    });
  }

  function layout(nodes, edges) {
    var incoming = {};
    var outgoing = {};
    var i;
    for (i = 0; i < nodes.length; i++) {
      incoming[nodes[i].id] = 0;
      outgoing[nodes[i].id] = [];
    }
    for (i = 0; i < edges.length; i++) {
      var e = edges[i];
      if (incoming[e.to] == null || outgoing[e.from] == null) {
        continue;
      }
      incoming[e.to] += 1;
      outgoing[e.from].push(e.to);
    }
    var level = {};
    var queue = [];
    for (i = 0; i < nodes.length; i++) {
      if (incoming[nodes[i].id] === 0) {
        level[nodes[i].id] = 0;
        queue.push(nodes[i].id);
      }
    }
    while (queue.length) {
      var id = queue.shift();
      var nexts = outgoing[id] || [];
      for (i = 0; i < nexts.length; i++) {
        if (level[nexts[i]] == null) {
          level[nexts[i]] = level[id] + 1;
          queue.push(nexts[i]);
        }
      }
    }
    var buckets = {};
    var maxLevel = 0;
    for (i = 0; i < nodes.length; i++) {
      var lv = level[nodes[i].id];
      if (lv == null) {
        lv = 0;
        level[nodes[i].id] = 0;
      }
      if (!buckets[lv]) {
        buckets[lv] = [];
      }
      buckets[lv].push(nodes[i]);
      if (lv > maxLevel) {
        maxLevel = lv;
      }
    }
    var pos = {};
    for (var L = 0; L <= maxLevel; L++) {
      var list = buckets[L] || [];
      for (i = 0; i < list.length; i++) {
        pos[list[i].id] = { x: L * (NODE_W + GAP_X), y: i * (NODE_H + GAP_Y) };
      }
    }
    return pos;
  }

  function nodeLabel(node) {
    return node && node.label != null ? String(node.label) : '';
  }

  function paintStrip(node) {
    strip.textContent = '';
    var fields = stripFields(node);
    if (!fields.length) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;
    for (var i = 0; i < fields.length; i++) {
      var row = document.createElement('div');
      row.className = 'cm-strip-' + fields[i].key;
      row.textContent = fields[i].value;
      strip.appendChild(row);
    }
  }

  function selectedNode() {
    var graph = graphForLayer(state.layer, state.workspace, state.run);
    var id = state.selected[state.layer];
    if (!id) {
      return null;
    }
    for (var i = 0; i < graph.nodes.length; i++) {
      if (graph.nodes[i].id === id) {
        return graph.nodes[i];
      }
    }
    return null;
  }

  function inspect(node) {
    if (!node) {
      return;
    }
    state.selected[state.layer] = node.id;
    paintStrip(node);
    vscode.postMessage(selectPost(node.id));
    paintCanvas();
  }

  function tryOpen(node) {
    var msg = openPost(node);
    if (msg) {
      vscode.postMessage(msg);
    }
  }

  function tryExpand(node) {
    var msg = expandPost(node);
    if (msg) {
      vscode.postMessage(msg);
    }
  }

  function paintEmpty() {
    var copy =
      state.layer === 'run' ? runEmptyCopy(state.run) : workspaceEmptyCopy(state.workspace);
    if (!copy) {
      empty.hidden = true;
      empty.textContent = '';
      return;
    }
    empty.hidden = false;
    empty.textContent = copy;
  }

  function paintCanvas() {
    while (viewport.firstChild) {
      viewport.removeChild(viewport.firstChild);
    }
    var graph = graphForLayer(state.layer, state.workspace, state.run);
    var nodes = graph.nodes;
    var edges = edgesOnLayer(nodes, graph.edges);
    var pos = layout(nodes, edges);
    var selectedId = state.selected[state.layer];
    var i;

    var edgeGroup = document.createElementNS(ns, 'g');
    edgeGroup.setAttribute('class', 'cm-edges');
    for (i = 0; i < edges.length; i++) {
      var edge = edges[i];
      var a = pos[edge.from];
      var b = pos[edge.to];
      if (!a || !b) {
        continue;
      }
      var line = document.createElementNS(ns, 'path');
      var x1 = a.x + NODE_W;
      var y1 = a.y + NODE_H / 2;
      var x2 = b.x;
      var y2 = b.y + NODE_H / 2;
      var mid = (x1 + x2) / 2;
      line.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + mid + ' ' + y1 + ' ' + mid + ' ' + y2 + ' ' + x2 + ' ' + y2);
      line.setAttribute('class', 'cm-edge');
      line.setAttribute('data-kind', edge.kind || '');
      edgeGroup.appendChild(line);
    }
    viewport.appendChild(edgeGroup);

    var nodeGroup = document.createElementNS(ns, 'g');
    nodeGroup.setAttribute('class', 'cm-nodes');
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var p = pos[node.id];
      if (!p) {
        continue;
      }
      var g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'cm-node' + (node.id === selectedId ? ' is-selected' : ''));
      g.setAttribute('data-id', node.id);
      g.setAttribute('data-kind', node.kind || '');
      if (node.symbolKind) {
        g.setAttribute('data-symbol-kind', node.symbolKind);
      }
      g.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ')');
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');

      var rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('width', String(NODE_W));
      rect.setAttribute('height', String(NODE_H));
      rect.setAttribute('rx', '4');
      rect.setAttribute('class', 'cm-node-rect');
      g.appendChild(rect);

      var text = document.createElementNS(ns, 'text');
      text.setAttribute('x', node.uri && (node.kind === 'file' || node.kind === 'folder') ? '22' : '10');
      text.setAttribute('y', String(NODE_H / 2 + 4));
      text.setAttribute('class', 'cm-node-label');
      text.textContent = nodeLabel(node);
      g.appendChild(text);

      if (node.uri && (node.kind === 'file' || node.kind === 'folder')) {
        var plus = document.createElementNS(ns, 'text');
        plus.setAttribute('x', '8');
        plus.setAttribute('y', String(NODE_H / 2 + 4));
        plus.setAttribute('class', 'cm-node-expand');
        plus.textContent = '+';
        plus.setAttribute('data-expand', '1');
        g.appendChild(plus);
      }

      g.addEventListener('click', onNodeClick);
      g.addEventListener('dblclick', onNodeDblClick);
      g.addEventListener('keydown', onNodeKey);
      nodeGroup.appendChild(g);
    }
    viewport.appendChild(nodeGroup);
    applyPan();
  }

  function nodeFromTarget(target) {
    var el = target;
    while (el && el !== svg) {
      if (el.getAttribute && el.getAttribute('data-id')) {
        var id = el.getAttribute('data-id');
        var graph = graphForLayer(state.layer, state.workspace, state.run);
        for (var i = 0; i < graph.nodes.length; i++) {
          if (graph.nodes[i].id === id) {
            return { node: graph.nodes[i], el: el };
          }
        }
      }
      el = el.parentNode;
    }
    return null;
  }

  function onNodeClick(ev) {
    ev.stopPropagation();
    var hit = nodeFromTarget(ev.target);
    if (!hit) {
      return;
    }
    if (ev.target.getAttribute && ev.target.getAttribute('data-expand') === '1') {
      tryExpand(hit.node);
      inspect(hit.node);
      return;
    }
    inspect(hit.node);
  }

  function onNodeDblClick(ev) {
    ev.stopPropagation();
    var hit = nodeFromTarget(ev.target);
    if (!hit) {
      return;
    }
    inspect(hit.node);
    tryOpen(hit.node);
  }

  function onNodeKey(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') {
      return;
    }
    ev.preventDefault();
    var hit = nodeFromTarget(ev.target);
    if (hit) {
      inspect(hit.node);
    }
  }

  function paint() {
    sizeSvg();
    paintEmpty();
    paintCanvas();
    paintStrip(selectedNode());
  }

  svg.addEventListener('pointerdown', function (ev) {
    if (nodeFromTarget(ev.target)) {
      return;
    }
    state.dragging = { x: ev.clientX, y: ev.clientY, ox: state.pan.x, oy: state.pan.y };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove', function (ev) {
    if (!state.dragging) {
      return;
    }
    state.pan.x = state.dragging.ox + (ev.clientX - state.dragging.x);
    state.pan.y = state.dragging.oy + (ev.clientY - state.dragging.y);
    applyPan();
  });
  svg.addEventListener('pointerup', function () {
    state.dragging = null;
  });
  svg.addEventListener('pointerleave', function () {
    state.dragging = null;
  });
  svg.addEventListener(
    'wheel',
    function (ev) {
      ev.preventDefault();
      var factor = ev.deltaY < 0 ? 1.08 : 0.92;
      var next = Math.min(3, Math.max(0.35, state.pan.k * factor));
      var box = svg.getBoundingClientRect();
      var cx = ev.clientX - box.left;
      var cy = ev.clientY - box.top;
      var k = state.pan.k;
      state.pan.x = cx - ((cx - state.pan.x) * next) / k;
      state.pan.y = cy - ((cy - state.pan.y) * next) / k;
      state.pan.k = next;
      applyPan();
    },
    { passive: false },
  );

  window.addEventListener('resize', function () {
    sizeSvg();
  });

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || !msg.type) {
      return;
    }
    if (msg.type === 'contextMap/workspace') {
      state.workspace = {
        nodes: Array.isArray(msg.nodes) ? msg.nodes : [],
        edges: Array.isArray(msg.edges) ? msg.edges : [],
        scopeHint: msg.scopeHint,
        focusUri: msg.focusUri,
      };
      paint();
      return;
    }
    if (msg.type === 'contextMap/run') {
      state.run = {
        nodes: Array.isArray(msg.nodes) ? msg.nodes : [],
        edges: Array.isArray(msg.edges) ? msg.edges : [],
      };
      paint();
    }
  });

  paint();
  vscode.postMessage({ type: 'ui/ready' });
})();
