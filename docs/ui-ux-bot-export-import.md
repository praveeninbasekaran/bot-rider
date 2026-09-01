# Bot Rider — UI/UX addendum: F6 bot export / import

Fold into `ui-ux-spec.md` as **§23**. Bots tree + New/Edit form footer + command palette. Do **not** reopen §20 Attach slots or §22 model picker. Not a Swarm control. Not a fourth sidebar.

Architecture: [architecture-bot-export-import.md](./architecture-bot-export-import.md). Additive. **EX-1–4 locked.** JSON and YAML interchange. Never overwrite. Never auto-suffix. Never execute. No Copilot on export/import. F7 parallel / Event Bus out.

## 23. Bot export / import (F6)

**Status:** Additive. **EX-1–4 locked.** File interchange for BR-3 bots. Not a fourth sidebar. Not Swarm chrome. Not token chrome. Not F7 parallel. Not leftovers 002/003/009/014. Do **not** reopen §20 / §22.

### 23.1 Surfaces

| Surface | Control | Command (`botrider.*`) |
| --- | --- | --- |
| Bots tree item context | **Export Bot** | `bots.export` |
| Bots tree (multi-select) | **Export Selected** | `bots.exportSelected` |
| Bots tree view/title | **Export All** | `bots.exportAll` |
| Bots tree view/title + palette | **Import** icon `$(desktop-download)` | `bots.import` |
| Empty Bots welcome (`!botrider.hasBots`) | link **Import** next to New Bot | `bots.import` |
| New Bot / Edit Bot footer | **Export** (secondary, left of Save) | posts `bots/export-self` — see §23.7 |

No fourth sidebar. Checkboxes stay **active** (BR-3). Multi-select is `TreeView.canSelectMany: true` and is **independent** of the checkbox. Export Selected uses **selection**, not “active bots”.

### 23.2 Commands (package.json stubs)

Category **Bot Rider**. Host registers; this chrome contributes menus.

| Command | Title | Icon | Palette | Menus |
| --- | --- | --- | --- | --- |
| `botrider.bots.export` | Export Bot | — | hide (`when: false`) or when a bot item is the context | `view/item/context` `view == botrider.bots && viewItem == bot` |
| `botrider.bots.exportSelected` | Export Selected | — | when `view == botrider.bots` and selection length ≥ 1 | optional title overflow; not inline |
| `botrider.bots.exportAll` | Export All | — | when `botrider.hasBots` | `view/title` `view == botrider.bots && botrider.hasBots` |
| `botrider.bots.import` | Import | `$(desktop-download)` | always (empty swarm included) | `view/title` `view == botrider.bots` group `navigation` |

Welcome (`!botrider.hasBots`) keeps the locked New Bot paragraph and **adds** an Import command link:

> No bots yet. Create a bot with a name, persona, and role, then send a master prompt in Swarm.  
> [New Bot](command:botrider.bots.create)  
> [Import](command:botrider.bots.import)

Do not remove New Bot. Do not add Marketplace copy.

### 23.3 Format QuickPick and files (EX-1)

After Export Bot / Selected / All / form Export (once the dirty modal is resolved):

1. `showQuickPick`: **JSON** (default, first) · **YAML**. Cancel = no export.
2. `showSaveDialog` with filters for the chosen format.

Default filenames:

| How many bots | JSON | YAML |
| --- | --- | --- |
| 1 | `{handle}.bot.json` | `{handle}.bot.yaml` |
| 2+ (Selected or All) | `bots.export.json` | `bots.export.yaml` |

Toast: `Exported {n}.`

Import: `showOpenDialog`, one file, filters JSON (`json`) and YAML (`yaml`, `yml`). Workspace folder is **not** required.

### 23.4 Collision (EX-3)

When an entry’s **handle** is already taken (case-insensitive): modal **Skip** | **Rename**. Never overwrite. Never auto-suffix silently.

- **Skip** → exact copy `Skipped @{handle} · already taken.` Continue the list.
- **Rename** → `showInputBox` for a new handle (BR-2 pattern + unique). Stay on the box until valid or cancel.
- **Cancel rename** (Esc / dismiss) = **Skip** (same skip copy). Then continue.

**Name-only** collision (handle free, name taken, case-insensitive): same Skip | Rename, name `showInputBox`. Skip copy exact: `Skipped {name} · already taken.`

Invalid handle on the file: Skip | Rename. Skip copy: `Skipped @{handle} · invalid handle.` Empty name: `Skipped · name is required.`

Multi-import: resolve **per entry**, then continue. Do not stop the file because one row was skipped.

### 23.5 Multi-import and toasts (EX-2)

Per-bot continue. Individual skip lines as information messages. End summary:

| Result | Copy |
| --- | --- |
| n created, 0 skipped | `Imported {n}.` |
| mix | `Imported {n} · skipped {m}.` |
| 0 created, m skipped | `Imported 0 · skipped {m}.` |

Created bots appear in the tree with new ids (host). No form wizard. No bulk swarm wizard.

### 23.6 Dirty form

If New/Edit is dirty (including New never saved), **before** QuickPick:

Modal copy exact: `Save before export?`

Buttons: **Save** · **Export without saving** · **Cancel**

| Choice | Result |
| --- | --- |
| Save | Existing Save path, then export the persisted bot |
| Export without saving | Write current fields to the file only; do not persist; New Bot does not appear in the tree |
| Cancel | No file |

Clean Edit: no modal; export the persisted bot. Invalid BR-2 draft: existing form errors; no file.

Footer: **Export** is a secondary button in the existing footer row, left of **Save**, right of **Cancel**. Do not add a fourth sidebar. Do not put Export on Swarm.

### 23.7 Host ↔ UI

Tree / palette / title: VS Code commands + native dialogs only. No Swarm protocol.

Form Export only:

- UI → Host: `bots/export-self` with optional `draft` when Export without saving (architecture §5)
- Host → UI: **none** new (native QuickPick / save dialog)

UI never reads/writes the interchange file. UI never calls `vscode.lm`. UI never executes snapshots.

### 23.8 Tree multi-select

`createTreeView('botrider.bots', { canSelectMany: true, ... existing checkbox options })`.

- Checkbox = active (unchanged).
- Ctrl/Cmd click = selection for Export Selected.
- Do not add a fourth view. Do not change Swarm, Review, or §20/§22.

### 23.9 Out

Overwrite / merge into an existing bot · silent auto-suffix · exporting `id` / timestamps / `colorIndex` / SI sessions / transcripts / MCP pending · executing scripts or hooks · Marketplace / catalog / hosted sync · API keys · Copilot on export/import · F7 parallel / Event Bus · fourth sidebar · Swarm chrome · reopening §20 Attach slots · reopening §22 model dropdown · Graphify · leftovers 002/003/009/014 · token/quota chrome · bulk swarm wizard.
