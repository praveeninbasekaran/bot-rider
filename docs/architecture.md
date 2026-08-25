# Bot Rider architecture (rev 8)

Host-owned UI and protocol for the MVP. The webview never calls `vscode.lm` or `workspace.applyEdit`. Host core emits §5; the UI speaks §5. A thin `text`→`delta` map may exist in the chat adapter only and is not the contract.

## Host ids

| Kind | Id | Role |
| --- | --- | --- |
| Activity bar | `botrider` | Container |
| Tree view | `botrider.bots` | Bots (checkboxes = active) |
| Webview view | `botrider.chat` | Swarm |
| Tree view | `botrider.review` | Proposed Changes (collapsed) |
| URI scheme | `botrider-proposed` | Proposed file contents |
| Webview panel | `botrider.botForm` | New/Edit bot |
| Webview panel | `botrider.chatPanel` | Swarm Chat (expand) |

Commands live in category **Bot Rider**. Split Stop is `botrider.chat.stop` only (no `split.stop`). Retry is `botrider.changeset.retry`. Recheck is `botrider.copilot.recheck`.

Context keys: `botrider.hasBots`, `hasActiveBots`, `hasPendingChanges`, `debateRunning`, `splitOpen`, `copilotReady`, `chatExpanded`, `applyFailed`.

## Protocol

`TurnKind` = `propose` \| `critique` \| `consensus` \| `direct` \| `implement`

`SplitCause` = `cap` \| `continue` \| `interrupt`

`CopilotStatus` = `ready` \| `missing` \| `noPermissions` \| `notFound` \| `blocked` \| `quota` \| `hung` \| `streamFailed` \| `offTopic`

`ErrorCode` = `unknown-handle` \| `multiple-mentions` \| `zero-active` \| `no-workspace` \| `parse-failed` \| `validate-failed` \| `copilot`

Copilot auth/quota/hung stay on `copilot/status`. `error` with code `copilot` is the thread catch-all only.

### Host → UI

- `bots/snapshot` `{ bots }`
- `copilot/status` `{ status }`
- `run/state` `{ state: RunStateDto }`
- `chat/turn-start` `{ botId, handle, turn }` only. Name/colorIndex from snapshot. round from `run/state`. solo = `turn === 'direct'`
- `chat/token` `{ botId, delta }`
- `chat/turn-end` `{ botId, turn }` — vote/trailer are parser-internal, not on the wire
- `chat/split` `{ cause: SplitCause, positions: { botId, handle, text }[] }` — positions required
- `changeset/preview` `{ files: { path, op }[] }`
- `changeset/apply-failed` `{ message, leftoverCreates, leftoverDeletes }`
- `changeset/cleared` `{ reason: 'approve' \| 'reject', fileCount }`
- `error` `{ code, message }`

Implementer is not a visible chat turn (no `turn-start` / `token` / `turn-end`). The user sees `changeset/preview`.

### UI → host

- `bots/create` `{ draft }` (host may accept flattened as a shim; UI speaks `draft`)
- `bots/update` `{ id, name, handle, persona, role, instructions, active }`
- `bots/toggle` `{ id, active }`
- `bots/delete` `{ id }`
- `chat/send` `{ text }` — ignored while `splitOpen`
- `chat/stop`
- `split/continue`
- `split/pick` `{ botId }` — `botId` required. If missing, `error` `unknown-handle`; do not call Copilot
- `changeset/approve`, `changeset/retry`, `changeset/reject`
- `review/open-diff` `{ path }`
- `copilot/recheck`

## Apply table (`ChangesetStore.buildEdit`)

| op | `initial` | `retry` |
| --- | --- | --- |
| create | `createFile`, overwrite false | `createFile`, overwrite true (leftover creates replace) |
| update | replace full document | replace full document |
| delete | `deleteFile` | skip if already gone; otherwise `ignoreIfNotExists` |

`applyEdit` is called only from `ChangesetStore.approve()` (`botrider.changeset.approve` / retry with `buildEdit('retry')`).
