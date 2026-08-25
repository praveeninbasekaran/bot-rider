# BR-1 Copilot gateway

## Purpose

Bot Rider SHALL talk to language models only through VS Code `vscode.lm` and only GitHub Copilot. There are no API keys and no other vendors. Acceptance follows architecture blueprint **revision 7**.

## SHALL requirements

1. The host SHALL call `vscode.lm.selectChatModels({ vendor: 'copilot' })` and SHALL take `models[0]` after filtering `vendor === 'copilot'`.
2. The host SHALL NOT hardcode model `family` or `id`.
3. The host SHALL NOT select or send to any vendor other than `copilot`.
4. The host SHALL NOT collect, store, or prompt for API keys.
5. `selectChatModels` / `sendRequest` SHALL run only from user gestures: Send, `@bot`, and Recheck (`botrider.copilot.recheck`, title **Sign in to GitHub Copilot**). Recheck SHALL call `selectChatModels({ vendor: 'copilot' })` from that click.
6. Bot CRUD SHALL NEVER call `lm`.
7. Requests SHALL use User and Assistant roles only (no system role), SHALL stream `.text`, SHALL pass `justification: 'Bot Rider debate'`, and SHALL omit `options.tools`.
8. The host SHALL honor `languageModelAccessInformation.canSendRequest` and SHALL fit prompts with `countTokens` vs `maxInputTokens` (drop oldest history first; never drop persona).
9. Startup empty model list SHALL NOT be reported as `missing` until `onDidChangeChatModels` and `languageModelAccessInformation.onDidChange` settle.
10. Copilot auth, quota, and hang SHALL be posted on `copilot/status`. `ErrorCode` `copilot` on `error` is the thread catch-all only.
11. `CopilotStatus` SHALL be `ready` \| `missing` \| `noPermissions` \| `notFound` \| `blocked` \| `quota` \| `hung` \| `streamFailed` \| `offTopic`.
12. A 60s hang SHALL surface a visible error, SHALL keep Stop available (`botrider.chat.stop`), and SHALL NOT silently retry.
13. One run SHALL never overlap `sendRequest`. One cancellation token source per run.

## Acceptance (architecture rev 7)

- GIVEN Recheck is clicked, WHEN the command runs, THEN `selectChatModels({ vendor: 'copilot' })` is invoked from that gesture.
- GIVEN the user creates a bot, THEN `selectChatModels` and `sendRequest` are not called.
- GIVEN no text for 60s on a stream, THEN status is `hung`, Stop remains available, and there is no automatic second request.
- GIVEN activation before both lm change events settle, THEN empty models are not `missing`.
