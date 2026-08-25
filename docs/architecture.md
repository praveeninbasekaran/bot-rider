# Bot Rider architecture (rev 7)

Canonical blueprint: [architecture-mvp.md](./architecture-mvp.md). UI/UX: [ui-ux-spec.md](./ui-ux-spec.md).

Host-owned UI and protocol for the MVP. The webview never calls `vscode.lm` or `workspace.applyEdit`.

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

`CopilotStatus` = `ready` \| `missing` \| `noPermissions` \| `notFound` \| `blocked` \| `quota` \| `hung` \| `streamFailed` \| `offTopic`

`ErrorCode` = `unknown-handle` \| `multiple-mentions` \| `zero-active` \| `no-workspace` \| `parse-failed` \| `validate-failed` \| `copilot`

Copilot auth/quota/hung stay on `copilot/status`. `error` with code `copilot` is the thread catch-all only.

### Host → UI

`bots/snapshot`, `copilot/status`, `run/state`, `chat/turn-start`, `chat/token`, `chat/turn-end`, `chat/split`, `chat/mcp-read-start`, `chat/mcp-read-end`, `chat/mcp-skip`, `changeset/preview`, `changeset/apply-failed`, `changeset/cleared`, `error`

Additive MCP HostToUi only (no UiToHost MCP). Read-only `vscode.lm` MCP tools on propose, critique, and @-direct. Vote and implementer send with `tools: 'none'`.

### UI → host

`bots/create`, `bots/update`, `bots/toggle`, `bots/delete`, `chat/send`, `chat/stop`, `split/continue`, `split/pick`, `changeset/approve`, `changeset/retry`, `changeset/reject`, `review/open-diff`, `copilot/recheck`

## Apply table (`ChangesetStore.buildEdit`)

| op | `initial` | `retry` |
| --- | --- | --- |
| create | `createFile`, overwrite false | `createFile`, overwrite true (leftover creates replace) |
| update | replace full document | replace full document |
| delete | `deleteFile` | skip if already gone; otherwise `ignoreIfNotExists` |

`applyEdit` is called only from `ChangesetStore.approve()` (`botrider.changeset.approve` / retry with `buildEdit('retry')`).
