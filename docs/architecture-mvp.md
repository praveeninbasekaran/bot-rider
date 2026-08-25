# Bot Rider MVP architecture

Companion to the short host-id/protocol note in [architecture.md](./architecture.md) (rev 7) and the OpenSpec change [openspec/changes/bot-rider-mvp](../openspec/changes/bot-rider-mvp/proposal.md).

## Product

A VS Code extension (`publisher: botrider`, `name: bot-rider`, `engines.vscode: ^1.99.0`) that freezes a swarm of user-defined bots, debates a master prompt through **GitHub Copilot only**, then (when allowed) runs a separate implementer pass that emits a JSON changeset. The human Approves or Rejects the whole `WorkspaceEdit`.

Empty swarm on first install. No seed bots. No API keys. `activationEvents: []`. No `extensionDependencies` on Copilot. No Chat Participant. No SCM `SourceControl`. No `authentication.getSession`.

## Requirements map

| Id | Contract |
| --- | --- |
| BR-1 | Copilot-only `vscode.lm.selectChatModels({ vendor: 'copilot' })` |
| BR-2 | Custom bots: handle, persona, role, instructions; checkbox active |
| BR-3 | `globalState` `botrider.bots.v1`; Settings Sync off; session transcript + pending changeset |
| BR-4 | Swarm chat (sidebar + expand) |
| BR-5 | Debate & Decide two-round cap; split lock Continue/Pick/Stop; language-only debate/@; separate implementer |
| BR-6 | Whole-changeset Approve (create/update/delete); failed apply never claims success |

## Host ids

See [architecture.md](./architecture.md). Summary:

- Activity bar `botrider`
- Tree `botrider.bots`, webview `botrider.chat` (Swarm), tree `botrider.review` (Proposed Changes, collapsed)
- URI `botrider-proposed:`
- Panels `botrider.botForm`, `botrider.chatPanel` (title **Swarm Chat**)

Context keys: `botrider.hasBots`, `hasActiveBots`, `hasPendingChanges`, `debateRunning`, `splitOpen`, `copilotReady`, `chatExpanded`, `applyFailed`.

## Folder layout

```
src/extension.ts
src/domain/bot.ts run-state.ts changeset.ts
src/app/bot-registry.ts copilot-gateway.ts prompt-builder.ts orchestrator.ts
        patch-parser.ts changeset-store.ts thread-store.ts
src/adapters/bots-tree.ts chat-view.ts bot-form-panel.ts chat-expand-panel.ts
            review-tree.ts proposed-content-provider.ts
src/protocol/messages.ts
media/   activitybar.svg + webview assets
```

VS Code is isolated behind ports (`src/app/ports.ts`) so node Vitest does not import `vscode`.

## Run machine

`RunStateDto.phase`: `idle` | `debate` | `direct` | `implement` | `split` | `pendingReview` | `error`.

- One orchestrator run; never overlapping `sendRequest`; one cancellation token source per run.
- Freeze at RunStarted (`frozenBotIds`); keep freeze on split/Continue. In-run bot edits persist only.
- Default Send: rounds 1–2 sequential propose → critique → vote. All AGREE → implementer = first frozen bot. Else split. No auto round 3.
- Continue: one more propose/critique/vote, same freeze.
- Pick: that bot implements.
- Stop during stream: cancel, snapshot into Split, never implement. Split Stop: end, composer unlocks.
- `@known`: language-only even if inactive. Solo trailer `NEED_EDIT` / `NO_EDIT`. Only `NEED_EDIT` starts implementer for that bot.
- `@unknown` / multiple `@` / zero active default / invalid handle: error, no Copilot.

## Prompts

1. User: persona + role + instructions  
2. User: workspace (full active editor + selection; **paths only** of other tabs)  
3. History: Assistant(text, handle)  
4. User: turn instruction  

Drop oldest history first; never drop persona. `countTokens` vs `maxInputTokens`. User/Assistant only.

## Implementer JSON

First fenced block that JSON-parses with `files[]` (`json` tag optional):

```json
{ "files": [{ "path": "rel/path", "op": "create|update|delete", "content": "..." }] }
```

Delete has no content. Paths inside the workspace; reject `..`, absolute outside, `.git/` segments.

## Apply

Only `ChangesetStore.approve()` as `botrider.changeset.approve`. Retry is the same caller, `buildEdit('retry')`. Table: [architecture.md](./architecture.md).

`applyFailed` is true **only** after `applyEdit` `ok === false`. Honest failure copy is in `APPLY_FAILED_MESSAGE` / [ui-ux-spec.md](./ui-ux-spec.md).

## Copilot

- User gestures: Send, `@bot`, Recheck (`botrider.copilot.recheck`).
- `models[0]` after vendor filter. Never hardcode family/id.
- Stream `.text`. Justification `Bot Rider debate`. Omit `options.tools`.
- `canSendRequest` guard. 60s hang → visible error, Stop available, no silent retry.
- Startup empty list is not `missing` until `onDidChangeChatModels` and `languageModelAccessInformation.onDidChange` settle.

## UI rule

The webview MUST NOT call `vscode.lm` or `applyEdit`. `retainContextWhenHidden` is true **only** on Swarm sidebar + expand.
