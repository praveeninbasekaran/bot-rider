# Bot Rider — F1 Context Map / CM-1–4 (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR, QC, HV, MA, SD, TA, MS, SI, EX, or OS. **Not** Graphify vendor UI (F1 Graphify-as-vendor stays **out**). **Not** F3 dashboard / F4 register. **Not** F7 parallel / Event Bus / concurrent `sendRequest`. Layers on frozen F6 / F7 / F2.
Stories: **CM-1–4 is the full story set.** **CM-1** Fourth view in the **existing** Bot Rider container. Order: **Bots → Chat → Context Map → Proposed Changes**. View id `botRider.contextMap` (contribution `botrider.contextMap`). Title **Context Map**. Type: **Webview** (graph canvas; TreeView cannot carry edges + free layout). **Not** a second Activity Bar icon. **Not** Graphify vendor UI. Bot Rider–owned. First-run **visible** (recommendation); after first layout, respect the user. **CM-2** Two layers in the **same** view, toggle; do **not** merge into one graph in MVP. **Code / Workspace:** on-demand neighborhood of **current selection / active editor**. Workspace root MAY show as an expandable file tree. **Do not** crawl whole-workspace symbols on view open. Expanding a **file node** MAY load **that file’s** symbols. Read-only. **Session / This run:** bots, published SI packets, proposed files. **Session-only** (reload clears). **CM-3** Click inspects label / path / kind in a detail strip. Never auto-Approve. Never Copilot `sendRequest`. Never execute. Never dump full-file into Swarm. Double-click file/symbol MAY `vscode.open` / reveal range if host provides location — still not Approve, still not Copilot Send. Clicking a proposed-file node MAY focus that Proposed Changes row — does not Approve. **CM-4** Host MAY attach graph node ids on published SI packets when a packet maps to a code node. Additive extras only. Do **not** replace SI-2 verbatim bodies. Unknown/stale id: **omit**, do **not** block the packet or the turn. Required spec / requirement bodies still QC-3 / SI-4.
UI chrome contract: `ui-ux-spec.md` §25 (addendum `ui-ux-context-map.md`).
Date: 2026-09-02.
Parent: `architecture-mvp.md`. Isolation: `architecture-bot-isolation.md` (SI sequential + required packets). OpenSpec: `architecture-openspec-trace.md` (chips stay on Proposed Changes Files, §24; the map is **not** a spec browser). Pack: `architecture-token-save.md` (QC minimum pack unchanged; required published packets and required spec bodies still must not be silently trimmed). Copilot stays `vscode.lm`. Sequential Debate unchanged. ₹0 extra keys. No second runtime.

Split (when PO allocates; **do not allocate in this docs PR**): **Developer 1** host (neighborhood provider, this-run graph, expand-file, optional SI `nodeIds`, open/focus). **Developer 2** §25 chrome (fourth view, layer toggle, canvas, detail strip, empty states). QA after both, on a **new product PR** after this docs PR merges, **not stacked here**. F2 product is a **separate** PR; do not duplicate OS-1–4 here.

---

## Story map (CM-1–4)

CM-1–4 stay the set. No new stories.

### CM-1 Fourth view

Fourth view in the **existing** Bot Rider container (`botrider`). Order: **Bots → Chat → Context Map → Proposed Changes**. View id `botRider.contextMap`. Title **Context Map**. Type: Webview. **Not** a second Activity Bar icon. **Not** Graphify vendor UI. Bot Rider–owned. First-run visible (recommendation); after first layout, respect the user.

### CM-2 Two layers

Same view, toggle. Do **not** merge into one graph in MVP.

- **Code / Workspace:** on-demand neighborhood of **current selection / active editor**. Workspace root MAY show as an expandable file tree. **Do not** crawl whole-workspace symbols on view open. Expanding a **file node** MAY load **that file’s** symbols. Read-only.
- **Session / This run:** bots, published SI packets, proposed files. **Session-only** (reload clears). Empty after reload until the next run.

### CM-3 Inspect

Click inspects label / path / kind in a detail strip. Never auto-Approve. Never Copilot `sendRequest`. Never execute. Never dump full-file into Swarm. Double-click file/symbol MAY `vscode.open` / reveal range if the host provided a location — still not Approve, still not Copilot Send. Clicking a proposed-file node MAY focus that Proposed Changes row — does not Approve.

### CM-4 Packet node ids

Host MAY attach graph node ids on published SI packets when a packet maps to a code node. Additive extras only. Do **not** replace SI-2 verbatim bodies. Unknown/stale id: **omit**, do **not** block the packet or the turn. Required spec / requirement bodies still QC-3 / SI-4.

---

## 0. Non-negotiables

- **(CM-1)** One new view in the existing `botrider` container. Contribution order: `botrider.bots` → `botrider.chat` → `botrider.contextMap` → `botrider.review`. **Not** a second `viewsContainer`. **Not** a second Activity Bar icon.
- **(CM-1)** View is a **Webview**. TreeView cannot carry edges and free layout. Title **Context Map**. Design id `botRider.contextMap` maps 1:1 to `botrider.contextMap`.
- **(CM-1)** Bot Rider–owned canvas and chrome. **Not** Graphify vendor UI, Graphify MCP canvas, or an in-tree Graphify port. F1 Graphify-as-vendor stays **out**.
- **(CM-1)** First-run **visible** is a recommendation (`visibility` visible on first contribute). After the user changes the layout, **respect the user** — do not force-visible on every activate.
- **(CM-1)** `retainContextWhenHidden` stays Swarm-only (`botrider.chat` + Expand). Context Map does **not** take that lock. Host re-sends the last `contextMap/workspace` and `contextMap/run` when the view becomes visible.
- **(CM-2)** Two layers, **toggle**, same view. Do **not** merge Workspace nodes and This-run nodes into one graph in MVP. No fake edges.
- **(CM-2)** Workspace graph is an **on-demand neighborhood** of the current selection / active editor. **Do not** crawl whole-workspace symbols on view open. Expanding a **file node** MAY load **that file’s** symbols only. Workspace root MAY appear as an expandable file tree (children on expand, not an eager crawl).
- **(CM-2)** Workspace graph is **read-only**. UI never writes disk, never `applyEdit`, never mutates bots.
- **(CM-2)** This-run graph is **session-only**. Reload / run clear empties it until the next run. Do **not** persist it to `globalState` / BR-3.
- **(CM-3)** Click = inspect (detail strip: label, path, kind). **Never** auto-Approve. **Never** Copilot `sendRequest`. **Never** execute. **Never** dump full-file text into Swarm / composer / isolation packets.
- **(CM-3)** Double-click file/symbol MAY `vscode.open` / reveal range **only if** the host provided a location on that node. Missing location: inspect only. Still not Approve. Still not Copilot Send.
- **(CM-3)** Clicking a proposed-file node MAY focus / reveal that Proposed Changes Files row. Does **not** Approve, Reject, or Open Diff unless the user then uses existing Review chrome.
- **(CM-4)** `nodeIds?: string[]` on published SI packets is an **additive extra**. Omit unknown/stale ids. Do **not** replace SI-2 verbatim `requirements` / `decisions` / `constraints` / `openQuestions`. Do **not** block the packet or the turn. Do **not** change OS-4 spec-body ingest.
- **(CM-4)** Required spec bodies (OS-4) and required published packets (SI-4) still join the QC required set. Incomplete graph is **not** pack-overflow. Missing / stale node ids are **not** QC-3. TokenGovernor unchanged otherwise.
- UI never crawls the workspace, never runs LSP / AST itself, never calls `vscode.lm`, never `applyEdit`.
- OpenSpec chips stay on Proposed Changes **Files** rows (§24). The map is **not** a spec browser, not a catalog, not click-to-filter for `specIds`.
- Sequential orchestrator unchanged (SI-3). Visible Swarm stays HV. §20 / §22 / §23 / §24 untouched.
- BR / QC / HV / MA / SD / TA / MS / SI / EX / OS frozen otherwise. Leftovers 002 / 003 / 009 / 014 out. F3 / F4 out. F7 Event Bus / parallel out. Marketplace / API keys / Settings Sync out.

---

## 1. Component

```
Existing Bot Rider container (one Activity Bar icon)
  Bots (tree)
  Chat / Swarm (webview)
  Context Map (webview)          ← this slice, CM-1
  Proposed Changes (tree)

Context Map webview
  toggle: Workspace | This run   ← CM-2, not merged

Workspace (host)
  on view visible / active editor / selection / Refresh
    neighborhood of current selection / active editor only
    NOT whole-workspace symbol crawl
  optional workspace-root file tree: children on expand
  expand file node → that file’s symbols only
  post contextMap/workspace { nodes, edges, scopeHint?, focusUri? }

This run (host)
  bots (active / this-run speakers) + published SI packets + proposed files
  session-only; reload → empty until next run
  post contextMap/run { nodes, edges }

SI publish (existing SI-2 moments)
  IsolationPacket fields verbatim (SI-2)
  optional nodeIds[] extras when packet maps to a known code node (CM-4)
  unknown/stale id → omit; never block; never replace bodies

Click node (CM-3)
  UI detail strip = label / path / kind
  UI → host contextMap/select { nodeId }
  never Approve · never sendRequest · never execute · never dump file text

Double-click file/symbol (optional)
  UI → host contextMap/open { nodeId }
  host vscode.open / reveal range if location present; else no-op
  still not Approve · still not Copilot Send

Click proposed-file node (optional)
  host MAY reveal that Proposed Changes Files row
  does not Approve
```

---

## 2. View (CM-1)

Contribute `botrider.contextMap` as a **webview view** in the existing `botrider` container.

| Kind | Id (`botrider.*`) | Legacy (`botRider.*`) | Role |
| --- | --- | --- | --- |
| Webview view | `botrider.contextMap` | `botRider.contextMap` | Context Map (graph canvas) |

Title: **Context Map**.

Placement (locked order):

1. Bots (`botrider.bots`)
2. Chat (`botrider.chat`)
3. Context Map (`botrider.contextMap`)
4. Proposed Changes (`botrider.review`)

Do **not** add `viewsContainers` / a second Activity Bar item. Do **not** replace Swarm or Review.

First-run: **visible**. After first layout, VS Code workspace state wins.

Refresh (Workspace layer): host command `botRider.contextMap.refresh` (contribution `botrider.contextMap.refresh`), title **Refresh**, `view/title` on `botRider.contextMap`. Re-fetches the **current neighborhood only**. Not a whole-workspace crawl. Not a This-run rebuild by itself.

No new context keys required. Do not invent `botrider.contextMapOpen` unless a later slice needs it.

---

## 3. Graph model (CM-2)

Two independent payloads. The UI toggles which canvas is shown. Host MAY post both; UI MUST NOT draw them as one graph in MVP.

```ts
type ContextMapNodeKind =
  | 'folder'
  | 'file'
  | 'symbol'
  | 'bot'
  | 'packet'
  | 'proposedFile';

type ContextMapNode = {
  id: string;
  kind: ContextMapNodeKind;
  label: string;           // file: basename; bot: @{handle}; proposedFile: path
  path?: string;           // workspace or proposed path (detail strip)
  uri?: string;            // vscode.open when present
  start?: { line: number; character: number }; // reveal range when present
  end?: { line: number; character: number };
  symbolKind?: string;     // host token for kind tint; omit on non-symbols
  handle?: string;         // bot
  packetId?: string;       // SI packet id
};

type ContextMapEdge = {
  from: string;
  to: string;
  kind: 'contains' | 'neighborhood' | 'published' | 'proposes' | 'mapsTo';
};

type ContextMapWorkspacePayload = {
  nodes: ContextMapNode[];
  edges: ContextMapEdge[];
  scopeHint?: string;      // e.g. active file basename
  focusUri?: string;
};

type ContextMapRunPayload = {
  nodes: ContextMapNode[];
  edges: ContextMapEdge[];
};
```

**No fake edges.** An edge exists only when the host has a fact (containment, LSP neighborhood hop, this-run publish, proposed file on the changeset, CM-4 maps-to). Do not invent “related” links.

Workspace nodes: `folder` (optional tree), `file` (basename), `symbol` (kind tint).

This-run nodes: `bot` labeled `@{handle}`, `packet` (SI packet; **not** the verbatim body on the canvas), `proposedFile` (path as on the changeset).

Do not put OpenSpec catalog ids on the map as nodes. Chips stay §24.

---

## 4. Workspace neighborhood (CM-2)

Host-owned. Trigger on: view visible, active editor change, selection change (debounced), **Refresh**, and `contextMap/expand-file`.

Scope:

- Current selection / active editor **neighborhood** only (that file, its symbols, and host-known one-hop facts the editor already has — e.g. document symbols / definition in that file).
- **Do not** walk every workspace file for symbols on open.
- No folder open: empty Workspace graph (empty-state **No folder.**). No error toast.
- Folder open, no files in the neighborhood yet: **No files yet.**
- While fetching the current file: **Mapping this file…** then replace with nodes. Incomplete neighborhood: show what landed; **no error toast**.

Expand:

- Workspace root MAY be a `folder` node. Expanding it loads **direct children** (files / folders), not a recursive symbol crawl.
- Expanding a **file** node MAY load **that file’s** symbols only. Host reads that URI (document symbols or equivalent). Do not prefetch sibling files.

Read-only. Host MUST NOT write the workspace from this view.

UI MUST NOT crawl, MUST NOT run LSP / AST, MUST NOT keep a private file index.

---

## 5. This-run graph (CM-2)

Host-owned, **session-only**.

Include:

- Bots that are in this run (active freeze / `@` speaker / implementer as the host already knows them). Label `@{handle}`.
- Published SI packets for this run (SI-2 moments). Node id is host-stable for the session (packet `id`).
- Proposed files on the pending changeset (same paths as Review).

Clear with ThreadStore / RunBoard / BotSessionStore on reload / run end / Reject-or-successful-Approve as those stores already clear. After reload: post `contextMap/run { nodes: [], edges: [] }` until the next run. Empty-state: **Send a prompt in Chat to see this run.**

Do **not** persist this graph. Do **not** restuff HV articles onto nodes.

Edges: `published` (bot → packet), `proposes` (packet or bot → proposedFile) when the host has that fact, `mapsTo` (packet → workspace code node id) only when a CM-4 id survived. No fake edges.

---

## 6. Protocol

Additive messages. Do **not** replace BR-1–6 members. Do **not** reopen attach / model / export / OpenSpec chip ports.

### Host → UI

`contextMap/workspace { nodes, edges, scopeHint?, focusUri? }` — neighborhood only.

`contextMap/run { nodes, edges }` — session; empty after reload until the next run.

### UI → host

`contextMap/expand-file { uri }` — tree / file children. Host responds with an updated `contextMap/workspace` that includes those children. Neighborhood only; not a workspace crawl.

`contextMap/select { nodeId }` — inspect. Host MAY no-op. Host MAY reveal a Proposed Changes row when `kind === 'proposedFile'`.

`contextMap/open { nodeId }` — optional; double-click. Host MAY `vscode.open` / reveal range when `uri` / range exist. Otherwise no-op. **Never** Approve. **Never** `sendRequest`. **Never** execute.

Refresh is the host command `botRider.contextMap.refresh` (not a webview protocol member). Host re-posts `contextMap/workspace` for the current neighborhood only.

### SI packet extra (CM-4)

```ts
type IsolationPacket = {
  id: string;
  fromBotId?: string;
  at: 'turn-end' | 'consensus' | 'pick';
  requirements: string[];
  decisions: string[];
  constraints: string[];
  openQuestions: string[];
  specs?: { id: string; body: string }[]; // OS-4; omit when empty; unchanged
  nodeIds?: string[]; // CM-4 extras only; omit unknown/stale; omit when empty
};
```

`nodeIds` are Context Map **code** node ids the host already emitted on `contextMap/workspace` (or will omit if they are gone). They do **not** replace verbatim SI-2 bodies. They do **not** replace OS-4 `specs[]`. Pack ingest still uses bodies. Unknown/stale: **omit** from the array; publish the packet anyway; do **not** block the turn.

Do **not** put graph ids into `requirements` as a substitute for AC.

---

## 7. Inspect / open (CM-3)

Detail strip is UI chrome (label, path, kind from the node DTO). Not a modal. Not a Swarm row. Not an Approve bar.

| Gesture | Effect |
| --- | --- |
| Click | Detail strip + `contextMap/select`. Never Approve / Send / execute / dump file |
| Double-click `file` / `symbol` | Optional `contextMap/open` → `vscode.open` / reveal if location present |
| Click / open `proposedFile` | MAY focus that Files row in Proposed Changes. Not Approve. Not auto Open Diff |
| Click `bot` / `packet` | Inspect only. Do not Copilot. Do not execute packet text |

Never auto-Approve (BR-6 and Grain B stay their own gates). Never Copilot `sendRequest` from this view. Never execute scripts/hooks. Never paste full file text into Swarm / isolation / composer.

---

## 8. Pack / TokenGovernor

Unchanged from QC-2 / SI-4 / OS-4.

`nodeIds` extras are **not** required pack bodies. They may be dropped from the packet as stale without QC-3. Incomplete Workspace graph is **not** an error and **not** pack-overflow.

Required published packets and required spec bodies still must not be silently trimmed. If they cannot fit → existing QC-3 `error` `code: 'pack-overflow'`, no `sendRequest`.

---

## 9. Out of this slice

Graphify vendor UI / Graphify MCP canvas / in-tree Graphify, second Activity Bar icon, merging the two layers into one MVP graph, whole-workspace symbol crawl on open, auto-Approve, Copilot Send from the map, execute, dumping full-file into Swarm, replacing SI-2 verbatim bodies with node ids, blocking a turn on unknown/stale ids, using the map as an OpenSpec spec browser / click-to-filter, F3 dashboard, F4 register, F7 Event Bus / parallel / concurrent `sendRequest`, leftovers 002 / 003 / 009 / 014, Marketplace, API keys, Settings Sync, reopening §20 / §22 / §23 / §24, rewriting BR-1–6, duplicating OS-1–4, product code in this docs PR.

---

## 10. Tests (docs only — list them, do not write vitest)

Merge bar after PO allocates, on a **new product PR**:

- Context Map is a webview in the existing Bot Rider container; order Bots → Chat → Context Map → Proposed Changes; no second Activity Bar icon. (CM-1)
- View title is **Context Map**. Not Graphify chrome. (CM-1)
- First-run visible; after the user hides/collapses, a later activate does not force it visible. (CM-1)
- Workspace and This run are a toggle; nodes from one layer do not appear on the other in MVP. (CM-2)
- Opening the view does not crawl whole-workspace symbols. (CM-2)
- Expanding a file node loads that file’s symbols only. (CM-2)
- This-run graph is empty after reload until the next run. (CM-2)
- Click shows label / path / kind; does not Approve; does not `sendRequest`; does not execute; does not dump full-file into Swarm. (CM-3)
- Double-click without location does not open; with location MAY `vscode.open` / reveal — still not Approve. (CM-3)
- Proposed-file node MAY focus the Review row and does not Approve. (CM-3)
- Published packet with a stale node id omits that id and still publishes; turn is not blocked. (CM-4)
- SI-2 verbatim bodies unchanged when `nodeIds` present. OS-4 spec bodies still required; QC-3 if they cannot fit. (CM-4)
- Incomplete graph: no error toast. (CM-2)
- Refresh re-fetches the current neighborhood only. (CM-2)
- Sequential: no overlapping `sendRequest`. (SI-3)
- WM / QC / HV / MA / SD / TA / MS / SI / EX / OS tests conceptually still pass.
