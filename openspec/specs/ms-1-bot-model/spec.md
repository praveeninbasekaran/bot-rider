# MS-1 Per-bot Copilot model selection

## Purpose

New/Edit Bot picks a Copilot model via `vscode.lm` only. Persist `LanguageModelChat.id` as `modelId`. Empty = host default. Missing id = host default that turn + visible copy; do not block the turn. Canonical architecture: [docs/architecture-bot-model.md](../../../docs/architecture-bot-model.md). Chrome: [docs/ui-ux-bot-model.md](../../../docs/ui-ux-bot-model.md) §22.

## SHALL requirements

1. Discover `vscode.lm.selectChatModels({ vendor: 'copilot' })` on New/Edit. Select key = `LanguageModelChat.id`. Labels are display only. Copilot vendor only. No API keys. No fake models.
2. Persist `LanguageModelChat.id` only as `BotRecord.modelId` (label never persisted). Empty / unset / omit / `null` = host default. Do not bump `BotStoreFile.version`.
3. That bot’s propose / critique / `@` / implementer SHALL use the pick. Missing id = host default **that turn** + visible copy. Do **not** block the turn.
4. UI never calls `vscode.lm`. Form open is enough gesture for discovery (`selectChatModels` only; never `sendRequest` from CRUD). No Swarm per-message picker.
5. Settings Sync stays off. Not F7 parallel.

## Acceptance

- GIVEN empty `modelId`, THEN that bot uses today’s host default `models[0]` after vendor filter.
- GIVEN a saved id not in current Copilot discovery, THEN the turn still runs on host default with visible copy.
- GIVEN Save, THEN only the id is persisted, never the display label.
