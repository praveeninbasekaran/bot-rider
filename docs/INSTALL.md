# Install Bot Rider

Bot Rider is a **VS Code extension** you run **from this repository** (Extension Development Host). It is **not** on the Marketplace. There is **no** `.vsix` in the repo and **no** API key to paste.

If you are GitHub Copilot (or any coding agent): follow this file in order. Do not search for a Marketplace listing. Do not add a Copilot API key. Do not run the swarm in the window you used to clone; run it in the **Extension Development Host** that F5 opens.

## Prerequisites

| Need | Exact |
| --- | --- |
| Git | To clone `https://github.com/praveeninbasekaran/bot-rider.git` |
| Node.js | **20.x** (QA runs Node 20; 22 is fine) |
| npm | Comes with Node |
| Visual Studio Code | **1.99.0 or newer** (`engines.vscode` is `^1.99.0`) |
| GitHub Copilot extension | Marketplace id `GitHub.copilot`, signed in, in **both** the main VS Code window and the Extension Development Host |

Creating, editing, toggling, and deleting bots does **not** need Copilot. **Send**, **Continue**, **Pick a Bot to Decide**, and **Sign in to GitHub Copilot** do.

## 1. Clone and install

In a terminal:

```bash
git clone https://github.com/praveeninbasekaran/bot-rider.git
cd bot-rider
npm install
```

`npm install` must finish without error. Then:

```bash
npm run compile
```

Success: `out/extension.js` exists and the command exits 0. Optional: `npm test` (Vitest; does **not** call Copilot).

## 2. Open this folder in VS Code

File → Open Folder → the `bot-rider` clone (the folder that contains `package.json`).

Do not open a parent directory. The launch config uses `${workspaceFolder}` as `--extensionDevelopmentPath`.

## 3. Launch the Extension Development Host

1. Install **GitHub Copilot** (`GitHub.copilot`) in this VS Code if it is missing.
2. Run and Debug: choose **Run Extension** (`.vscode/launch.json`). Press **F5**.
3. A second VS Code window opens: **Extension Development Host**. Bot Rider runs **only** there.

If F5 fails because `out/` is missing, run `npm run compile` in the clone and press F5 again.

## 4. First run (Development Host only)

1. **File → Open Folder** on a real project (or an empty folder). Swarm needs a workspace folder. If none is open, Send shows: `Open a workspace folder to run the swarm.`
2. Activity Bar: **Bot Rider** (container id `botrider`).
3. **Bots** view should show: `No bots yet. Create a bot with a name, persona, and role, then send a master prompt in Swarm.` Click **New Bot** (command `botrider.bots.create`).
4. Fill **name**, **handle**, **persona**, **role**. Save. Repeat so at least **two** bots are active if you want a debate (one bot is enough for `@handle` solo).
5. Open **Swarm** (`botrider.chat`). Composer placeholder: `Message the swarm. Use @handle to lock a bot.`
6. If Swarm says Copilot is missing, Command Palette → **Bot Rider: Sign in to GitHub Copilot** (`botrider.copilot.recheck`). Sign in, then Send again. Do not paste an API key into Bot Rider.
7. Type a short prompt (no `@`) and Send. Default Send starts Debate & Decide among **active** bots.
8. If the swarm proposes files, they appear in **Proposed Changes**. **Approve** applies the whole batch. **Reject** discards it. There is no per-file Accept.

## 5. Done when

- Activity Bar shows Bot Rider in the Development Host.
- At least one bot exists in **Bots**.
- Swarm accepts Send (or shows a listed error from `docs/TROUBLESHOOTING.md`, not a crash).
- Bot CRUD still works if Copilot is signed out.

## 6. Prompt you can paste into Copilot Chat

Use this in the `bot-rider` workspace:

```
Follow docs/INSTALL.md exactly. Clone is already this workspace. Run npm install and npm run compile if needed. Do not publish to Marketplace. Do not add API keys. Tell me when F5 Run Extension is the next human step.
```

## Out of this guide

Marketplace install, VSIX download, hosted/team swarm sharing, Graphify, extra LLM keys. See `docs/TROUBLESHOOTING.md` if a listed error appears.
