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
