# Bot Rider — Token-save (additive slice)

Status: **locked for implementation.** Not a host rewrite of BR-1–BR-6. Do not change WM-1–4.
Date: 2026-08-28.
Parent: architecture-mvp.md. Workspace MCP unchanged (additive HostToUi in architecture-mvp.md + Swarm MCP-read consume). Chrome: `docs/ui-ux-run-board.md` §17 (fold into ui-ux-spec.md §17).

No Dev 1 / Dev 2 until this file is on the repo.

Story map: **QC-1, QC-2, QC-3** (this file). No new stories.

## 0. Non-negotiables (PO 2026-08-28 + §17 + BA + QC)

- Swarm **full prose**. `chat/token {botId,delta}` unchanged.
- Compact **run board IN Swarm** (sticky above transcript, sidebar + Expand). Goal, todos, decisions, one-line dissents, files in play. Not a fourth view. Not hidden-only. Not a bot.
- Copilot sees **board + LSP slice of the open file** on debate/@. Not full transcript. Not extra-tab body dumps. **Full file only on implementer.** Debate/@: slice **replaces** the full buffer (**not both**). Implementer: **no LSP slice**.
- **No speaker cap.** All active bots still speak. **No pre-Send estimate/gate/modal.**
- **TokenGovernor is HOST deterministic** (pack / trim / MCP loop cap / vote compact). Not a bot. Not vscode.lm. Not a Copilot skill. Steal i-have-adhd rule 5 only (host restates state onto the board). Do not install that skill into prompts.
- **No Graphify vendor.** LSP first. Optional later: WM may read Graphify MCP if the user already has it. Skip Graphify LLM/PDF/video pass.
- **Call-budget** = sendRequest count × size. Separate from maxInputTokens trim. Internal meter. Do not show it in chrome.
- Three stores: ThreadStore (full prose), RunBoard (Copilot pack + Swarm chrome), ChangesetStore (Approve still the only disk write). Board **dies with the session / reload**.
- Additive HostToUi. **BR-1–BR-6 protocol frozen.** Copilot-only. ₹0 extra keys.
- After **Approve**, invalidate LSP / file-hash slice. Hide board when the run clears (Approve/Reject).
- **No per-bot long memory across runs in v1.**
- **`dissents[]` is Split-only (PO A).** Vote DISSENT does **not** touch the board. Do not host two writers.

### BA locks (must match exactly)

1. LSP slice on debate and @-direct: **active file only**. Contents = diagnostics + document symbols + **enclosing range around selection**. **No 1-hop definition bodies.**
2. Implementer: **full file(s) being written + board**. The LSP slice does **not** replace implementer file bodies. **No LSP slice on implementer.**
3. Board: **host-owned from orchestrator facts**. No bot tool. No extra Copilot extract call. Optional parseable todo block merge only (host parse, still no extra sendRequest).
4. Overflow: trim extras first (MCP size, vote compact). If the **minimum pack** (prompt + board + slice-or-implementer-file + **tab paths**) will not fit maxInputTokens: visible Swarm error (`error` `code: 'pack-overflow'`, §17.11 copy), **no sendRequest**, **no silent retry**. Do **not** drop the LSP slice and still call.
5. Debate/@: LSP slice **replaces** the full buffer. **Not both.**
6. Three stores unchanged. Additive. BR-1–6 frozen.

## Story map (QC-1–QC-3)

QC-1–QC-3 stay the set. No new stories. Out of slice: Graphify in-tree, speaker cap, pre-Send call estimate, Copilot-backed token cop, fourth sidebar.

### QC-1 Compact run board in Swarm

Host-owned facts only. Full prose remains in the thread. Reload clears the board. No Graphify in-tree. No fourth sidebar. No bot board-write tool. No second Copilot extract.

- **AC1.** Goal = last Send (`userText`). Host-owned.
- **AC2 (PO A, locked).** Write `dissents[]` **ONLY** when Split opens (interrupt **OR** two-round no-agreement). One line per Split-card position: `@{handle}` plus a one-line reason. **Not** critique prose. **Not** vote DISSENT remainder. Clear `dissents[]` on Continue, on consensus, and when Approve/Reject/end clears the run. If Split opens again, rewrite. If they agree without Split, omit the Dissents region (no empty dual writer). Vote remainder may still exist for vote chrome / `chat/turn-end.vote`. It is **NOT** `dissents[]`. Vote does **not** update Dissents. Do not host two writers.
- **AC3.** Host todo list. Optional parseable todo block merge only (host parse, still no extra `sendRequest`). Sparse rather than invented. Chronological host order.
- **AC4.** Decisions = vote / split / Approve outcomes (host-owned one-liners).
- **AC5.** Files in play = changeset paths (plus named/active paths the host already tracks). Set `inChangeset` when `changeset/preview` matches. Paths only in chrome.
- **AC6.** Swarm still streams **full prose** for every active bot. The webview does **not** parse the board from bot markdown.
- **AC7.** Board is the sticky Run board **inside** Swarm. Not a fourth sidebar, not a pre-Send surface.
- **AC8.** Empty board (no goal, todos, decisions, files in play, or dissents) → Run board **hidden** when Swarm is shown.
- **AC9.** Session-only: reload clears the board with the transcript.

### QC-2 Compact Copilot pack

- **Debate/@:** this prompt + board + LSP slice + open tab paths + current-turn MCP reads (WM-2). Does **NOT** include full active-editor buffer, restuffed transcript, 1-hop definition bodies, other-tab bodies, or other-file dumps. LSP slice **REPLACES** full buffer (not both).
- **Implementer:** this prompt + board + full file(s) in play (files being written) + open tab paths. **No LSP slice** on implementer (slice does not replace implementer files).
- **LSP slice** (debate/@ only, active editor only): diagnostics + document symbols + enclosing range around current selection. No 1-hop definition bodies.
- Open tab paths stay **paths only**.
- Visible Swarm full prose. All active bots sequential. No speaker cap. No extra Send gate.

### QC-3 Host-side token regulation

- **AC1.** TokenGovernor host-only. No token-cop bot. Copilot not used to estimate/police. No pre-Send call estimate.
- **AC2.** Trim extras first (MCP payload size, vote compactness). Never restuff transcript.
- **AC3 (location lock).** If the minimum pack will not fit: visible Swarm **thread error** (`error` `code: 'pack-overflow'`, §17.11 copy), **not** a modal before Send. No `sendRequest`, no silent retry, do **NOT** drop the LSP slice and still call. Stop still works. Composer stays enabled.
- **AC4.** Successful pack: 60s hang rule still applies.

Minimum pack = prompt + board + (LSP slice on debate/@ **OR** implementer file(s) being written) + **tab paths** (paths only, not bodies). Current-turn MCP reads (WM-2) are extras: trim MCP payload size first.

## 1. Why

PromptBuilder restuffs persona + full active file + selection + other-tab paths + session transcript on every sendRequest. That is the quota burn. Visible debate is not the leak.

## 2. Components

Orchestrator state machine unchanged.
- ThreadStore → UI transcript
- RunBoard → chat/board chrome + Copilot pack
- TokenGovernor → pack/trim; **never** sendRequest
- PromptBuilder → persona + board + (LSP slice on debate/@ **or** full files in play on implement) + tab paths
- LspSlice → diagnostics + `vscode.executeDocumentSymbolProvider` + enclosing range around selection; debate/@ only; after Approve invalidate
- ChangesetStore → Approve only

## 3. Protocol (additive HostToUi) — matches §17.7 exactly

Do not change existing HostToUi members. No UiToHost for board edits. File chip with inChangeset true may reuse existing `review/open-diff { path }`.

```ts
type ChatBoardMessage = { type: 'chat/board'; board: RunBoardDto }

interface RunBoardDto {
  goal?: string
  todos: { id: string; text: string; status: 'pending' | 'current' | 'done' }[]
  decisions: string[]
  dissents: { handle: string; text: string }[]  // one line; already stripped; Split-only (QC-1 AC2)
  files: { path: string; inChangeset: boolean }[]
}
```

Authoritative **snapshot**. Host is the only writer. UI replaces; no patches.
Empty snapshot (`!goal && todos.length===0 && decisions.length===0 && dissents.length===0 && files.length===0`) → **hide** the board. Do not send placeholder regions.

Add ErrorCode `'pack-overflow'`.
Host → UI existing `error` with `code: 'pack-overflow'` and **exact** copy from §17.11 (thread system/error block, not a toast-only, not a board badge, **not a modal before Send**):

```
Prompt doesn't fit Copilot
The minimum context for this turn is larger than Copilot's window.
Shorten the prompt or shrink the active editor. Required context was not dropped.
```

No silent skip. Do not start propose/critique if the minimum pack (prompt + board + slice-or-implementer-file + tab paths) does not fit maxInputTokens. Do **not** drop the LSP slice and still call. Composer stays enabled. No pre-Send modal.

## 4. Swarm chrome (pointer)

Implement to `docs/ui-ux-run-board.md` §17 in full. Highlights the architecture must not contradict:
- Sticky above transcript, below view title, composer at bottom. Same component sidebar + Expand. Host ids remain botrider.chat / botrider.chatPanel (spec botRider.chat maps 1:1).
- Label `Run`. Todos ○ pending / ● current / ✓ done. Click todo = no-op. No Approve on the board. No checkboxes.
- Dissents: `@{handle} — {reason}` from **Split-card positions only** when Split opens. **Vote does NOT update Dissents** (superseded: not vote remainder). Empty region omitted. See QC-1 AC2.
- Files: names only. `inChangeset` chip may `review/open-diff`; else tooltip `Not proposed yet`.
- Collapse: `Goal · {done}/{total}` session-only. Reload hides board.
- Board is not parsed from bot markdown by the webview.
- Implementer may mark files inChangeset after changeset/preview. Implementer never MCP. Vote no MCP.

## 5. PromptBuilder / TokenGovernor

Each sendRequest:

**Debate / critique / consensus / @-direct (QC-2):**
1. persona / this prompt
2. RunBoard text (restated every turn; host-built)
3. LSP slice of **active** editor only: diagnostics + document symbols + enclosing range around selection — **replaces** the full buffer (**not both**)
4. open tab **paths** only
5. turn instruction
6. current-turn MCP reads only if WM already produced them (WM-2; WM-Q7: drop MCP first, then extra-tab *bodies* if any remain, never selection / never the slice)

**Implementer (QC-2):**
1. persona / this prompt
2. board
3. **full file(s) in play** (files being written)
4. open tab **paths** only
5. turn instruction

**No LSP slice on implementer.** Slice does not replace implementer file bodies.

Omit: history[] full speeches; extra-tab bodies; other-file dumps; 1-hop definition bodies.

Vote compact: tools none (already). Pack = board + instruction (no file body, no transcript). AGREE/DISSENT first token unchanged. Vote remainder is vote chrome / `chat/turn-end.vote` only — **not** `dissents[]`.

MCP loop cap: do not raise MAX_MCP_TOOL_ROUNDS (today 8). TokenGovernor does not add Copilot calls to summarize the board.

maxInputTokens: trim extras first (MCP payload size, vote compactness). **Never** restuff transcript. **Never** drop persona, goal, selection/enclosing-range slice, tab paths, or implementer file(s) to force a fit. If the **minimum** pack still does not fit → pack-overflow: Swarm **thread** error, do not start the turn, do **not** drop the LSP slice and still call.

Call-budget: count sendRequest × packed size this run. Internal. Never a Send gate.

Stable prefix: persona + goal first.

Host restates board after propose/critique (heuristics, no extra model). Goal from userText on Send. **`dissents[]` only when Split opens** (QC-1 AC2). filesInPlay paths from active editor + named paths; set inChangeset when changeset/preview matches. Todos sparse rather than invented. Chronological host order. Optional parseable todo block merge only (host parse, still no extra sendRequest).

If LSP is empty: symbols/diagnostics/enclosing-range may be empty; do **not** attach the full debate buffer. No ~80-line file fallback.

## 6. LSP slice

Debate and @-direct only. **Active file only.**

Contents:
- diagnostics
- document symbols (`vscode.executeDocumentSymbolProvider` on active editor URI)
- **enclosing range around selection**

**No 1-hop definition bodies.** Keep selection via the enclosing range, not a second full-buffer attach.

If LSP empty: do **not** attach the full debate buffer. Do **not** fall back to first N lines of the file.

After Approve (successful applyEdit): invalidate slice + file-hash. Reject: no invalidation (disk unchanged). No Graphify in-tree. No Python. No tree-sitter WASM required in v1.

## 7. Orchestrator

State machine unchanged. All frozen active bots still run. CRUD/Approve/Retry/Reject never start Copilot. Approve invalidates LSP slice and hides board (empty snapshot).

Split opens (interrupt **or** two-round no-agreement) → write `dissents[]` from Split-card positions. Continue / consensus / Approve / Reject / run end → clear `dissents[]`. Split again → rewrite.

## 8. Out of slice

Speaker cap, pre-Send call estimate/modal, Copilot-backed regulator / token cop, i-have-adhd skill in prompts, Graphify vendor / in-tree, per-bot long memory, fourth view / fourth sidebar, UiToHost board edits, Approve-from-the-board, token meter in chrome, changing vote semantics, vote writing `dissents[]`, 80-line (or any) full-buffer fallback on debate/@, dropping the LSP slice to force a Copilot call.

## 9. Done when (product, after PO allocates Devs)

- Debate UI streams full prose for every active bot.
- Copilot messages omit prior full speeches and extra-tab dumps; include board + slice on debate/@; full file(s) in play only on implement; no LSP slice on implementer.
- chat/board paints per §17; empty snapshot hides; reload hides; `dissents[]` Split-only.
- pack-overflow uses exact copy as a Swarm **thread** error; no pre-Send modal; no drop-slice-and-still-call.
- Approve still the only applyEdit.
- npm test + compile green. WM emit tests still pass.
