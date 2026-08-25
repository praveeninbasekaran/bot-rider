# Tasks: Bot Rider MVP

Implementation checklist for BR-1 … BR-6. Items are complete on branch `cursor/bot-rider-mvp-7cf1`.

## 1. Extension shell and contribution points

- [x] 1.1 `package.json`: publisher `botrider`, name `bot-rider`, displayName Bot Rider, `engines.vscode` `^1.99.0`, `activationEvents: []`
- [x] 1.2 Activity bar `botrider`; views `botrider.bots`, `botrider.chat` (webview Swarm), `botrider.review` (collapsed)
- [x] 1.3 Commands (category Bot Rider) including Recheck, Retry, Stop as `botrider.chat.stop` only
- [x] 1.4 Menus, viewsWelcome, context keys; no `extensionDependencies`, Chat Participant, or SCM
- [x] 1.5 F5 launch config and README (Copilot required for Send, not CRUD; no API keys)

## 2. BR-1 Copilot-only vscode.lm

- [x] 2.1 `CopilotGateway` + `LanguageModelPort`; `selectChatModels({ vendor: 'copilot' })`; `models[0]` after vendor filter
- [x] 2.2 User gestures only: Send, @bot, Recheck; CRUD never calls lm
- [x] 2.3 User/Assistant only, stream `.text`, justification `Bot Rider debate`, omit tools, `canSendRequest`, token budget
- [x] 2.4 Status mapping; startup empty ≠ missing until both change events settle; 60s hang without silent retry

## 3. BR-2 / BR-3 Bots and persistence

- [x] 3.1 `BotRecord`, handle pattern, unique ci, derive-from-name
- [x] 3.2 `BotRegistry` CRUD, `snapshotActive`, `getByHandle`, checkbox toggle vs delete
- [x] 3.3 Persist `globalState` key `botrider.bots.v1`; never `setKeysForSync`
- [x] 3.4 Empty first install; in-run edits mutate persist only
- [x] 3.5 Bot form panel `botrider.botForm`; tree avatars color+initials SVG

## 4. BR-4 Swarm chat UI

- [x] 4.1 Sidebar webview + expand `botrider.chatPanel` title Swarm Chat; `retainContextWhenHidden` only there
- [x] 4.2 Protocol HostToUi / UiToHost; CSP `default-src none`; `acquireVsCodeApi` once; 16–32ms token flush
- [x] 4.3 Round headers, thinking/speaking chips, SOLO · @{handle}, @ picker inserting `@{handle}` + space
- [x] 4.4 `--vscode-*` tokens; sanitize innerHTML; UI never calls lm or applyEdit

## 5. BR-5 Debate & Decide

- [x] 5.1 Freeze at RunStarted; sequential propose → critique → vote ×2; all AGREE → first frozen implementer
- [x] 5.2 Split lock: Continue / Pick / Stop; Send ignored while `splitOpen`; Continue same freeze
- [x] 5.3 @unknown / multiple / zero-active / invalid handle → error, no Copilot
- [x] 5.4 Language-only debate/@; PatchParser drops file bodies; NEED_EDIT / NO_EDIT trailer
- [x] 5.5 Implementer JSON `files[]`; path validation; Stop never implements
- [x] 5.6 PromptBuilder persona-first, drop oldest not persona, editor body + other-tab paths
- [x] 5.7 One run, one CTS, never overlapping `sendRequest`

## 6. BR-6 Changeset apply

- [x] 6.1 `ChangesetStore.approve()` sole `applyEdit` caller; `buildEdit('initial'|'retry')`
- [x] 6.2 Whole-batch create/update/delete; success clears store, diffs, `applyFailed` false
- [x] 6.3 `ok === false` never success; Review stays; honest apply-failed copy; Retry leftover create / skip gone delete
- [x] 6.4 Reject does not roll back leftovers; Retry title only when `applyFailed`
- [x] 6.5 Proposed content provider `botrider-proposed:`; diff titles Workspace/Empty/Deleted

## 7. Tests and docs

- [x] 7.1 Vitest fakes; isolate vscode behind ports; positive + negative cases
- [x] 7.2 `npm test` and `npm run compile` green
- [x] 7.3 OpenSpec change `openspec/changes/bot-rider-mvp/`
- [x] 7.4 `docs/architecture.md`, `docs/architecture-mvp.md`, `docs/ui-ux-spec.md`
