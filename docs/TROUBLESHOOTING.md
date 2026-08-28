# Troubleshoot Bot Rider

Match the **exact** Swarm / toast string. Do not invent keys. Commands use category **Bot Rider**.

If you are Copilot: quote the user-visible string, then apply only the matching row. Do not retry Send in a loop. Hung Copilot is 60s with no silent retry.

## Install / launch

| You see | Do this |
| --- | --- |
| F5 does nothing / no Extension Development Host | This window must be the **clone** (folder with `package.json`). Pick launch config **Run Extension**. |
| Compile errors / `out/extension.js` missing | In the clone: `npm install` then `npm run compile`. Need Node 20+. VS Code **1.99+**. |
| Bot Rider icon missing | You are in the **parent** VS Code, not the Development Host. Use the window F5 opened. |
| Swarm Send does nothing useful with no folder | File → Open Folder in the Development Host. |

## Copilot

| Exact copy | Cause | Fix |
| --- | --- |
| `GitHub Copilot is not available. Sign in to GitHub Copilot, then retry Send.` | Copilot missing or signed out | Install `GitHub.copilot`. Command **Bot Rider: Sign in to GitHub Copilot** (`botrider.copilot.recheck`). Then Send. No API key. |
| `Bot Rider does not have permission to use GitHub Copilot yet.` | `LanguageModelChat.canSendRequest` is false | Accept Copilot permissions in that window. Recheck, then Send. |
| `GitHub Copilot did not respond within 60 seconds. Stop is still available.` | 60s hang, no silent retry | **Stop** (`botrider.chat.stop`) is valid. Send again only as a new gesture. |

CRUD (New/Edit/Toggle/Delete bot) must work **without** Copilot.

## Swarm / debate

| Exact copy | Fix |
| --- | --- |
| `Open a workspace folder to run the swarm.` | Open a folder in the Development Host. |
| `Turn on at least one bot, or @mention a bot to lock the turn.` | Check a bot in **Bots**, or Send `@handle` for a known bot. |
| `No bot named @{handle}.` | Handle must match a saved bot handle, not the display name. |
| `Mention only one bot to lock a turn.` | One `@handle` per Send. |
| `Resolve the split to send a new prompt.` | Split is open. Use **Continue**, **Pick a Bot to Decide**, or **Stop**. Composer stays locked until then. |
| `Debate paused` / `Interrupted` | Stop during a live debate. Split shows positions. Not an implementer pass. |
| `Stopped without implementation.` | Stop from Split. No files written. |
| `Prompt doesn't fit Copilot` then `The minimum context for this turn is larger than Copilot's window.` then `Shorten the prompt or shrink the active editor. Required context was not dropped.` | Pack overflow. Composer **stays enabled**. Shorten the prompt or shrink the active file. Send again. Not a pre-Send modal. |

## Proposed Changes

| Exact copy | Fix |
| --- | --- |
| `Open a folder to apply proposed edits.` | Open a folder before **Approve**. |
| `The implementer reply did not contain a JSON changeset with files[].` | Model output was not a valid changeset. Reject or send a new prompt. Nothing applied. |
| `The proposed changeset failed validation.` | Paths/ops rejected. Nothing applied. |
| Apply failed (Retry appears) | **Retry** (`botrider.changeset.retry`) only when apply failed. Already-written files are not rolled back. |

Approve is the **whole** batch. Closing a diff is not Approve.

## MCP (optional)

| Exact copy | Meaning |
| --- | --- |
| `Not in this workspace.` | Configured MCP server not in this workspace. |
| `Not signed in. Sign in from VS Code MCP settings.` | MCP auth, not Copilot. |
| `Tool not available.` | Named tool missing. |
| `Writes through {server} aren't available in Bot Rider.` | MCP is read-only here. |

Zero configured MCPs: swarm runs with no MCP banner.

## Still stuck

1. Confirm you are in the **Extension Development Host**.
2. `npm run compile` exits 0.
3. VS Code 1.99+, Node 20+, `GitHub.copilot` installed in that host.
4. Do not add vendor keys to settings.

Paste into Copilot Chat:

```
Read docs/TROUBLESHOOTING.md. I will paste the exact Swarm error. Match that row only. Do not suggest API keys or Marketplace install.
```
