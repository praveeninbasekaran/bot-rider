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

New Bot, Edit Bot, Delete Bot, Toggle Active, Expand, Stop (`botrider.chat.stop` only — no `split.stop`), Approve, Reject, Open Diff, Continue, Pick a Bot to Decide, Sign in to GitHub Copilot (`botrider.copilot.recheck`), Retry (`botrider.changeset.retry`).

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

**Bots** `!botrider.hasBots`:

> No bots yet. Create a bot with a name, persona, and role, then send a master prompt in Swarm.  
> [New Bot](command:botrider.bots.create)

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

Canonical run-board chrome: [ui-ux-run-board.md](./ui-ux-run-board.md). Architecture: [architecture-token-save.md](./architecture-token-save.md).

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
