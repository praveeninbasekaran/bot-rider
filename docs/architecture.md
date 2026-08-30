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

`bots/snapshot`, `copilot/status`, `run/state`, `chat/turn-start`, `chat/token`, `chat/turn-end`, `chat/split`, `chat/mcp-read-start`, `chat/mcp-read-end`, `chat/mcp-skip`, `chat/board`, `changeset/preview`, `changeset/apply-failed`, `changeset/cleared`, `mcp/actions-preview`, `mcp/actions-cleared`, `mcp/actions-failed`, `error`

Additive MCP HostToUi: read-only `vscode.lm` MCP tools on propose, critique, and @-direct. Vote and implementer send with `tools: 'none'`. WM-1–3 unchanged. WM-4 never-invoke-write is superseded by [architecture-mcp-actions.md](./architecture-mcp-actions.md) staging + MCP-gate Approve; reads unchanged.

Additive token-save: [architecture-token-save.md](./architecture-token-save.md). HostToUi `chat/board` only (no UiToHost for board edits). Chrome: [ui-ux-run-board.md](./ui-ux-run-board.md) §17. BR-1–BR-6 protocol frozen.

Additive human voice: [architecture-human-voice.md](./architecture-human-voice.md). No new HostToUi / UiToHost. Chrome: [ui-ux-chat-prose.md](./ui-ux-chat-prose.md) §18. Not a pack/TokenGovernor change. WM unchanged. BR-1–BR-6 protocol frozen.

Additive staged MCP actions (Grain B): [architecture-mcp-actions.md](./architecture-mcp-actions.md). HostToUi `mcp/actions-preview` / `mcp/actions-cleared` / `mcp/actions-failed`. UiToHost `mcp/actions-approve` / `mcp/actions-reject`. Two independent Approve gates. Chrome: [ui-ux-mcp-actions.md](./ui-ux-mcp-actions.md) §19. No pack/TokenGovernor change. No HV change. BR-1–BR-6 protocol frozen.

### UI → host

`bots/create`, `bots/update`, `bots/toggle`, `bots/delete`, `chat/send`, `chat/stop`, `split/continue`, `split/pick`, `changeset/approve`, `changeset/retry`, `changeset/reject`, `mcp/actions-approve`, `mcp/actions-reject`, `review/open-diff`, `copilot/recheck`

## Apply table (`ChangesetStore.buildEdit`)

| op | `initial` | `retry` |
| --- | --- | --- |
| create | `createFile`, overwrite false | `createFile`, overwrite true (leftover creates replace) |
| update | replace full document | replace full document |
| delete | `deleteFile` | skip if already gone; otherwise `ignoreIfNotExists` |

`applyEdit` is called only from `ChangesetStore.approve()` (`botrider.changeset.approve` / retry with `buildEdit('retry')`).
