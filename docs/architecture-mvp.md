# Bot Rider architecture blueprint (revision 7)

Locked MVP architecture. Host-owned UI and protocol. The webview never calls `vscode.lm` or `workspace.applyEdit`.

Companion: [UI/UX Specification](./ui-ux-spec.md). OpenSpec index: [openspec/specs.md](../openspec/specs.md).

**Id mapping:** design notes that used `botRider.*` map 1:1 to contribution ids `botrider.*` (lowercase). Example: `botRider.bots` → `botrider.bots`, `botRider.chat.stop` → `botrider.chat.stop`.

## Product

VS Code extension: `publisher: botrider`, `name: bot-rider`, `displayName: Bot Rider`, `engines.vscode: ^1.99.0`, `activationEvents: []`.

Empty swarm on first install. No seed bots. No count cap. No API keys. No `extensionDependencies` on Copilot. No Chat Participant. No SCM `SourceControl`. No `authentication.getSession` as Copilot consent. Settings Sync off (never `setKeysForSync`).

## Requirements map (BR-1 … BR-6)

| Id | Capability | Spec |
| --- | --- | --- |
| BR-1 | Copilot-only `vscode.lm` gateway | [br-1-copilot-gateway](../openspec/specs/br-1-copilot-gateway/spec.md) |
| BR-2 | Bot create / edit (handle, persona, role, instructions) | [br-2-bot-create-edit](../openspec/specs/br-2-bot-create-edit/spec.md) |
| BR-3 | Toggle, delete, persist (`globalState`, Sync off) | [br-3-bot-toggle-delete-persist](../openspec/specs/br-3-bot-toggle-delete-persist/spec.md) |
| BR-4 | Debate & Decide (two-round cap, freeze, AGREE/DISSENT) | [br-4-debate-and-decide](../openspec/specs/br-4-debate-and-decide/spec.md) |
| BR-5 | Mentions, split UI, language-only debate/@, implementer | [br-5-mention-split-implementer](../openspec/specs/br-5-mention-split-implementer/spec.md) |
| BR-6 | Gated whole-changeset `WorkspaceEdit` | [br-6-gated-workspace-edit](../openspec/specs/br-6-gated-workspace-edit/spec.md) |

## Host ids

| Kind | Id (`botrider.*`) | Legacy (`botRider.*`) | Role |
| --- | --- | --- | --- |
| Activity bar | `botrider` | `botRider` | Container |
| Tree view | `botrider.bots` | `botRider.bots` | Bots (checkboxes = active) |
| Webview view | `botrider.chat` | `botRider.chat` | Swarm |
| Tree view | `botrider.review` | `botRider.review` | Proposed Changes (collapsed) |
| URI scheme | `botrider-proposed` | `botRider-proposed` | Proposed file contents |
| Webview panel | `botrider.botForm` | `botRider.botForm` | New/Edit bot |
| Webview panel | `botrider.chatPanel` | `botRider.chatPanel` | Swarm Chat (expand) |

Commands live in category **Bot Rider**. Split Stop is `botrider.chat.stop` only — no `split.stop` / `botRider.split.stop`. Retry is `botrider.changeset.retry`. Recheck is `botrider.copilot.recheck` titled **Sign in to GitHub Copilot**.

### Context keys

`botrider.hasBots`, `botrider.hasActiveBots`, `botrider.hasPendingChanges`, `botrider.debateRunning`, `botrider.splitOpen`, `botrider.copilotReady`, `botrider.chatExpanded`, `botrider.applyFailed`.

`applyFailed` is true **only** after `workspace.applyEdit` returns `ok === false`. It is false on clean pending review.

### Commands

| Command | Title |
| --- | --- |
| `botrider.bots.create` | New Bot |
| `botrider.bots.edit` | Edit Bot |
| `botrider.bots.delete` | Delete Bot |
| `botrider.bots.toggle` | Toggle Active |
| `botrider.chat.expand` | Expand |
| `botrider.chat.stop` | Stop |
| `botrider.changeset.approve` | Approve |
| `botrider.changeset.reject` | Reject |
| `botrider.changeset.retry` | Retry |
| `botrider.review.openDiff` | Open Diff |
| `botrider.split.continue` | Continue |
| `botrider.split.pick` | Pick a Bot to Decide |
| `botrider.copilot.recheck` | Sign in to GitHub Copilot |

Stop palette when: `botrider.debateRunning || botrider.splitOpen`. Retry in Review title when: `botrider.applyFailed` (not on clean pending).

## Folder layout

```
src/extension.ts
src/domain/bot.ts  run-state.ts  changeset.ts
src/app/bot-registry.ts  copilot-gateway.ts  prompt-builder.ts  orchestrator.ts
        patch-parser.ts  changeset-store.ts  thread-store.ts
src/adapters/bots-tree.ts  chat-view.ts  bot-form-panel.ts  chat-expand-panel.ts
            review-tree.ts  proposed-content-provider.ts
src/protocol/messages.ts
media/   activitybar.svg + webview assets
```

VS Code is isolated behind ports so node tests do not import `vscode.lm`. UI never calls `lm` or `applyEdit`. `retainContextWhenHidden` is true **only** on Swarm sidebar + expand.

## Domain types

```
interface BotRecord {
  id: string;
  handle: string;
  name: string;
  persona: string;
  role: string;
  instructions: string;
  active: boolean;
  colorIndex: number;
  createdAt: string;
  updatedAt: string;
}
```

Handle: `@` id `[a-z0-9][a-z0-9_-]{0,31}`, unique case-insensitive. Auto-derive from Name, then editable. Toggle = `TreeItem.checkboxState`, separate from delete. `snapshotActive` / `getByHandle`. In-run edits mutate persist only.

```
TurnKind = propose | critique | consensus | direct | implement
CopilotStatus = ready | missing | noPermissions | notFound | blocked | quota | hung | streamFailed | offTopic
ErrorCode = unknown-handle | multiple-mentions | zero-active | no-workspace | parse-failed | validate-failed | copilot
```

Copilot auth/quota/hung stay on `copilot/status`. `error` with code `copilot` is the thread catch-all only.

```
interface RunStateDto {
  phase: 'idle' | 'debate' | 'direct' | 'implement' | 'split' | 'pendingReview' | 'error';
  round: number;
  splitOpen: boolean;
  debateRunning: boolean;
  applyFailed: boolean; // true ONLY after applyEdit ok===false
  frozenBotIds: string[];
  currentBotId?: string;
  turn?: TurnKind;
}
```

## Protocol (architecture rev 7)

### Host → UI

`bots/snapshot`, `copilot/status`, `run/state`, `chat/turn-start`, `chat/token`, `chat/turn-end`, `chat/split`, `chat/mcp-read-start`, `chat/mcp-read-end`, `chat/mcp-skip`, `changeset/preview`, `changeset/apply-failed`, `changeset/cleared`, `error`

Additive MCP HostToUi only (no UiToHost MCP). Read-only `vscode.lm` MCP tools on propose, critique, and @-direct. Vote and implementer send with `tools: 'none'`.

### UI → host

`bots/create`, `bots/update`, `bots/toggle`, `bots/delete`, `chat/send`, `chat/stop`, `split/continue`, `split/pick`, `changeset/approve`, `changeset/retry`, `changeset/reject`, `review/open-diff`, `copilot/recheck`

Card Stop posts `chat/stop`.

## Orchestrator

One run, never overlapping `sendRequest`. One cancellation token source per run.

- Freeze at RunStarted; keep freeze on split/Continue.
- Sequential propose then critique ×2 then AGREE/DISSENT. Vote: first token `AGREE` or `DISSENT` case-insensitive; rest is reason; unparseable = `DISSENT`. All AGREE ⇒ implementer = first frozen active bot. Else Split. No auto round 3.
- Continue: one more propose/critique round, **same freeze**, then vote.
- Pick: that bot implements.
- Stop during stream: cancel, snapshot into Split, **never implement**.
- Split Stop (`botrider.chat.stop`): end, composer unlocks.
- `@unknown` / multiple `@` / zero-active default / invalid handle ⇒ `ErrorCode`, no Copilot.
- `@known` ⇒ language only even if inactive; inactive does not flip checkbox.
- After solo `@`, last non-empty line `NEED_EDIT` or `NO_EDIT` (optional trailing period stripped). Missing token = `NO_EDIT`. Strip trailer from visible body. Only `NEED_EDIT` starts implementer for that bot.
- `@` and debate are language-only. Separate implementer pass emits JSON changeset. PatchParser drops file bodies on debate/@. Stop never implements.
- Implementer ONLY from: unanimous AGREE, split/pick, or solo `NEED_EDIT`.

Workspace context: full active editor + selection + **paths only** of other tabs. Paths inside workspace; reject `..`, absolute outside, `.git/`.

CRUD never calls `lm`.

## Prompts

1. User persona + role + instructions  
2. User workspace context  
3. History Assistant(text, handle)  
4. User turn instruction  

Drop oldest turns first; never drop persona. `countTokens` vs `maxInputTokens`. User/Assistant only. Stream `.text`. Justification `'Bot Rider debate'`. Omit `options.tools`.

## Implementer JSON

First fenced block that JSON-parses with `files[]`. Tag `json` optional. Extra prose dropped. Each op MUST be `update` | `create` | `delete` else `validate-failed`.

```json
{ "files": [{ "path": "relative/path", "op": "update|create|delete", "content": "..." }] }
```

Delete has no content.

## Copilot gateway (BR-1)

- `vscode.lm.selectChatModels({ vendor: 'copilot' })` only. `models[0]` after vendor filter. Never hardcode family/id.
- User gestures only: Send, `@bot`, Recheck. Startup empty list is **not** `missing` until `onDidChangeChatModels` and `languageModelAccessInformation.onDidChange` settle.
- `canSendRequest` guard. 60s hang then visible error, Stop still available, no silent retry.

## Persistence (BR-3)

- Bots `globalState` key `botrider.bots.v1`.
- Never `setKeysForSync`.
- Transcript memory-only, session-only.
- Pending changeset memory-only.

## Apply (BR-6)

`applyEdit` ONLY from `ChangesetStore.approve()` as `botrider.changeset.approve`. Retry is the same caller, `buildEdit('retry')`. Never `workspace.fs.writeFile`, Node `fs`, `TextEditor.edit`, `needsConfirmation`.

### `buildEdit` table

| op | `initial` | `retry` |
| --- | --- | --- |
| create | `createFile`, overwrite false | `createFile`, overwrite true (leftover creates replace) |
| update | replace full document | replace full document |
| delete | `deleteFile` | skip if already gone; otherwise `ignoreIfNotExists` |

Whole-changeset Approve including create, update, delete.

- Success: clear store, dispose proposed docs, close diffs, post `changeset/cleared`, `applyFailed` false.
- Fail (`ok === false`): never claim success; keep store; Review stays; `applyFailed` true; leftoverCreates/leftoverDeletes; post `changeset/apply-failed`.
- Retry idempotent: leftover creates overwrite/replace; already-gone deletes skip.
- Reject does not auto-delete leftover creates / restore deletes.
- Closing a diff ≠ approve/reject.

Diff titles: `{basename} (Workspace ↔ Proposed)` / `(Empty ↔ Proposed)` / `(Workspace ↔ Deleted)`. Review lists Modified / Added / Deleted.

Honest fail copy: see [ui-ux-spec.md](./ui-ux-spec.md) copy deck.

## Split (BR-5)

Composer locked. Continue / Pick / Stop only. Continue = one more propose/critique round SAME freeze. Send ignored while `splitOpen`. Helper: `Resolve the split to send a new prompt.` Stop = `botrider.chat.stop`.
