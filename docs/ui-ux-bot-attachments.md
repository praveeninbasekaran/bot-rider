# Bot Rider — UI/UX addendum: Bot form attachments (typed slots)

Fold into `ui-ux-spec.md` §20. Create / Edit bot form only. Not a fourth view.

Architecture: [architecture-bot-attachments.md](./architecture-bot-attachments.md). Replaces the single untyped Attach on Import Existing (IE / §20). Not a new §22.

## 20. Bot form attachments (typed slots, locked)

**IE-1–4 + TA-1–4 locked.** Workspace picker on create and edit (open workspace only). Not remote upload, not a catalog, not GitHub. One form save = **one bot**. Persist is **snapshot text** on the bot record (BR-3), not live paths. Swarm session/reload is unrelated; bots + attachments survive reload. No execute/run on scripts or hooks. No hooks-runner. No global skill install copy. No token/install MCP chrome. TokenGovernor trims of attachments are **silent** (no skip banner).

### 20.1 Slots (replace single Attach)

On New Bot / Edit Bot, after System instructions, before Active. **No** single **Attach...** for the whole form. Labeled slots:

| Slot | Cardinality | Attach |
| --- | --- | --- |
| **Agent** | **Optional, 0 or 1** (not required) | User picks this slot, then a file. One row. New pick **replaces**. Detach → 0. |
| **Skills** | 0..n | User picks this slot, then file(s). Attach + detach. |
| **Scripts** | 0..n | Same |
| **Instructions** | 0..n | Same |
| **Prompts** | 0..n | Same |
| **Hooks** | 0..n | Same |

**Six labeled lists.** User picks the **slot**, then the file. Native `showOpenDialog`, workspace only. Multi-select OK on 0..n slots; Agent is single-select. Still **one bot**. All six may be empty. Empty Agent save is valid.

No folder: those buttons disabled, hint `Open a folder to attach files.`

Each slot has its own **Attach...** (Agent: **Replace...** when a file is already set).

### 20.2 Filters and rows

Picker **filters by slot**. Kind is still the **slot** (a `.md` under Scripts stays a Script).

| Slot | Filter |
| --- | --- |
| Agent, Skills, Instructions, Prompts | markdown / text (`.md` `.txt` `.markdown`) |
| Scripts, Hooks | markdown / text **and** `.py .js .ts .sh .bash .zsh .ps1` (not py/js/sh only) |

Row label: **filename + original path**. Path is a label only; snapshot lives on the bot record. Detach does not delete the disk file. Agent detach clears the single row.

Skip copy **unchanged** (§20.4). No hooks-runner chrome. No fourth view.

### 20.3 Map into empty fields only

**Only the Agent slot** maps name / handle / persona. Files in other slots **never** map, even if the basename is `AGENTS.md` / `SKILL.md` / `AGENT.md`.

Fill **empty** fields only. **Never silently overwrite** filled fields. Replace Agent remaps **empty** fields only from the new file.

Default New Bot **persona starts empty** so an Agent-slot map can fill it (already shipped as `defaultNewBotPersona`).

Handle still follows BR-2 (unique, pattern). Collision or invalid handle is a **form validation error** (`@{handle} is already taken.` / pattern copy). **No Copilot call.**

Do not map `role` or `instructions`.

### 20.4 Skip that file, visible, continue

Cap **256 KiB per file**. Skip unreadable, binary, or too large. Do not fail the rest of the pick or Save.

| Reason | Copy |
| --- | --- |
| Unreadable | Skipped {name} · Can't read this file. |
| Binary | Skipped {name} · Binary file. |
| Too large | Skipped {name} · too large |
| Outside workspace | Skipped {name} · Not in this workspace. |

Huge-file copy is exactly **too large**. Skip rows are notices, not persisted. Dismiss with close.

Skipping one file does **not** fail the whole create/edit or the rest of the pick. Cap is **256 KiB (262144 bytes)** per file.

Do **not** show a skip banner if TokenGovernor later trims attachment snapshots. Those trims are silent extras.

### 20.5 Host to UI (ports pass slot)

- UI to host: `bots/attach-pick { slot }` ; `bots/attach-remove { slot, path }`
- Host to UI: `bots/attach-added { slot, files: [{ path, name }] }` ; `bots/attach-skipped { slot, name, reason }` ; `bots/attach-mapped { name?, handle?, persona? }` applied only if that field is empty
- create/update attachments: `[{ kind, path, snapshot, name }]` — path is the original-path label; snapshot text lives on the BR-3 bot record; **Agent kind length 0 or 1, never required**

`slot` / `kind` enum: `'agent' | 'skills' | 'scripts' | 'instructions' | 'prompts' | 'hooks'`.
Ports use `slot`. Persisted field is `kind` and **equals** the slot the user picked.

UI never reads disk. Host never starts a hooks runner from this chrome.

### 20.6 Out

Single undifferentiated Attach button, fourth view, remote/catalog/GitHub import, bulk swarm wizard, hooks execute/run / hooks-runner, global skill install copy, token/install MCP chrome, skip banner for TokenGovernor trims, overwriting filled name/handle/persona, treating path as a live file, inferring kind from filename, requiring an Agent file, a second runtime, any model other than `vscode.lm`.
