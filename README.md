# Bot Rider

Bot Rider is a VS Code extension that runs a **swarm of persona bots** through GitHub Copilot. Bots debate a master prompt in natural language, then a separate implementer pass can emit a JSON changeset. You review proposed workspace edits and Approve or Reject the whole batch.

## Requirements

- Visual Studio Code `^1.99.0`
- [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) is required to **Send** a swarm prompt (and for Continue / Pick / Recheck)
- Creating, editing, toggling, and deleting bots does **not** need Copilot
- **No API keys.** Bot Rider never asks for a model key and never calls any vendor except Copilot via `vscode.lm.selectChatModels({ vendor: 'copilot' })`

## Run from source (F5)

1. Clone this repo and run `npm install`
2. Open the folder in VS Code
3. Press **F5** to launch the Extension Development Host (`Run Extension` in `.vscode/launch.json`)
4. In the Development Host, open a workspace folder, click the Bot Rider activity bar icon, create bots, then send a prompt in **Swarm**

`npm test` runs the Vitest suite (fake Copilot gateway; it does not call `vscode.lm`). `npm run compile` typechecks the extension.

## How it works

1. Create bots (name, handle, persona, role, system instructions). Handles look like `@alpha` and are unique.
2. Toggle which bots are active with the tree checkboxes.
3. Type a master prompt in Swarm. Use `@handle` to lock a single bot for a language-only turn.
4. Default debate: two rounds of propose → critique → AGREE/DISSENT. Unanimous AGREE runs the implementer. Otherwise you get a split: **Continue**, **Pick a bot to decide**, or **Stop**.
5. Proposed files appear under **Proposed Changes**. Approve applies the whole `WorkspaceEdit`. Reject discards it. If apply fails, **Retry** finishes leftovers; Bot Rider does not roll back files that already landed.

Copilot sign-in is the **Sign in to GitHub Copilot** command (`botrider.copilot.recheck`), which calls `selectChatModels({ vendor: 'copilot' })` from that click. Send and `@bot` are the other user gestures that may select a Copilot model.
