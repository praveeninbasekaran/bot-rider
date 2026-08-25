# Delta for Copilot (BR-1)

## Purpose

GitHub Copilot is the only language-model backend. Access is through public `vscode.lm` APIs on user gestures.

## ADDED Requirements

### Requirement: Copilot vendor filter
The extension MUST obtain chat models exclusively via `vscode.lm.selectChatModels({ vendor: 'copilot' })`, then take `models[0]` after filtering `vendor === 'copilot'`. It MUST NOT hardcode model `family` or `id`, MUST NOT call other vendors, and MUST NOT collect API keys.

#### Scenario: Recheck click
- GIVEN the user runs `botrider.copilot.recheck` (**Sign in to GitHub Copilot**)
- THEN `selectChatModels({ vendor: 'copilot' })` SHALL run from that click

#### Scenario: CRUD does not select models
- GIVEN the user creates, edits, toggles, or deletes a bot
- THEN the host MUST NOT call `selectChatModels` or `sendRequest`

### Requirement: Request and status contract
Requests MUST use User/Assistant only, stream `.text`, set `justification` to `Bot Rider debate`, and omit `options.tools`. `canSendRequest` MUST be honored. Startup empty model list MUST NOT be `missing` until `onDidChangeChatModels` and `languageModelAccessInformation.onDidChange` settle. Auth/quota/hung stay on `copilot/status`; `error`/`copilot` is catch-all only. A 60s hang MUST be visible, not silently retried, with Stop still available.
