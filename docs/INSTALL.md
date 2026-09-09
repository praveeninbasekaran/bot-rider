# Install Bot Rider

Bot Rider is distributed as a versioned **VSIX** in the repository's CI/release artifacts. It is not currently listed on the Marketplace and never requires a model API key.

## 1. Install the VSIX

1. Download `bot-rider-<version>.vsix` from the release or workflow artifact.
2. In VS Code, run **Extensions: Install from VSIX…** and select the file.
3. Reload VS Code and open a project folder.
4. Open the Bot Rider activity bar. The protected Spec and Dispatcher bots are created automatically.
5. Follow **Getting Started** to verify GitHub Copilot and try the sample task.

After a window reload, Bot Rider may offer **Resume**, **Review pending**, or **Discard**. Restored MCP actions never run until you explicitly approve them again.

## Prerequisites

| Need | Exact |
| --- | --- |
| Git | To clone `https://github.com/praveeninbasekaran/bot-rider.git` |
| Node.js | **20.x** (QA runs Node 20; 22 is fine) |
| npm | Comes with Node |
| Visual Studio Code | **1.99.0 or newer** (`engines.vscode` is `^1.99.0`) |
| GitHub Copilot extension | Marketplace id `GitHub.copilot`, signed in, in **both** the main VS Code window and the Extension Development Host |

Creating, editing, toggling, and deleting bots does **not** need Copilot. **Send**, **Continue**, **Pick a Bot to Decide**, and **Sign in to GitHub Copilot** do.

## 2. Contributor setup from source

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

## 3. Open this folder in VS Code

File → Open Folder → the `bot-rider` clone (the folder that contains `package.json`).

Do not open a parent directory. The launch config uses `${workspaceFolder}` as `--extensionDevelopmentPath`.

## 4. Launch the Extension Development Host

1. Install **GitHub Copilot** (`GitHub.copilot`) in this VS Code if it is missing.
2. Run and Debug: choose **Run Extension** (`.vscode/launch.json`). Press **F5**.
3. A second VS Code window opens: **Extension Development Host**. Bot Rider runs **only** there.

If F5 fails because `out/` is missing, run `npm run compile` in the clone and press F5 again.

## 5. First run

1. **File → Open Folder** on a real project (or an empty folder). Swarm needs a workspace folder. If none is open, Send shows: `Open a workspace folder to run the swarm.`
2. Activity Bar: **Bot Rider** (container id `botrider`).
3. **Bots** includes protected Spec and Dispatcher profiles. Add optional worker templates from Getting Started or **New Bot**.
4. Keep both core bots active. Their model and persona can be customized, but their core responsibilities cannot be removed.
5. Open **Swarm** (`botrider.chat`). Composer placeholder: `Message the swarm. Use @handle to lock a bot.`
6. If Swarm says Copilot is missing, Command Palette → **Bot Rider: Sign in to GitHub Copilot** (`botrider.copilot.recheck`). Sign in, then Send again. Do not paste an API key into Bot Rider.
7. Type a short prompt (no `@`) and Send. Default Send starts Debate & Decide among **active** bots.
8. If the swarm proposes files, they appear in **Proposed Changes**. Select files with the review-tree checkboxes. **Approve** applies selected validated changes atomically; **Reject** discards them. Regenerate any stale hunk before approval.

## 6. Done when

- Activity Bar shows Bot Rider in the Development Host.
- At least one bot exists in **Bots**.
- Swarm accepts Send (or shows a listed error from `docs/TROUBLESHOOTING.md`, not a crash).
- Bot CRUD still works if Copilot is signed out.

## 7. Build and release checks

- `npm run package:vsix` creates `artifacts/bot-rider-<version>.vsix`.
- `npm run test:extension` activates the extension in an isolated Extension Host.
- `npm run test:vsix` installs the packaged VSIX into an isolated VS Code test profile.
- `npm run release:gate` runs compilation, all tests, Graphify freshness, packaging, activation, and install checks.

Tagged releases are additionally blocked until a non-developer first-task test is explicitly attested.

## 8. Prompt you can paste into Copilot Chat

Use this in the `bot-rider` workspace:

```
Follow docs/INSTALL.md exactly. Install the release VSIX for end-user use. For contributor work, run npm install, npm run compile, and F5. Do not add API keys.
```

## Out of this guide

Marketplace publishing, hosted/team swarm sharing, and extra LLM keys. See `docs/TROUBLESHOOTING.md` if a listed error appears.
