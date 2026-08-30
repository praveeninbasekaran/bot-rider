# Bot Rider — Bot form import (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR-1–BR-6, QC, HV, or MA.
Stories: **IE-1** snapshot persist, **IE-2** TokenGovernor extras, **IE-3** empty-only map + attach/detach on edit, **IE-4** skip huge/unreadable/binary, never execute.
UI chrome contract: `ui-ux-spec.md` §20 (addendum `ui-ux-bot-attachments.md`).
Date: 2026-08-30.
Parent: `architecture-mvp.md`. Pack: `architecture-token-save.md` (QC extras only; minimum pack **unchanged**). HV / MA / WM **untouched**.
Additive protocol. **Copilot stays `vscode.lm`.** No second runtime.

Split (when PO allocates): **Developer 1** host (picker, snapshot, BotRecord, TokenGovernor extras, map). **Developer 2** §20 bot-form chrome. QA after both.

---

## 0. Non-negotiables (PO + IE-1–4 + §20)

- Workspace file picker on **create and edit**. Multi-select OK. Still **one bot**. No bulk swarm wizard.
- **Snapshot** readable UTF-8 text into the **bot record**. Original path is a **label only**. Do **not** re-read the path at Send. File may be gone in the next workspace.
- Persist is **BR-3** `context.globalState` key `botrider.bots.v1`. Same machine, all workspaces. **Settings Sync off** (`setKeysForSync` stays off).
- **First clearly-agent file** in the pick (see §3) maps **name / handle / persona**. Fill **empty** fields only. **Never overwrite** filled fields. Do not map `role` or `instructions`.
- **Scripts / hooks are never clearly-agent and never execute.** No `spawn`, no shell, no tasks, no eval, no hooks runner.
- **Edit:** attach add/detach. Same empty-only map on a new attach.
- Per-file cap **256 KiB (262144 bytes)**. Skip unreadable / binary / too large / outside workspace, **visible**, **continue**. Huge copy is exactly `too large`. Skip is **not** persisted. **No Copilot call** for a skip.
- Handle BR-2 collision or invalid pattern = **form validation error**, **no Copilot call**.
- Attachments are **TokenGovernor extras** on **that bot’s** `propose` / `critique` / `direct` / `implement` turns only. **Not** minimum pack. **Other bots do not receive them.** Vote / Split / Stop: no extras. Trimmed extras are **silent** (no skip banner). QC-3 pack-overflow still Swarm thread error if **minimum pack** misses.
- No global skill install. No GitHub scrape. No second runtime. Disk writes still BR-6. MCP writes still Grain B. HV voice unchanged.
- Additive. **BR-1–6, QC packs, HV, MA frozen.** Leftovers 002/003/009/014 out. Graphify out. No fourth view. No token chrome. No pre-Send gate.

---

## 1. Component

```
Bot form  --bots/attach-pick-->  Host showOpenDialog (workspace, files, many)
              |  per file:
              |    outside workspace → bots/attach-skipped
              |    size > 262144     → bots/attach-skipped  "too large"
              |    binary / unreadable → bots/attach-skipped
              |    else read UTF-8 snapshot, hold on the open form
              |    bots/attach-added { path, name }
              |    if first clearly-agent this pick (and field empty):
              |      bots/attach-mapped { name?, handle?, persona? }
              v
Save  bots/create | bots/update
              attachments: [{ path, snapshot, name }]  → BotRecord (globalState)

Send (this bot, propose|critique|direct|implement)
              TokenGovernor extras: attached snapshots
              trim extras silent (after MCP payload, before touching minimum pack)
              other bots: no extras

Vote / Split / Stop: no attachment extras
Never re-read path. Never execute snapshot.
```

---

## 2. BotRecord (additive)

Do **not** bump `BotStoreFile.version`. Missing `attachments` reads as `[]`.

```ts
type BotAttachment = {
  path: string;      // original workspace-relative label, e.g. docs/AGENTS.md
  name: string;      // filename, e.g. AGENTS.md
  snapshot: string;  // UTF-8 text captured at attach time
};

interface BotRecord {
  // existing fields unchanged
  attachments?: BotAttachment[];
}
```

- `path` is **not** a live URI. Display: `{name} · {path}` (§20.2).
- Empty list is valid.
- CRUD still `await globalState.update`. Last write wins across windows.
- Delete bot drops its snapshots with the record.
- Detach removes that item from the form / record. **Does not** delete the disk file.

`bots/create` `draft` and `bots/update` `patch` accept `attachments: BotAttachment[]` (full list from the form). Host does **not** merge with disk files.

Form draft (unsaved) lives in host memory for that panel only. Reload of VS Code drops an unsaved form, same as today.

---

## 3. Clearly-agent map (host parse, no Copilot)

**Clearly-agent** = basename (case-insensitive) is exactly `AGENTS.md`, `SKILL.md`, or `AGENT.md`.

Scripts/hooks (`.sh`, `.ps1`, `.bash`, `.zsh`, `.hook`, files under `.husky/` or `hooks/`) **never** map and **never** execute. They may still **attach** as extras if they pass the text/size gates.

**First** clearly-agent file in the current pick order is the mapper. Later clearly-agent files attach as extras only (no second map).

Host parse, **no `sendRequest`**:

1. YAML frontmatter between leading `---` fences. Keys (case-insensitive): `name`, `handle`, `persona`, `description`.
2. Else first ATX `H1` (`# `) → `name`. Remaining markdown body → `persona`.
3. Map targets: `name` ← `name` / H1. `handle` ← `handle` (trim, lower-case). `persona` ← `persona` else `description` else body after frontmatter/H1.
4. Apply a field **only if it is currently empty** on the form. Never overwrite. Do not map `role` or `instructions`.
5. Handle still BR-2: `[a-z0-9][a-z0-9_-]{0,31}`. If the mapped handle is invalid **or** collides (case-insensitive) with another bot, leave it on the form and fail **Save** with the existing validation copy (`@{handle} is already taken.` / pattern copy). **No Copilot.**

If no clearly-agent file was picked, fields stay as the user typed (or empty). Create still auto-derives handle from Name on Save when handle is empty, same as today.

---

## 4. Picker and skip

Host owns `vscode.window.showOpenDialog`:

- `canSelectMany: true`, `canSelectFiles: true`, `canSelectFolders: false`
- `defaultUri` = workspace folder
- title: `Attach workspace files`

No folder open: do not open the dialog. Chrome disables Attach and shows `Open a folder to attach files.`

Per selected URI, **in order**:

| Gate | Skip `reason` | `message` (exact) |
| --- | --- | --- |
| Not under the open workspace folder | `outside-workspace` | `Skipped {name} · Not in this workspace.` |
| `fs.stat` size **or** byte length **> 262144** | `too-large` | `Skipped {name} · too large` |
| NUL in the first 8 KiB, or UTF-8 decode fails | `binary` | `Skipped {name} · Binary file.` |
| Read throws / unreadable | `unreadable` | `Skipped {name} · Can't read this file.` |

Huge-file copy is exactly **`too large`** (not “Too large”, not a KiB figure).

Skip that file, emit `bots/attach-skipped`, **continue**. Do not fail the rest of the pick or Save. Skips are notices, not stored on `BotRecord`. Duplicate path on the same form: ignore the second pick (no second row).

`bots/attach-remove { path }` drops that draft/record item by label. No disk delete.

---

## 5. TokenGovernor extras (IE-2)

Minimum pack **unchanged** (QC-2/QC-3): prompt + board + (LSP slice on debate/@ **OR** implementer file(s)) + tab paths.

**New extra**, same family as current-turn MCP reads:

- Include **only** when packing **this** bot’s `propose` / `critique` / `direct` / `implement` turn.
- Other bots in the same run do **not** see this bot’s snapshots.
- Vote / Split / Stop / consensus: **no** attachment extras.
- Source of truth is `BotRecord.attachments[].snapshot`, **not** a file read.

Pack shape (host-built, not bot-authored markdown chrome):

```
Attached files
{name} ({path})
{snapshot}
```

Trim order on overflow: extras first. Attachment snapshots trim **after** MCP payload size, **before** any minimum-pack field. Drop from the **end** of the attachments list until the pack fits, or drop all extras. **Silent.** No `bots/attach-skipped`, no Swarm skip row, no token chrome.

If extras are gone and the **minimum pack** still misses `maxInputTokens`: existing QC-3 `error` `code: 'pack-overflow'`. No `sendRequest`. Composer enabled.

---

## 6. Protocol (additive)

Do **not** remove existing `bots/*`. **Do** add:

```ts
type AttachSkipReason = 'unreadable' | 'binary' | 'too-large' | 'outside-workspace';

type HostToUi = /* existing */
  | { type: 'bots/attach-added'; files: { path: string; name: string }[] }
  | { type: 'bots/attach-skipped'; name: string; reason: AttachSkipReason; message: string }
  | { type: 'bots/attach-mapped'; name?: string; handle?: string; persona?: string };

type UiToHost = /* existing */
  | { type: 'bots/attach-pick' }
  | { type: 'bots/attach-remove'; path: string };
```

`bots/create` `draft` and `bots/update` `patch` gain optional `attachments?: BotAttachment[]`.

`bots/attach-mapped` carries only fields the host actually filled (empty-only). UI applies the same empty-only rule as defense in depth.

UI **never** reads disk. UI **never** sends snapshot bytes it invented. Host reads, snapshots, and returns labels.

---

## 7. Copy

| Situation | Copy |
| --- | --- |
| No folder | `Open a folder to attach files.` |
| Unreadable | `Skipped {name} · Can't read this file.` |
| Binary | `Skipped {name} · Binary file.` |
| Too large | `Skipped {name} · too large` |
| Outside workspace | `Skipped {name} · Not in this workspace.` |
| Handle collision | existing BR-2 `@{handle} is already taken.` |
| Invalid handle | existing BR-2 pattern copy |

No Copilot call on skip or validation.

---

## 8. Out of this slice

Fourth view, bulk swarm wizard, hooks runner / execute, global skill install, GitHub scrape, live path re-read at Send, overwriting filled name/handle/persona, token/pack chrome, skip banner for TokenGovernor trims, second runtime, CLAUDE.md-as-vendor special case, Graphify, leftovers 002/003/009/014, pack/HV/MA changes, BR-6 / Grain B changes.

---

## 9. Tests (merge bar after PO allocates)

- Attach a workspace `AGENTS.md` under 256 KiB: snapshot stored on the record; `path` is the relative label; Send does not `fs.readFile` that path.
- First clearly-agent file maps empty name/handle/persona; a second `SKILL.md` in the same pick does not remap; filled fields stay.
- Scripts/hooks attach (if text + size OK) and never spawn / never map.
- File of 262145 bytes: skip message ends with `too large`; other files in the same pick still attach; no Copilot.
- Binary / unreadable / outside workspace: matching skip copy; pick continues.
- Handle collision on Save: validation error, no Copilot.
- TokenGovernor: extras present on that bot’s debate/@/implementer pack only; other bots’ packs omit them; vote pack omits them; trimming extras does not emit skip; minimum-pack miss still `pack-overflow`.
- Settings Sync still not called for bot keys. `attachments` missing on old records reads as `[]`.
- WM / QC / HV / MA tests still pass.
