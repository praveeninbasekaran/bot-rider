import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { proposedFileChrome } from '../src/adapters/review-chrome';

const root = join(__dirname, '..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

const js = src('media/context-map.js');
const css = src('media/context-map.css');
const view = src('src/adapters/context-map-view.ts');
const html = src('src/adapters/webview-html.ts');
const proto = src('src/protocol/messages.ts');
const reviewChrome = src('src/adapters/review-chrome.ts');
const reviewTree = src('src/adapters/review-tree.ts');
const chatJs = src('media/chat.js');
const host = src('src/app/context-map.ts');
const extension = src('src/extension.ts');

function extractBlock(source: string, startNeedle: string): string {
  const start = source.indexOf(startNeedle);
  expect(start, startNeedle).toBeGreaterThan(-1);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`unbalanced ${startNeedle}`);
}

const chrome = new Function(
  `${extractBlock(js, 'const COPY = {')};
   ${extractBlock(js, 'function sanitize(')};
   ${extractBlock(js, 'function workspaceEmptyCopy(')};
   ${extractBlock(js, 'function runEmptyCopy(')};
   ${extractBlock(js, 'function graphForLayer(')};
   ${extractBlock(js, 'function edgesOnLayer(')};
   ${extractBlock(js, 'function stripFields(')};
   ${extractBlock(js, 'function selectPost(')};
   ${extractBlock(js, 'function openPost(')};
   ${extractBlock(js, 'function expandPost(')};
   return {
     COPY, sanitize, workspaceEmptyCopy, runEmptyCopy, graphForLayer,
     edgesOnLayer, stripFields, selectPost, openPost, expandPost,
   };`,
)() as {
  COPY: { noFolder: string; fetching: string; noFiles: string; noRun: string };
  sanitize: (text: unknown) => string;
  workspaceEmptyCopy: (payload: { nodes: { kind: string }[] } | null) => string;
  runEmptyCopy: (payload: { nodes: unknown[] } | null) => string;
  graphForLayer: (
    layer: string,
    workspace: { nodes: unknown[]; edges: unknown[] } | null,
    run: { nodes: unknown[]; edges: unknown[] } | null,
  ) => { nodes: unknown[]; edges: unknown[] };
  edgesOnLayer: (
    nodes: { id: string }[],
    edges: { from: string; to: string; kind?: string }[],
  ) => { from: string; to: string; kind?: string }[];
  stripFields: (node: Record<string, unknown> | null) => { key: string; value: string }[];
  selectPost: (nodeId: string) => { type: string; nodeId: string };
  openPost: (node: { id: string; kind: string } | null) => { type: string; nodeId: string } | null;
  expandPost: (node: { kind: string; uri?: string } | null) => { type: string; uri: string } | null;
};

describe('Context Map chrome (§25 CM-2/3)', () => {
  it('reuses webviewHtml + vscode-webview.css and does not take retainContextWhenHidden', () => {
    expect(view).toContain("scriptFile: 'context-map.js'");
    expect(view).toContain("styleFile: 'context-map.css'");
    expect(view).toContain("extraStyles: ['vscode-webview.css']");
    expect(view).toContain("bodyClass: 'context-map'");
    expect(view).toContain('webviewHtml(');
    expect(view).not.toContain('retainContextWhenHidden');
    expect(extension).toContain('registerWebviewViewProvider(ContextMapViewProvider.viewId, mapView)');
    expect(extension).toContain("{ webviewOptions: { retainContextWhenHidden: true } }");
    expect(html).toContain("`default-src 'none'`");
    expect(js.split('acquireVsCodeApi()')).toHaveLength(2);
  });

  it('empty copy is exact and has no error toast or vendor banners', () => {
    expect(chrome.COPY.noFolder).toBe('No folder.');
    expect(chrome.COPY.fetching).toBe('Mapping this file…');
    expect(chrome.COPY.noFiles).toBe('No files yet.');
    expect(chrome.COPY.noRun).toBe('Send a prompt in Chat to see this run.');
    expect(chrome.workspaceEmptyCopy(null)).toBe('Mapping this file…');
    expect(chrome.workspaceEmptyCopy({ nodes: [] })).toBe('No folder.');
    expect(chrome.workspaceEmptyCopy({ nodes: [{ kind: 'folder' }] })).toBe('No files yet.');
    expect(chrome.workspaceEmptyCopy({ nodes: [{ kind: 'file' }] })).toBe('');
    expect(chrome.workspaceEmptyCopy({ nodes: [{ kind: 'symbol' }] })).toBe('');
    expect(chrome.runEmptyCopy(null)).toBe('Send a prompt in Chat to see this run.');
    expect(chrome.runEmptyCopy({ nodes: [] })).toBe('Send a prompt in Chat to see this run.');
    expect(chrome.runEmptyCopy({ nodes: [{ kind: 'bot' }] })).toBe('');
    expect(js).toContain('empty.textContent = copy');
    expect(js).not.toMatch(/showErrorMessage|showWarningMessage|error toast/i);
    expect(js).not.toMatch(/OpenSpec-empty|openspec empty|No specs/i);
    expect(js).not.toMatch(/Graphify/i);
    expect(css).not.toMatch(/Graphify/i);
    expect(js).not.toMatch(/install Graphify|Graphify install/i);
  });

  it('toggle isolates Workspace and This run; does not merge graphs or invent edges', () => {
    expect(js).toContain('Workspace');
    expect(js).toContain('This run');
    expect(js).toContain('data-layer="workspace"');
    expect(js).toContain('data-layer="run"');
    expect(js).not.toMatch(/concat\(|spread|\[ \.\.\.workspace|mergedGraph|one-graph/i);

    const workspace = {
      nodes: [
        { id: 'file:a', kind: 'file', label: 'app.ts' },
        { id: 'sym:n', kind: 'symbol', label: 'n' },
      ],
      edges: [{ from: 'file:a', to: 'sym:n', kind: 'contains' }],
    };
    const run = {
      nodes: [
        { id: 'bot:1', kind: 'bot', label: '@alpha' },
        { id: 'p1', kind: 'packet', label: 'Turn' },
        { id: 'proposed:src/out.ts', kind: 'proposedFile', label: 'src/out.ts' },
      ],
      edges: [
        { from: 'bot:1', to: 'p1', kind: 'published' },
        { from: 'p1', to: 'file:a', kind: 'mapsTo' },
      ],
    };
    const ws = chrome.graphForLayer('workspace', workspace, run);
    const session = chrome.graphForLayer('run', workspace, run);
    expect(ws.nodes).toEqual(workspace.nodes);
    expect(session.nodes).toEqual(run.nodes);
    expect(ws.nodes.some((n) => (n as { kind: string }).kind === 'bot')).toBe(false);
    expect(session.nodes.some((n) => (n as { kind: string }).kind === 'file')).toBe(false);
    expect(chrome.edgesOnLayer(ws.nodes as { id: string }[], ws.edges as { from: string; to: string }[])).toEqual([
      { from: 'file:a', to: 'sym:n', kind: 'contains' },
    ]);
    expect(
      chrome.edgesOnLayer(session.nodes as { id: string }[], session.edges as { from: string; to: string; kind?: string }[]),
    ).toEqual([{ from: 'bot:1', to: 'p1', kind: 'published' }]);
    expect(js).toContain('edgesOnLayer(nodes, graph.edges)');
    expect(js).toContain("msg.type === 'contextMap/workspace'");
    expect(js).toContain("msg.type === 'contextMap/run'");
  });

  it('click inspects label/path/kind and never Approves, Sends, executes, or dumps bodies', () => {
    expect(chrome.selectPost('file:a')).toEqual({ type: 'contextMap/select', nodeId: 'file:a' });
    expect(js).toContain('vscode.postMessage(selectPost(node.id))');
    expect(
      chrome.stripFields({
        id: 'file:a',
        kind: 'file',
        label: 'app.ts',
        path: 'src/app.ts',
        body: 'export const n = 1',
        text: 'FULL FILE',
      }),
    ).toEqual([
      { key: 'label', value: 'app.ts' },
      { key: 'path', value: 'src/app.ts' },
      { key: 'kind', value: 'file' },
    ]);
    expect(chrome.stripFields({ id: 'bot:1', kind: 'bot', label: '@alpha' })).toEqual([
      { key: 'label', value: '@alpha' },
      { key: 'kind', value: 'bot' },
    ]);
    expect(chrome.stripFields({ id: 'p1', kind: 'packet', label: 'Turn', requirements: ['REQ'] })).toEqual([
      { key: 'label', value: 'Turn' },
      { key: 'kind', value: 'packet' },
    ]);
    expect(js).toContain('row.textContent = fields[i].value');
    expect(js).not.toContain("type: 'changeset/approve'");
    expect(js).not.toContain("type: 'changeset/reject'");
    expect(js).not.toContain("type: 'chat/send'");
    expect(js).not.toContain("type: 'mcp/actions-approve'");
    expect(js).not.toContain("type: 'review/open-diff'");
    expect(js).not.toMatch(/sendRequest|applyEdit|vscode\.lm|executeCommand/);
    expect(js).not.toMatch(/spec\.md|packet body|verbatim/);
    expect(js).not.toContain('workspace.fs');
    expect(js).not.toContain('executeDocumentSymbolProvider');
  });

  it('double-click file/symbol MAY open; proposed-file click does not Approve or Open Diff', () => {
    expect(chrome.openPost({ id: 'file:a', kind: 'file' })).toEqual({ type: 'contextMap/open', nodeId: 'file:a' });
    expect(chrome.openPost({ id: 'sym:n', kind: 'symbol' })).toEqual({ type: 'contextMap/open', nodeId: 'sym:n' });
    expect(chrome.openPost({ id: 'bot:1', kind: 'bot' })).toBeNull();
    expect(chrome.openPost({ id: 'proposed:x', kind: 'proposedFile' })).toBeNull();
    expect(js).toContain('vscode.postMessage(msg)');
    expect(js).toContain('function tryOpen');
    expect(js).toContain('onNodeDblClick');
    expect(chrome.expandPost({ kind: 'file', uri: 'file:///ws/src/app.ts' })).toEqual({
      type: 'contextMap/expand-file',
      uri: 'file:///ws/src/app.ts',
    });
    expect(chrome.expandPost({ kind: 'file' })).toBeNull();
    expect(chrome.expandPost({ kind: 'symbol', uri: 'file:///ws/src/app.ts' })).toBeNull();
    expect(js).not.toContain("type: 'contextMap/refresh'");
    expect(proto).not.toMatch(/contextMap\/refresh/);
  });

  it('uses host labels, --vscode tokens only, and sanitizes innerHTML', () => {
    expect(js).toContain('node.label');
    expect(js).not.toMatch(/packet\.requirements|packet\.decisions|readFile\(/);
    expect(css).toMatch(/--vscode-/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(css).not.toMatch(/rgb\(|hsl\(/);
    expect(chrome.sanitize('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;');
    expect(js).toContain('function sanitize(');
    expect(js).toContain('textContent = nodeLabel(node)');
    expect(css).toContain('var(--vscode-symbolIcon-classForeground');
    expect(css).toContain('var(--vscode-editor-background)');
    expect(css).toContain('var(--vscode-sideBar-background)');
    expect(js).toContain('wheel');
    expect(js).toContain('state.pan');
    expect(js).not.toMatch(/TreeView|createTreeView/);
  });

  it('leaves MCP, Swarm, and §24 OpenSpec chips untouched', () => {
    expect(proposedFileChrome({ path: 'src/app.ts', op: 'update', specIds: ['BR-6', 'EX-1'] }).description).toBe(
      'Modified · BR-6 · EX-1',
    );
    expect(reviewChrome).toContain('specIds && specIds.length > 0 ? `${description} · ${specIds.join(\' · \')}`');
    expect(reviewTree).toContain('proposedFileChrome(file)');
    expect(reviewTree).toContain('item.description = chrome.description');
    expect(js).not.toMatch(/specIds|OpenSpec|openspec\//);
    expect(css).not.toMatch(/specIds|OpenSpec|chip/);
    expect(chatJs).toContain("type: 'chat/send'");
    expect(chatJs).toContain("id=\"run-board\"");
    expect(chatJs).toContain("'MCP actions · ' + list.length");
    expect(js).not.toContain('run-board');
    expect(js).not.toContain('mcp/actions');
    expect(host).toContain("type: 'contextMap/workspace'");
    expect(host).toContain('fileSymbols');
  });
});
