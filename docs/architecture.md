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

Additive typed bot attachments (revises IE): [architecture-bot-attachments.md](./architecture-bot-attachments.md). HostToUi / UiToHost attach ports pass `slot`. `BotAttachment.kind` equals the slot. Chrome: [ui-ux-bot-attachments.md](./ui-ux-bot-attachments.md) §20. BR / QC / HV / MA / SD frozen.

Additive per-bot Copilot model selection: [architecture-bot-model.md](./architecture-bot-model.md). HostToUi `bots/models`. Persist `LanguageModelChat.id` only as `BotRecord.modelId` (label never persisted). Empty = host default. Missing id = host default that turn + visible copy; do not block the turn. Copilot vendor only. Chrome: [ui-ux-bot-model.md](./ui-ux-bot-model.md) §22. BR / QC / HV / MA / SD / TA frozen.

Additive F7 isolation / SI-1–4: [architecture-bot-isolation.md](./architecture-bot-isolation.md). Host-only. Zero new chrome for isolation. SI-1/2/4 held. SI-3 reopened for Debate speakers in a batch — [architecture-event-bus.md](./architecture-event-bus.md). BR / QC / HV / MA / SD / TA / MS frozen otherwise.

Additive F7 parallel / Event Bus / EB-1–4: [architecture-event-bus.md](./architecture-event-bus.md). Host in-process only. Not vscode.EventBus. Not network. SI-3 reopened for Debate speakers in a batch. Same-batch speakers do not hear each other until the phase ends. Chrome: [ui-ux-parallel-stream.md](./ui-ux-parallel-stream.md) §26. Do not reopen §20–§25.

Additive F8a Work run / WK-1–6: [architecture-work-run.md](./architecture-work-run.md). New run type, not a protocol on F7 Debate. Default Send stays Debate. Chrome: [ui-ux-work-run.md](./ui-ux-work-run.md) §27. Do not reopen §20–§26.

Additive F6 bot export / import: [architecture-bot-export-import.md](./architecture-bot-export-import.md). Envelope `format: 'botrider.bots.v1'`. UiToHost `bots/export-self` only (form Export). Chrome: [ui-ux-bot-export-import.md](./ui-ux-bot-export-import.md) §23. BR / QC / HV / MA / SD / TA / MS / SI frozen. Leftovers 002/003/009/014 out. Parallel Event Bus out.

Additive F2 OpenSpec / OS-1–4: [architecture-openspec-trace.md](./architecture-openspec-trace.md). Optional `specIds` on `changeset/preview` Files. Chrome: [ui-ux-openspec-chips.md](./ui-ux-openspec-chips.md) §24. Missing `openspec/` = empty catalog, no error, no chips, no banner. BR / QC / HV / MA / SD / TA / MS / SI / EX frozen otherwise. F1 Graphify out. F7 parallel out.

Additive F1 Context Map / CM-1–4: [architecture-context-map.md](./architecture-context-map.md). Fourth view in the existing container (Bots → Chat → Context Map → Proposed Changes). Chrome: [ui-ux-context-map.md](./ui-ux-context-map.md) §25. Bot Rider–owned webview. Graphify-as-vendor stays out. BR / QC / HV / MA / SD / TA / MS / SI / EX / OS frozen otherwise. Do not reopen §20–§24. F7 parallel out.

### UI → host

`bots/create`, `bots/update`, `bots/toggle`, `bots/delete`, `chat/send`, `chat/stop`, `split/continue`, `split/pick`, `changeset/approve`, `changeset/retry`, `changeset/reject`, `mcp/actions-approve`, `mcp/actions-reject`, `review/open-diff`, `copilot/recheck`

## Apply table (`ChangesetStore.buildEdit`)

| op | `initial` | `retry` |
| --- | --- | --- |
| create | `createFile`, overwrite false | `createFile`, overwrite true (leftover creates replace) |
| update | replace full document | replace full document |
| delete | `deleteFile` | skip if already gone; otherwise `ignoreIfNotExists` |

`applyEdit` is called only from `ChangesetStore.approve()` (`botrider.changeset.approve` / retry with `buildEdit('retry')`).
