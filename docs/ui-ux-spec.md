# Bot Rider UI/UX Specification

Locked MVP UI/UX. Contribution ids are `botrider.*`. Design notes that used `botRider.*` map 1:1 (lowercase) — `botRider.bots` → `botrider.bots`, `botRider.chat.stop` → `botrider.chat.stop`.

Architecture: [architecture-mvp.md](./architecture-mvp.md) (revision 7).

## Surfaces

| Surface | Id | Type | Notes |
| --- | --- | --- | --- |
| Activity bar | `botrider` | viewsContainer | Title **Bot Rider**, icon `media/activitybar.svg` |
| Bots | `botrider.bots` | tree | Checkboxes = active (`manageCheckboxStateManually`) |
| Swarm | `botrider.chat` | webview | Copilot-chat density |
| Proposed Changes | `botrider.review` | tree | Default **collapsed** |
| Bot form | `botrider.botForm` | webview panel | New / Edit Bot |
| Swarm Chat | `botrider.chatPanel` | webview panel | Title **Swarm Chat** (Expand) |
| Proposed docs | `botrider-proposed:` | URI | Content provider |

`retainContextWhenHidden` SHALL be true **only** on Swarm sidebar (`botrider.chat`) and Expand (`botrider.chatPanel`). Bot form SHALL NOT retain hidden context.

Avatars: color + initials SVG only. Never display name as the `@` identity — always `@{handle}`.

## Contribution points

### Commands (category **Bot Rider**)

New Bot, Edit Bot, Delete Bot, Toggle Active, Expand, Stop (`botrider.chat.stop` only — no `split.stop`), Approve, Reject, Open Diff, Continue, Pick a Bot to Decide, Sign in to GitHub Copilot (`botrider.copilot.recheck`), Retry (`botrider.changeset.retry`), Approve MCP actions (`botrider.mcp.approve`), Reject MCP actions (`botrider.mcp.reject`).

### Menus

**view/title**

- `bots.create` on `botrider.bots`
- `chat.expand` when `view == botrider.chat && !botrider.chatExpanded`
- `chat.stop` when `view == botrider.chat && botrider.debateRunning`
- `changeset.approve` and `reject` when `view == botrider.review && botrider.hasPendingChanges`
- `changeset.retry` when `view == botrider.review && botrider.applyFailed` — **not** on clean pending review

**view/item/context**

- `bots.edit` inline, `bots.delete`, `review.openDiff` on `proposedFile`

**commandPalette**

- Hide edit / delete / toggle / openDiff (`when: false`)
- Continue / Pick when `botrider.splitOpen`
- Stop when `botrider.debateRunning || botrider.splitOpen`

### Views welcome

**Bots** `!botRider.hasBots`:

> No bots yet. Create a bot with a name, persona, and role, then send a master prompt in Swarm.  
> [New Bot](command:botRider.bots.create)

**Review** `!botrider.hasPendingChanges`:

> No proposed edits. After the swarm agrees, proposed WorkspaceEdits appear here for review.  
> Approve applies the whole batch. Reject discards it.

### Context keys

`botrider.hasBots`, `hasActiveBots`, `hasPendingChanges`, `debateRunning`, `splitOpen`, `copilotReady`, `chatExpanded`, `applyFailed`.

## Copy deck

| Key | Copy |
| --- | --- |
| Composer placeholder | `Message the swarm. Use @handle to lock a bot.` |
| Split helper | `Resolve the split to send a new prompt.` |
| Unknown handle | `No bot named @{handle}.` |
| Multiple mentions | `Mention only one bot to lock a turn.` |
| Inactive solo | `{Name} is inactive · answering this turn only.` |
| Solo chip | `SOLO · @{handle}` |
| Split title (votes) | `No consensus` |
| Split title (paused) | `Debate paused` |
| Stopped | `Stopped without implementation.` |
| Pick | `{Name}'s position selected as the direction.` |
| Recheck command | `Sign in to GitHub Copilot` |
| Hung | `GitHub Copilot did not respond within 60 seconds. Stop is still available.` |
| Zero active | `Turn on at least one bot, or @mention a bot to lock the turn.` |
| No workspace | `Open a workspace folder to run the swarm.` |
| Apply failed | See block below |

Apply-failed (honest; never claim success):

> Apply did not complete. New files created before the failure may already exist on disk, and deleted files may already be gone. Bot Rider cannot roll those back. Retry to finish the rest, or Reject to drop remaining edits (leftover new files stay; already-deleted files stay deleted).

## Bots tree and form

- Tree: name as label, `@handle` as description, checkbox = `active`, color+initials icon.
- Title: **New Bot**. Inline: **Edit Bot**, **Delete Bot**. Toggle is the checkbox, not delete.
- Form fields: Name, Handle, Persona, Role, System instructions, Active. Handle auto-derives from Name until the user edits it.

## Swarm

Copilot-chat density: compact thread, round headers (`Round N`), thinking chip then speaking chip, composer at the bottom.

### @ picker

A picker **above** the composer lists bots. Choosing one inserts `@{handle}` plus a **trailing space**. Never insert the display name.

### Split UI

Composer **locked** while `splitOpen`. Send ignored. Only:

1. **Continue** (`botrider.split.continue` / `split/continue`)
2. **Pick a bot to decide** (`botrider.split.pick` / `split/pick`)
3. **Stop** — `botrider.chat.stop` / `chat/stop` (card Stop posts `chat/stop`; no `split.stop`)

### Expand

**Expand** opens `botrider.chatPanel` titled **Swarm Chat**.

### Webview engineering

- `--vscode-*` tokens only
- CSP `default-src 'none'`
- `acquireVsCodeApi()` once
- Stream `postMessage` 16–32ms
- Sanitize `innerHTML`
- UI never calls `vscode.lm` or `applyEdit`

## Proposed Changes

SCM-like groups: **Modified** / **Added** / **Deleted**. Open Diff on `proposedFile`.

Diff titles:

- `{basename} (Workspace ↔ Proposed)`
- `{basename} (Empty ↔ Proposed)`
- `{basename} (Workspace ↔ Deleted)`

Closing a diff is **not** Approve or Reject.

Retry appears **only** when `botrider.applyFailed`.

Staged MCP actions (Grain B) are a **second section** on this surface when an MCP batch is pending — not a combined file+MCP Approve. See §19 / [ui-ux-mcp-actions.md](./ui-ux-mcp-actions.md).

Canonical run-board chrome: [ui-ux-run-board.md](./ui-ux-run-board.md). Architecture: [architecture-token-save.md](./architecture-token-save.md).

Canonical article prose: [ui-ux-chat-prose.md](./ui-ux-chat-prose.md). Architecture: [architecture-human-voice.md](./architecture-human-voice.md).

**Superseded:** vote does NOT update Dissents. `dissents[]` is Split-only (architecture-token-save.md QC-1 AC2).

## 17. Run board (additive Swarm chrome)

**Status:** Additive after §16. Not a fourth view. Not a bot. The **host** restates this board; bots do not change speech style to fill it. User still reads full debate prose in the thread as today.

**Out:** call-count modal before Send · Graphify UI · token-cop bot chrome · user-editable todos · Approve-from-the-board · MCP rows on the board (those stay in the bot article).

### 17.1 Placement
Lives **inside** `botRider.chat` (sidebar webview) and the Expand `botRider.chatPanel`. Same component, same data.
Sticky **above** the transcript, below the view title, above the first `You` block. Composer stays at the bottom. Split card stays in the thread, not on the board.
Default **expanded** while `debateRunning` or `pendingReview` or `splitOpen`. User may collapse to a single 22 px bar: `Goal · {done}/{total} todos`. Session-only collapse. Do not persist across reload.
Sidebar ~320 px: one column, 8 px pad, 4 px gaps, 12 px type. Expand: same anatomy. Do **not** move the board into a left rail.

### 17.2 Anatomy
No avatar. No bot color. Label **Run** in 11 px uppercase `--vscode-descriptionForeground`.
Regions: Goal (one line), Todos (host-owned steps), Decisions (one-liners), Dissents (`@{handle} — {reason}` from Split-card positions only when Split opens; not vote remainder), Files in play (paths only).
Omit empty regions. If only Goal, show Goal alone or hide whole board (§17.4).
Max todos 7 then `+{n} more`. Dissents max 4 + more. Files max 6 chips then `+{n}`.

### 17.3 Todos tick
pending ○ descriptionForeground; current ● progressBar-background; done $(check) testing-iconPassed.
Clicking a todo is a no-op. Not checkboxes. No Approve/Reject on the board. Chronological host order. Do not sort done-to-bottom.

### 17.4 Empty
Idle no thread: Hidden. Solo @ with no host todos: Hidden unless Goal or Files. Host todos [] and everything empty: hide. After Reject/Approve clears run: hide. Reload: hidden. Board does not mention MCP.

### 17.5 Files vs Proposed Changes
inChangeset → review/open-diff tooltip `Open diff`. Else no-op tooltip `Not proposed yet`. Never write from the board.

### 17.6 Sidebar vs Expand
Same DOM. No Graphify canvas. No call-count or token meter.

### 17.7 Host ↔ UI
chat/board + RunBoardDto as in architecture. UI → Host: none for board edits. inChangeset file chip may reuse review/open-diff.

### 17.8 Accessibility
region aria-label="Run". Collapse: `Run, {done} of {total} todos, expanded|collapsed`. Todo items role=listitem not checkbox. Glyph aria-hidden. Status in text. Live-update Goal only if it changes, polite. Dissents include @handle.

### 17.9 Happy path
Send → optional Goal. After propose/critique restatements, chat/board ticks todos. Split opens → Dissents from Split-card positions (vote does NOT update Dissents). Implementer → inChangeset. Approve/Reject stay Surface C.

### 17.10 Copy exact
Region `Run`. Collapsed `{goalEllipsis} · {done}/{total}` (omit count if total=0). Dissent `@{handle} — {reason}`. File tooltips `Not proposed yet` / `Open diff`. `+{n} more`.

### 17.11 Pack overflow
Exact copy:
Prompt doesn't fit Copilot
The minimum context for this turn is larger than Copilot's window.
Shorten the prompt or shrink the active editor. Required context was not dropped.
error code pack-overflow. Thread error block. No pre-Send modal. No silent skip.

## 18. Swarm article prose (additive chrome)

**Status:** Additive after §17. Human-voice chrome for visible Swarm articles. Host sends already-stripped text. UI must not restyle that article into headings/spec chrome.

Canonical addendum: [ui-ux-chat-prose.md](./ui-ux-chat-prose.md). Architecture: [architecture-human-voice.md](./architecture-human-voice.md). Host is the source of truth for stripped article text. UI renders that article; it does not re-strip as source of truth.

**Out:** word-cap · length counter · mid-turn truncate · voice toggle · plain-vs-markdown toggle · UI re-strip as source of truth · README / document layout for speaking turns.

### 18.1 Surfaces
Visible Swarm articles: propose, critique, `@`-direct, Split positions. Same component in sidebar (`botRider.chat`) and Expand (`botRider.chatPanel`).
Render as **chat paragraphs**, not a README or document layout.

### 18.2 Host-stripped source of truth
Host sends already-stripped `chat/turn-end.text` and Split `positions[].text`.
UI paints that article. It does **not** re-strip as source of truth. It must **not** restyle leftover `##` / spec chrome back into headings.
Round headers, Split card chrome, and the Run board stay host-owned chrome, not article body.

### 18.3 Keep
Fenced code (triple-backtick) byte-for-byte, including list-looking lines inside the fence. Inline code spans stay.
`inChangeset` chips / Proposed Changes stay Surface C.

### 18.4 Do not
No word-cap. No length counter. No mid-turn UI truncate. No voice toggle. No plain-vs-markdown toggle. UI does not badge leftover protocol tokens.

### 18.5 Streaming
`chat/token` may briefly include protocol tokens or `##`. `chat/turn-end.text` is the stripped article and is what the bubble keeps. No mid-turn UI truncate.

### 18.6 Consume leftover hashes
Default: host already stripped heading lead-in. Consume leftover `##` as a README **only** if a later SHA still treats leftover hashes as document chrome. Do not invent heading scale.

## 19. Staged MCP actions (additive chrome, Grain B)

**Status:** Additive after §17 / §18. Grain B: two independent Approve gates. Not a host rewrite of BR-6. Not one Approve for files+MCP.

Canonical addendum: [ui-ux-mcp-actions.md](./ui-ux-mcp-actions.md). Architecture: [architecture-mcp-actions.md](./architecture-mcp-actions.md). Two independent Approve gates. File Approve is BR-6 only. MCP Approve is the MCP gate only.

**Out:** combined Approve · per-action Accept · Approve on the Swarm card · pending MCP list in the thread · Run-board MCP region · fourth sidebar · token chrome · pre-Send gate · grain A (one Approve for files+MCP) · Bot Rider OAuth.

### 19.1 Two independent gates
Files: `changeset/approve` | `changeset/reject` (`botrider.changeset.approve` / `.reject`) — `applyEdit` only.
MCP: `mcp/actions-approve` | `mcp/actions-reject` (`botrider.mcp.approve` / `.reject`) — invoke staged tools only.
Two pairs when both a file changeset and an MCP batch are pending. User picks order. File fail does **not** block MCP Approve. MCP fail does **not** roll back files or set `applyFailed`. **One click must not apply both** (must not send both messages).

MCP Approve is allowed while Split is open; new staging is not.

### 19.2 Proposed Changes — second section
When an MCP batch is pending, Proposed Changes (`botrider.review`) shows a **second section** for staged MCP actions: `server`, `tool`, `argsLine`, `handle`.
File groups (**Modified** / **Added** / **Deleted**) stay as today.
MCP Approve / Reject are the MCP commands, not the changeset commands.

### 19.3 Swarm Review card only
Consumes `mcp/actions-preview` only. Label **`MCP actions · {n}`** plus **Review**.
**No Approve on the card.** Pending list is **not** in the thread.

### 19.4 Failed MCP Approve
Keep the batch (`leftoverIds` including the failed id). Never claim success. No silent retry. Retry must not be blocked solely because the remote object now exists or changed.

Exact copy:

```
MCP actions failed
Some remote side effects (Figma, Azure Boards, or other servers) may already have happened and may not roll back.
```

Figma / Azure Boards are **examples in copy**, not hardcoded vendors.

### 19.5 Protocol types
`McpActionDto`: `id`, `server`, `tool`, `argsLine`, `botId`, `handle`.

HostToUi: `mcp/actions-preview { actions }`, `mcp/actions-cleared`, `mcp/actions-failed { message, leftoverIds }`.
UiToHost: `mcp/actions-approve`, `mcp/actions-reject`.

Do not invent extra protocol members. Do not use a combined Approve.

### 19.6 Skip / mutating-blocked
§16 `mutating-blocked` copy (`Writes through {server} aren't available in Bot Rider.`) **only when the host cannot stage**.
Staged mutations do not use that copy. Missing MCP: visible skip. Unauth: visible error, no silent retry.

### 19.7 Session-only
Pending MCP batch is session-only (reload clears, like changeset/board). File pending store unchanged. Reject / reload emit `mcp/actions-cleared`; files untouched.

## 20. Bot form attachments (typed slots, locked)

**Status:** Replaces the single untyped Attach on Import Existing (IE). Not a new §22. Not a fourth view. Create / Edit bot form only.

Canonical addendum: [ui-ux-bot-attachments.md](./ui-ux-bot-attachments.md). Architecture: [architecture-bot-attachments.md](./architecture-bot-attachments.md).

**IE-1–4 + TA-1–4 locked.** Six labeled slots on New Bot / Edit Bot, after System instructions, before Active. Kind **is** the slot. Ports pass `slot`. Agent is optional **0 or 1** (not required). Skills / Scripts / Instructions / Prompts / Hooks are **0..n**. All six may be empty. Empty Agent save is valid. No single **Attach...** for the whole form.

| Slot | Cardinality |
| --- | --- |
| **Agent** | Optional, 0 or 1 (not required) |
| **Skills** | 0..n |
| **Scripts** | 0..n |
| **Instructions** | 0..n |
| **Prompts** | 0..n |
| **Hooks** | 0..n |

**Out:** single undifferentiated Attach · fourth view · remote/catalog/GitHub import · bulk swarm wizard · hooks execute/run / hooks-runner · global skill install copy · token/install MCP chrome · skip banner for TokenGovernor trims · overwriting filled name/handle/persona · treating path as a live file · inferring kind from filename · requiring an Agent file · a second runtime · any model other than `vscode.lm`.

## 22. Per-bot model picker (F5)

**Status:** Additive. **MS-1–3 locked.** New Bot / Edit Bot only. Not a Swarm control. Not a fourth sidebar. Do **not** reopen §20 Attach.

Canonical addendum: [ui-ux-bot-model.md](./ui-ux-bot-model.md). Architecture: [architecture-bot-model.md](./architecture-bot-model.md). HostToUi `bots/models`. Persist `LanguageModelChat.id` only as `BotRecord.modelId` (label never persisted). Empty = host default. Missing id = host default that turn + visible copy; do not block the turn. Copilot vendor only via `vscode.lm`.

**Out:** Swarm per-message model picker · non-Copilot vendors · persisting display label as key · blocking a turn when saved id missing · token/quota chrome · fourth sidebar · F7 parallel · leftovers 002/003/009/014 · tree model subtitle · fake model list · reopening §20 Attach slots.

## 23. Bot export / import (F6)

**Status:** Additive. **EX-1–4 locked.** Bots tree + form footer + palette. Not a Swarm control. Not a fourth sidebar. Do **not** reopen §20 Attach or §22 model picker. F7 parallel / Event Bus out.

Canonical addendum: [ui-ux-bot-export-import.md](./ui-ux-bot-export-import.md). Architecture: [architecture-bot-export-import.md](./architecture-bot-export-import.md). JSON and YAML. Envelope `format: 'botrider.bots.v1'`. Never overwrite. Never auto-suffix. Cancel rename = Skip. Copy `Skipped @{handle} · already taken.` Name-only: `Skipped "{name}" · a bot with that name already exists.` Prefer the handle line when both collide. No Copilot on export/import.

### Commands (package.json stubs; match addendum §23.2)

CamelCase command / view ids (locked chrome): `botRider.bots.export` / `exportSelected` / `exportAll` / `import`. Tree `botRider.bots`. Context `botRider.hasBots`.

| Command | Title | Icon |
| --- | --- | --- |
| `botRider.bots.export` | Export Bot | — |
| `botRider.bots.exportSelected` | Export Selected | — |
| `botRider.bots.exportAll` | Export All | — |
| `botRider.bots.import` | Import | `$(desktop-download)` |

Tree `canSelectMany: true` (selection ≠ active checkbox). Form footer **Export**. Empty welcome adds `[Import](command:botRider.bots.import)`. Dirty form: `Save before export?` Save / Export without saving / Cancel.

**Out:** overwrite · silent auto-suffix · SI session / transcript / MCP pending in the file · execute scripts/hooks · Marketplace / hosted sync · API keys · Copilot on export/import · F7 parallel · fourth sidebar · Swarm chrome · reopening §20 / §22 · leftovers 002/003/009/014.

## 24. OpenSpec chips on Proposed Changes Files (F2)

**Status:** Additive. **OS-1–4 locked.** Proposed Changes **Files** rows only. Chip text = catalog id as stored (`BR-6`, `EX-1`). Display only, **not click-to-filter**. Unknown ids never chips. MCP Grain B rows **never** chips. Empty/missing `openspec/` = no chips, **no banner**. Not a fourth sidebar. Not Swarm. Do **not** reopen §20 / §22 / §23. Approve/Reject still whole-changeset BR-6.

Canonical addendum: [ui-ux-openspec-chips.md](./ui-ux-openspec-chips.md). Architecture: [architecture-openspec-trace.md](./architecture-openspec-trace.md). Host reads workspace `openspec/` if present (index-if-present). Cites on implementer changeset only. UI never reads `openspec/` from disk.

**Out:** click-to-filter · MCP chips · Swarm chips · empty-catalog banner · Cite command · fourth sidebar · F1 Graphify · F3 dashboard · F4 register · F7 parallel · leftovers 002/003/009/014 · reopening §20 / §22 / §23.

## 25. Context Map (F1, Bot Rider–owned)

**Status:** Additive. **CM-1–4 locked.** Fourth view in the **existing** Bot Rider container. Order: **Bots → Chat → Context Map → Proposed Changes**. View `botRider.contextMap`. Title **Context Map**. Type: Webview. **Not** a second Activity Bar icon. **Not** Graphify vendor UI. Do **not** reopen §20 / §22 / §23 / §24. OpenSpec chips stay on Proposed Changes Files rows (§24). The map is **not** a spec browser.

Canonical addendum: [ui-ux-context-map.md](./ui-ux-context-map.md). Architecture: [architecture-context-map.md](./architecture-context-map.md). Two layers (Workspace / This run), toggle, not merged in MVP. Click inspects label/path/kind. Never auto-Approve. Never Copilot Send. Never execute. Never dump full-file into Swarm.

**Out:** second Activity Bar icon · Graphify vendor UI · merged one-graph MVP · whole-workspace crawl on open · auto-Approve · Copilot Send from the map · execute · dump full-file into Swarm · spec browser · F3 dashboard · F4 register · F7 parallel · leftovers 002/003/009/014 · reopening §20 / §22 / §23 / §24.

## 26. Parallel Debate stream (F7)

**Status:** Additive. **EB-1–4 locked.** Swarm chrome only. HV articles MAY overlap during a parallel Debate batch. Display only, not the talk channel. No Event Bus chrome. No packet rows. No new sidebar. No new Activity Bar icon. Do **not** reopen §20–§25. OpenSpec chips stay on Proposed Changes Files. Context Map unchanged.

Canonical addendum: [ui-ux-parallel-stream.md](./ui-ux-parallel-stream.md). Architecture: [architecture-event-bus.md](./architecture-event-bus.md). `ROUND {n} · PROPOSE` then `ROUND {n} · CRITIQUE` after propose settled. No “parallel” header. `@` / vote / Split / implementer: no overlap chrome. Run board MAY show multiple in-flight speakers (one static ●/chip per handle). Composer locked until the batch settles. Stop = `botrider.chat.stop`, aborts all in-flight.

**Out:** Event Bus chrome · packet rows · new sidebar · new Activity Bar icon · “parallel” header · overlap chrome on `@` / vote / Split / implementer · Approve/MCP/packets/OpenSpec on the run board · F3 dashboard · F4 register · leftovers 002/003/009/014 · reopening §20–§25.

## 27. Work run (F8a)

**Status:** Additive. **WK-1–6 locked.** Swarm + New/Edit Bot chrome only. New run type **Work**, not a protocol on F7 Debate. **Work | Debate** segmented control on the composer (and Expand); default **Debate**; Send follows it. Not a fourth view. Not Event Bus chrome. Not a per-Send picker. Do **not** rewrite §20–§26. F7 Debate composer-lock stays in §26.

Canonical addendum: [ui-ux-work-run.md](./ui-ux-work-run.md). Architecture: [architecture-work-run.md](./architecture-work-run.md). Form: optional Dispatcher / Spec after Active; Save is not the gate. Work Send is the gate — `Work needs one Dispatcher and one Spec.` Not name-contains `BA`. No reserved Dev1 / Dev2 / tester chrome. Work-batch composer unlocked for `@` / assign / Stop (`Work batch still running.`). BR-6 Files only after settle; MCP Grain B separate click. One Files list; `Skipped {path} · collision`. Approve disabled until settle. Stop = `botrider.chat.stop`, aborts all in this Work-batch.

**Out:** F8d Stop-one / compare-to-spec · N Approves · combined Files+MCP Approve · reserved Dev1/Dev2/tester chrome · per-Send picker · Save-time designation gate · new sidebar · new Activity Bar icon · Event Bus chrome · reopening §20–§26. **F8b Argue chrome** is the §28 addendum. **F8c idle follow-on chrome** is this addendum (§29), not out of the product forever.

## 28. Sequential Argue (F8b)

**Status:** Additive. **AG-1–4 locked.** Swarm chrome only after Work-batch collision. Header `ARGUE · {path}`. Argue chrome is **§28**, never §27.9. Not a fourth view. Not Event Bus chrome. Not a Pick card. Do **not** rewrite §20–§27 except the §27 collision / Out pointer. F8a Work | Debate, designation, Work-batch unlocked composer, and one Files list stay as shipped.

Canonical addendum: [ui-ux-work-run.md](./ui-ux-work-run.md) §28. Architecture: [architecture-work-run.md](./architecture-work-run.md) F8b / AG-1–4. After Work-batch settle, collided paths Argue **one at a time**. Header exactly `ARGUE · {path}`. Workspace-relative path sort. Sequential ping-pong. **Not overlapping HV** (one article at a time; contrast §27.9 — do not reuse §27.9). **Round headers stay** (Argue round 1 / 2 for this path). Not F7 `ROUND n · CRITIQUE`. Not F7 Split card. Two rounds. First speaker = claimants sorted by handle. Stop = existing `chat/stop`, aborts Argue, **no Split card**, no enterSplit. No winner / Stop: `Skipped {path} · collision`. Remainder still in Proposed Changes (visible, not discarded) while Argue runs and after drop. Approve **disabled** until every collision is winner or dropped, then **one** Files union (remainder + winners). Not N Approves. MCP Grain B unchanged / separate click. **No Pick chrome.** No reserved Dev/tester roles. Composer: Stop works; **@ stays sole respondent** (existing @ chrome, not a second Work run). Work | Debate unchanged. Host winner unchanged: SI-2 AGREE one writer handle. Two rounds then drop. No Pick. No host auto-pick. No reserved-role tie-break.

**Out:** F8d Stop-one / compare-to-spec · N Approves · Pick chrome · host auto-pick · reserved-role tie-break · enterSplit · Split card · last-writer-wins without Argue · overlapping HV during Argue · reusing §27.9 · Argue as a third Send mode · new sidebar · new Activity Bar icon · Event Bus chrome · packet rows · reopening §20–§26 / F8a WK-1–6 except the collision pointer. **F8c idle follow-on chrome** is this addendum (§29), not out of the product forever.

## 29. Idle follow-on (F8c)

**Status:** Additive. **FO-1–4 locked.** Swarm chrome only after first Work-batch + Argue settle. Follow-on Work-batch **after Argue**. No third Send mode. Work | Debate and `ARGUE · {path}` unchanged. Reuse §27 run-board in-flight+waiting. Not a fourth view. Not Event Bus chrome. Not a new Activity Bar. Do **not** rewrite §20–§28 except the §27/§28 Out pointer. F8a Work | Debate, designation, Work-batch unlocked composer, F8b Argue header, and one Files list stay as shipped.

Canonical addendum: [ui-ux-work-run.md](./ui-ux-work-run.md) §29. Architecture: [architecture-work-run.md](./architecture-work-run.md) F8c / FO-1–4. Follow-on only after first Work-batch + Argue settle. Not during BA, first batch, or Argue. Cap one per Send. **No idle bots:** silent, Approve first union. No banner. **Invalid split:** exact `Follow-on work skipped.` then first union Approves. **Follow-on collisions:** `Skipped {path} · collision`. No second Argue. No ARGUE header for follow-on. Approve **disabled** until follow-on settles or skipped. One union. Not N Approves. MCP unchanged / separate click. Spec/Dispatcher never follow-on workers. Workers = idle-bot handles from the follow-on dispatch split (not reserved roles). Composer `@` / assign / Stop as WK-6. Stop aborts this follow-on batch. Reuse §27 run-board in-flight+waiting chips. Master Send reuses `Work batch still running.` No Follow-on Send mode. No new Activity Bar.

**Out:** F8d Stop-one / compare-to-spec · N Approves · looping follow-on · follow-on during BA/first batch/Argue · ARGUE header for follow-on · Follow-on Send mode · spec/dispatcher as follow-on workers · banner on zero-idle skip · new sidebar · new Activity Bar icon · Event Bus chrome · packet rows · Pick · Split · reopening §20–§28 / F8a WK-1–6 / F8b AG-1–4 except the settle / Out pointer.
