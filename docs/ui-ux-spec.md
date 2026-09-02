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
