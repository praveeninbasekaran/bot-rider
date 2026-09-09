# Bot Rider

Bot Rider is a VS Code extension that runs a **swarm of persona bots** through GitHub Copilot. Protected Spec and Dispatcher bots plan work, dependency-ready workers run under a bounded scheduler, and all file or MCP side effects remain behind explicit review.

## Install

Download the versioned `.vsix` from the CI/release artifacts, then in VS Code choose **Extensions: Install from VSIX…**. Reload VS Code, open the Bot Rider activity bar, and follow **Getting Started**. See [docs/INSTALL.md](docs/INSTALL.md) for Copilot setup, recovery, and verification.

## Requirements

- Visual Studio Code `^1.99.0`
- [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) is required to **Send** a swarm prompt (and for Continue / Pick / Recheck)
- Creating, editing, toggling, and deleting bots does **not** need Copilot
- **No API keys.** Bot Rider never asks for a model key and never calls any vendor except Copilot via `vscode.lm.selectChatModels({ vendor: 'copilot' })`

## Contributor setup (F5)

See [docs/INSTALL.md](docs/INSTALL.md) for the precise steps.

1. Clone this repo and run `npm install`
2. Open the folder in VS Code
3. Press **F5** to launch the Extension Development Host (`Run Extension` in `.vscode/launch.json`)
4. In the Development Host, open a workspace folder, click the Bot Rider activity bar icon, create bots, then send a prompt in **Swarm**

`npm test` runs the Vitest suite (fake Copilot gateway; it does not call `vscode.lm`). `npm run compile` typechecks the extension.

## How it works

1. Create bots (name, handle, persona, role, system instructions). Handles look like `@alpha` and are unique.
2. Toggle which bots are active with the tree checkboxes.
3. Type a master prompt in Swarm. Use `@handle` to lock a single bot for a language-only turn.
4. Debate runs bounded proposals, one synthesis, targeted objections, and a policy decision. **Continue**, **Pick**, and **Stop** remain explicit controls.
5. Proposed files appear under **Proposed Changes**. Select files, inspect validated text hunks or binary deliverables, then Approve or Reject. Stale hunks must be regenerated.

Copilot sign-in is the **Sign in to GitHub Copilot** command (`botrider.copilot.recheck`), which calls `selectChatModels({ vendor: 'copilot' })` from that click. Send and `@bot` are the other user gestures that may select a Copilot model.

## Documentation

- [docs/INSTALL.md](docs/INSTALL.md) — VSIX installation and contributor setup
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — exact error copy
- [docs/architecture-mvp.md](docs/architecture-mvp.md) — architecture blueprint revision 7
- [docs/ui-ux-spec.md](docs/ui-ux-spec.md) — Bot Rider UI/UX Specification
- [openspec/README.md](openspec/README.md) — OpenSpec index
- [openspec/specs.md](openspec/specs.md) — BR-1 … BR-6
