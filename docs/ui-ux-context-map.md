# Bot Rider — UI/UX addendum: Context Map

Fold into `ui-ux-spec.md` as **§25**. Fourth view in the **existing** Bot Rider container. Order: **Bots → Chat → Context Map → Proposed Changes**. Do **not** reopen §20 Attach, §22 model picker, §23 export/import, or §24 OpenSpec chips. Not a second Activity Bar icon. Not Graphify vendor UI.

Architecture: [architecture-context-map.md](./architecture-context-map.md). Additive. **CM-1–4 locked.** Webview graph canvas. Two layers, toggle, not merged in MVP. Click inspects. Never auto-Approve. Never Copilot Send. Never execute. Never dump full-file into Swarm. OpenSpec chips stay on Proposed Changes Files (§24). The map is **not** a spec browser.

## 25. Context Map (F1, Bot Rider–owned)

**Status:** Additive after §24. **CM-1–4 locked.** Fourth view in the existing container. Not a second Activity Bar icon. Not Graphify vendor UI. Not Swarm chrome. Not token chrome. Not F7 parallel. Not leftovers 002/003/009/014. Do **not** reopen §20 / §22 / §23 / §24.

Locked ids (camelCase): view `botRider.contextMap` (contribution `botrider.contextMap`). Title **Context Map**. Type: **Webview**. Refresh command `botRider.contextMap.refresh` (contribution `botrider.contextMap.refresh`).

### 25.1 Surfaces

One Activity Bar container (`botrider` / **Bot Rider**). **Not** a second `viewsContainer`.

| Surface | Id | Type | Notes |
| --- | --- | --- | --- |
| Context Map | `botRider.contextMap` | webview view | Graph canvas. Title **Context Map**. |

Locked order in the container:

1. Bots
2. Chat
3. **Context Map**
4. Proposed Changes

First-run **visible** (recommendation). After the user changes the layout, respect the user — do not force-visible on every activate.

`retainContextWhenHidden` stays **only** on Swarm sidebar + Expand. Context Map does not take that lock.

Approve / Reject / Retry stay on Proposed Changes (BR-6). MCP Approve / Reject stay Grain B. OpenSpec chips stay on Files rows (§24). Composer / Send stay on Chat.

### 25.2 Layer toggle (CM-2)

Same view. Segmented control at the top of the webview:

| Segment | Layer |
| --- | --- |
| **Workspace** | Code / workspace neighborhood |
| **This run** | Session graph |

Do **not** merge the two graphs in MVP. Switching segments swaps the canvas. No fake edges.

### 25.3 Canvas and nodes

VS Code webview tokens (`--vscode-*`). No Graphify theme. No fake vendor chrome.

**Workspace** nodes:

| Kind | Label | Tint |
| --- | --- | --- |
| File | basename | default |
| Symbol | symbol name | kind tint |
| Folder | folder name | default (optional tree) |

**This run** nodes:

| Kind | Label |
| --- | --- |
| Bot | `@{handle}` |
| SI packet | host label (not the verbatim packet body) |
| Proposed file | path as on Proposed Changes |

Edges only when the host sent them. Do not invent links in the UI.

Free layout (pan / zoom). TreeView is **not** this surface.

### 25.4 Detail strip (CM-3)

A strip **below** the canvas (not a modal, not a Swarm row, not an Approve bar).

On click, show **label**, **path** (when present), **kind**. Missing fields omitted. Do not dump full file text. Do not dump SI-2 packet bodies. Do not dump spec.md.

| Gesture | Chrome |
| --- | --- |
| Click | Inspect in the strip. Post `contextMap/select { nodeId }`. |
| Double-click file or symbol | Optional `contextMap/open { nodeId }`. Host MAY `vscode.open` / reveal range if a location exists. Still not Approve. Still not Copilot Send. |
| Click proposed-file node | MAY focus that Proposed Changes Files row. Does **not** Approve. Does **not** auto Open Diff. |

Never auto-Approve. Never Copilot `sendRequest`. Never execute. Never paste full-file into Swarm.

### 25.5 Empty states

Exact copy. **No error toast** for an incomplete graph.

| Layer | When | Copy |
| --- | --- | --- |
| Workspace | No workspace folder | `No folder.` |
| Workspace | Fetching the current file neighborhood | `Mapping this file…` |
| Workspace | Folder open, neighborhood empty | `No files yet.` |
| This run | No session graph yet (including after reload) | `Send a prompt in Chat to see this run.` |

Do not add an OpenSpec-empty banner. Do not add a Graphify install banner.

### 25.6 Refresh (Workspace)

**Refresh** is view/title on `botRider.contextMap`, command `botRider.contextMap.refresh`, title **Refresh**.

Re-fetches the **current neighborhood only**. Not a whole-workspace crawl. Does not by itself rebuild This run.

Expanding a file node (UI → host `contextMap/expand-file { uri }`) loads **that file’s** children / symbols only.

### 25.7 Host ↔ UI

- Host → UI: `contextMap/workspace { nodes, edges, scopeHint?, focusUri? }` — neighborhood only.
- Host → UI: `contextMap/run { nodes, edges }` — session; empty after reload until the next run.
- UI → host: `contextMap/expand-file { uri }` — tree children / that file’s symbols.
- UI → host: `contextMap/select { nodeId }`.
- UI → host: optional `contextMap/open { nodeId }`.
- SI packets: optional `nodeIds[]` extras only (host). Omit unknown/stale. Never replace verbatim body. Never block.
- UI never crawls the workspace, never runs LSP/AST itself, never executes, never dumps full file text, never calls `vscode.lm`.

### 25.8 Unchanged

§17 Run board. §18 article prose. §19 MCP Grain B. §20 Attach. §22 model picker. §23 export/import. §24 OpenSpec chips on Files rows. Round headers. Split Continue / Pick / Stop. Composer. Approve/Reject still whole-changeset BR-6.

### 25.9 Out

Second Activity Bar icon · Graphify vendor UI · merged one-graph MVP · whole-workspace crawl on open · auto-Approve · Copilot Send from the map · execute · dump full-file into Swarm · spec browser / click-to-filter on the map · F3 dashboard · F4 register · F7 parallel · leftovers 002/003/009/014 · reopening §20 / §22 / §23 / §24.
