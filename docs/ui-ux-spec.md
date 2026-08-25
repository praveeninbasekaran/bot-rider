# Bot Rider MVP UI/UX spec

Surfaces, copy, and webview rules for the MVP. Behavior requirements: [openspec/changes/bot-rider-mvp/spec.md](../openspec/changes/bot-rider-mvp/spec.md). Host ids: [architecture.md](./architecture.md).

## Chrome

- Activity bar: **Bot Rider** (`botrider`), icon `media/activitybar.svg` (monochrome mask).
- Views (top to bottom): **Bots** (`botrider.bots`), **Swarm** (`botrider.chat`, webview), **Proposed Changes** (`botrider.review`, default collapsed).
- Command category: **Bot Rider**.
- Avatars: color + initials SVG only (tree and Swarm). No photo assets.

## Bots

**Welcome** (`!botrider.hasBots`):

> No bots yet. Create a bot with a name, persona, and role, then send a master prompt in Swarm.  
> [New Bot](command:botrider.bots.create)

- Tree checkboxes manage active (`manageCheckboxStateManually`). Toggle is not Delete.
- View title: **New Bot** (`botrider.bots.create`).
- Item inline: **Edit Bot**, **Delete Bot**.
- Command palette hides edit / delete / toggle (`when: false`).
- Form panel `botrider.botForm`: Name, Handle, Persona, Role, System instructions, Active. Handle auto-derives from Name until edited. Picker and thread always show `@handle`, never the display name as the identity.

## Swarm

Copilot-chat density: compact thread, round headers, thinking then speaking chips, composer on the bottom.

- Placeholder: `Message the swarm. Use @handle to lock a bot.`
- @ picker **above** the composer inserts `@{handle}` plus a trailing space.
- Solo lock header: `SOLO · @{handle}`.
- Inactive lock notice: `{Name} is inactive · answering this turn only.`
- Unknown: `No bot named @{handle}.`
- Multiple: `Mention only one bot to lock a turn.`
- Expand: `botrider.chat.expand` on the Swarm title when `!botrider.chatExpanded`. Panel id `botrider.chatPanel`, title **Swarm Chat**.
- Stop in the Swarm title when `botrider.debateRunning`. Palette Stop when `botrider.debateRunning || botrider.splitOpen`. Card Stop posts `chat/stop`. There is no `split.stop` command.
- `retainContextWhenHidden`: true **only** on Swarm sidebar + expand panel.

### Split card

Composer locked. Helper: `Resolve the split to send a new prompt.`

| State | Title | Body / actions |
| --- | --- | --- |
| Votes failed | `No consensus` | Continue / Pick a bot to decide / Stop |
| Stop during stream | `Debate paused` | `Stopped without implementation.` + same actions |
| Pick | — | `{Name}'s position selected as the direction.` then implementer |

Send is ignored while `splitOpen`.

### Webview engineering

- `--vscode-*` tokens only.
- CSP `default-src 'none'` (plus nonce script, `cspSource` styles/images as needed).
- `acquireVsCodeApi()` once.
- Stream `postMessage` batched 16–32ms.
- Sanitize anything assigned via `innerHTML`; prefer text nodes for tokens.
- UI never calls `vscode.lm` or `applyEdit`.

## Proposed Changes

**Welcome** (`!botrider.hasPendingChanges`):

> No proposed edits. After the swarm agrees, proposed WorkspaceEdits appear here for review.  
> Approve applies the whole batch. Reject discards it.

- SCM-like groups: Modified / Added / Deleted.
- Title: **Approve** and **Reject** when `hasPendingChanges`.
- **Retry** (`botrider.changeset.retry`) when `applyFailed` only — not on clean pending review.
- Open Diff on `proposedFile`. Palette hides Open Diff.
- Diff titles: `{basename} (Workspace ↔ Proposed)` / `(Empty ↔ Proposed)` / `(Workspace ↔ Deleted)`.
- Closing a diff is not Approve or Reject.

### Apply-failed copy

> Apply did not complete. New files created before the failure may already exist on disk, and deleted files may already be gone. Bot Rider cannot roll those back. Retry to finish the rest, or Reject to drop remaining edits (leftover new files stay; already-deleted files stay deleted).

Reject does not auto-delete leftover creates or restore deletes.

## Recheck

Command `botrider.copilot.recheck`, title **Sign in to GitHub Copilot**. Swarm banner uses the same action when Copilot is missing or lacks permission after settle.
