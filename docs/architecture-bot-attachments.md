# Bot Rider — Bot form import (typed attachments)

Status: **ready for implementation.** Design only until a developer lands typed slots. Not a host rewrite of BR-1–BR-6, QC, HV, MA, or SD. Replaces the shipped untyped Attach on Import Existing (IE / §20). **Not a new §22.**
Stories TA-1–4.
- Six slots on New/Edit Bot. No undifferentiated Attach.
- Agent: 0 or 1, not required. Empty Agent save allowed. Map empty name/handle/persona only when an Agent file is present (default persona counts as empty).
- Skills/Scripts/Instructions/Prompts/Hooks: 0..n. User picks the slot then the file. Kind is the slot, not the extension.
- Filters: Agent/Skills/Instructions/Prompts markdown/text. Scripts/Hooks markdown/text plus .py .js .ts .sh .bash .zsh .ps1.
- Never execute. 256 KiB skip. Snapshot text + path + kind. TokenGovernor extras that bot only, pack label includes kind.
- BR/QC/HV/MA/SD frozen. Leftovers 002/003/009/014 out.

IE-1–4 still hold: snapshot UTF-8 text, path is a label, empty-only map, 256 KiB skip `too large`, never execute, one bot per form save, no global skill install.
UI chrome contract: `ui-ux-spec.md` §20 (addendum `ui-ux-bot-attachments.md`).
Date: 2026-08-31.
Parent: `architecture-mvp.md`. Pack: `architecture-token-save.md` (QC extras only; minimum pack **unchanged**). HV / MA / WM / SD **untouched**.
Additive protocol. **Copilot stays `vscode.lm`.** No second runtime. Old untyped `bots/attach-pick` (no slot) is **replaced**.

Split (when PO allocates; do not allocate in this docs PR): **Developer 1** host (slot on ports, kind on BotRecord, Agent 0..1, slot filters, Agent-slot-only map, TokenGovernor kind label, never execute). **Developer 2** §20 six-slot chrome (replace single Attach). QA after both, on a **new product PR**, not stacked on this docs PR.

---

## 0. Non-negotiables (PO + IE-1–4 + TA-1–4 + §20)

- **Six slots.** **No** single Attach. Kind **is the slot**, not the extension. User picks the **slot**, then the file. Host does **not** infer kind from filename (picker filters only).
- **Agent** is **0 or 1, not required**. Empty Agent save allowed. Empty row valid. All six slots may be empty.
- **Skills / Scripts / Instructions / Prompts / Hooks** are **0..n**.
- Workspace file picker on **create and edit**. Native `showOpenDialog`, workspace only. Multi-select OK on 0..n slots; Agent is single-select. Still **one bot**. No bulk swarm wizard.
- **Snapshot** readable UTF-8 text into the **bot record**. Original path is a **label only**. Do **not** re-read the path at Send. File may be gone in the next workspace.
- Persist is **BR-3** `context.globalState` key `botrider.bots.v1`. Same machine, all workspaces. **Settings Sync off** (`setKeysForSync` stays off).
- **Only the Agent slot** maps name / handle / persona. Fill **empty** fields only. **Never overwrite** filled fields. Files in other slots **never** map, even if the basename is `AGENTS.md` / `SKILL.md` / `AGENT.md`. Do not map `role` or `instructions`.
- **Never execute.** No `spawn`, no shell, no tasks, no eval, **no hooks-runner**. Copilot stays `vscode.lm` only. No second runtime. Scripts / hooks snapshots never run.
- **Edit:** attach add/detach per slot. Agent: new pick **replaces**. Same empty-only map on a new Agent attach.
- Per-file cap **256 KiB (262144 bytes)**. Skip unreadable / binary / too large / outside workspace, **visible**, **continue**. Huge copy is exactly `too large`. Skip is **not** persisted. **No Copilot call** for a skip.
- Handle BR-2 collision or invalid pattern = **form validation error**, **no Copilot call**.
- Attachments are **TokenGovernor extras** on **that bot’s** `propose` / `critique` / `direct` / `implement` turns only. **Not** minimum pack. **Other bots do not receive them.** Vote / Split / Stop: no extras. Trimmed extras are **silent** (no skip banner). QC-3 pack-overflow still Swarm thread error if **minimum pack** misses. Pack label includes kind.
- One bot per form save. No global skill install. No undifferentiated Attach.
- No GitHub scrape. No second runtime. Disk writes still BR-6. MCP writes still Grain B. HV voice unchanged. SD still uses an already-attached snapshot as HTML template only; kind does not change that.
- Additive. **BR / QC / HV / MA / SD frozen otherwise.** This CR only replaces untyped Attach on IE/§20. Leftovers 002/003/009/014 out. Graphify out. No fourth view. No token chrome. No pre-Send gate.

---

## 1. Component

```
Bot form  --bots/attach-pick { slot }-->  Host showOpenDialog (workspace, files, slot filters)
              |  Agent: many=false; others: many=true
              |  per file:
              |    outside workspace → bots/attach-skipped { slot }
              |    size > 262144     → bots/attach-skipped { slot }  "too large"
              |    binary / unreadable → bots/attach-skipped { slot }
              |    duplicate path in same slot → ignore
              |    else read UTF-8 snapshot, hold on the open form
              |    bots/attach-added { slot, files: [{ path, name }] }
              |    if slot === agent and field empty:
              |      bots/attach-mapped { name?, handle?, persona? }
              v
Save  bots/create | bots/update
              attachments: [{ kind, path, snapshot, name }]  → BotRecord (globalState)
              Agent kind length 0 or 1, never required

Send (this bot, propose|critique|direct|implement)
              TokenGovernor extras: attached snapshots (this bot only)
              pack label: {name} ({path}) · {kind}  (omit · kind if missing)
              trim extras silent (after MCP payload, before touching minimum pack)
              other bots: no extras

Vote / Split / Stop: no attachment extras
Never re-read path. Never execute snapshot. No hooks-runner.
```

---

## 2. BotRecord (additive)

Do **not** bump `BotStoreFile.version`. Missing `attachments` still reads as `[]`.

```ts
type AttachmentKind = 'agent' | 'skills' | 'scripts' | 'instructions' | 'prompts' | 'hooks';

type BotAttachment = {
  path: string;      // original workspace-relative label, e.g. docs/AGENTS.md
  name: string;      // filename, e.g. AGENTS.md
  snapshot: string;  // UTF-8 text captured at attach time
  kind: AttachmentKind; // slot the user picked; NOT inferred from filename
};

interface BotRecord {
  // existing fields unchanged
  attachments?: BotAttachment[];
}
```

- `path` is **not** a live URI. Display: filename + original path (`{name} · {path}`) (§20.2).
- Empty list is valid. All six kinds may be absent.
- At most **one** item with `kind: 'agent'`. Zero is valid.
- CRUD still `await globalState.update`. Last write wins across windows.
- Delete bot drops its snapshots with the record.
- Detach removes that item from the form / record. **Does not** delete the disk file. Agent detach → 0 agent items.

`bots/create` `draft` and `bots/update` `patch` send the **full** attachments list from the form (`BotAttachment[]` with `kind`). Host does **not** merge with disk files.

Duplicate `path` **in the same kind**: ignore the second pick (no second row). Same path in **two kinds** is allowed (two snapshots, two kinds).

Form draft (unsaved) lives in host memory for that panel only. Reload of VS Code drops an unsaved form, same as today.

**Migration (old IE records without `kind`):** still valid extras. TokenGovernor still includes them. Pack label is `{name} ({path})` with **no** kind tag. They do **not** occupy the Agent 0..1 slot. Host does **not** infer a kind from filename. Do not invent a seventh slot. Edit form must **echo them back** on Save or they drop (same full-list replace as today). Chrome may show them as detachable filename+path rows without a slot heading until the user detaches. Do not auto-assign Skills/Agent/etc.

---

## 3. Agent-slot map (host parse, no Copilot)

**Trigger is the Agent slot**, not basename.

- Only `kind: 'agent'` maps name/handle/persona.
- `AGENTS.md` / `SKILL.md` / `AGENT.md` in Skills (or any other slot) **never** maps.
- If Agent slot is empty, no map. Create still auto-derives handle from Name on Save when handle is empty, same as today.
- Default New Bot persona is the placeholder `A thoughtful teammate who talks like a person.` That placeholder **counts as empty** for map (`isUnfilledAttachField`). Do **not** require wiping the field to `''`. User-edited persona is filled and must not be overwritten. Mapping only runs when an Agent file is present.
- A `.md` attached under Scripts has `kind: 'scripts'` and does **not** map.

Host parse, **no `sendRequest`**:

1. YAML frontmatter between leading `---` fences. Keys (case-insensitive): `name`, `handle`, `persona`, `description`.
2. Else first ATX `H1` (`# `) → `name`. Remaining markdown body → `persona`.
3. Map targets: `name` ← `name` / H1. `handle` ← `handle` (trim, lower-case). `persona` ← `persona` else `description` else body after frontmatter/H1.
4. Apply a field **only if it is currently empty** on the form. Never overwrite. Replace Agent: same empty-only rule from the **new** file. Filled fields stay. Do not map `role` or `instructions`.
5. Handle still BR-2: `[a-z0-9][a-z0-9_-]{0,31}`. If the mapped handle is invalid **or** collides (case-insensitive) with another bot, leave it on the form and fail **Save** with the existing validation copy (`@{handle} is already taken.` / pattern copy). **No Copilot.**

---

## 4. Picker and skip

Host owns `vscode.window.showOpenDialog`:

- `canSelectFiles: true`, `canSelectFolders: false`
- `defaultUri` = workspace folder
- **Agent:** `canSelectMany: false`. Filters: Markdown / text → `md`, `txt`, `markdown`. If a row exists, the next pick **replaces** it.
- **Skills / Instructions / Prompts:** `canSelectMany: true`. Same markdown/text filters.
- **Scripts / Hooks:** `canSelectMany: true`. Filters: markdown/text **and** `py`, `js`, `ts`, `sh`, `bash`, `zsh`, `ps1` (not py/js/sh only).
- Title may be slot-specific (`Attach skills`, etc.).

No folder open: do not open the dialog. Chrome disables the slot buttons and shows `Open a folder to attach files.`

Per selected URI, **in order**:

| Gate | Skip `reason` | `message` (exact) |
| --- | --- | --- |
| Not under the open workspace folder | `outside-workspace` | `Skipped {name} · Not in this workspace.` |
| `fs.stat` size **or** byte length **> 262144** | `too-large` | `Skipped {name} · too large` |
| NUL in the first 8 KiB, or UTF-8 decode fails | `binary` | `Skipped {name} · Binary file.` |
| Read throws / unreadable | `unreadable` | `Skipped {name} · Can't read this file.` |

Huge-file copy is exactly **`too large`** (not “Too large”, not a KiB figure).

Skip that file, emit `bots/attach-skipped { slot, ... }`, **continue**. Do not fail the rest of the pick or Save. Skips are notices, not stored on `BotRecord`. Duplicate path in the same slot: ignore.

Kind **is the slot**. A `.md` under Scripts stays a Script. Picker filters only; host does not reclassify after pick.

`bots/attach-remove { slot, path }` drops that draft/record item. No disk delete. Agent detach → 0 agent items.

---

## 5. TokenGovernor extras (IE-2 + TA-4)

Minimum pack **unchanged** (QC-2/QC-3): prompt + board + (LSP slice on debate/@ **OR** implementer file(s)) + tab paths.

**New extra**, same family as current-turn MCP reads:

- Include **only** when packing **this** bot’s `propose` / `critique` / `direct` / `implement` turn.
- Other bots in the same run do **not** see this bot’s snapshots.
- Vote / Split / Stop / consensus: **no** attachment extras.
- Source of truth is `BotRecord.attachments[].snapshot`, **not** a file read.
- Never execute the snapshot.

Pack shape (host-built, not bot-authored markdown chrome). **Label includes kind:**

```
Attached files
{name} ({path}) · {kind}
{snapshot}
```

For migrated items missing `kind`, omit the `· {kind}` part.

Trim order on overflow: extras first. Attachment snapshots trim **after** MCP payload size, **before** any minimum-pack field. Drop from the **end** of the attachments list until the pack fits, or drop all extras. **Silent.** No `bots/attach-skipped`, no Swarm skip row, no token chrome. Composer enabled.

If extras are gone and the **minimum pack** still misses `maxInputTokens`: existing QC-3 `error` `code: 'pack-overflow'`. No `sendRequest`. Composer enabled.

---

## 6. Protocol (replace untyped ports)

Do **not** remove other `bots/*`. **Replace** the untyped attach ports. Do not keep a no-slot `bots/attach-pick` as current. Old untyped dialect is **replaced**.

```ts
type AttachmentKind = 'agent' | 'skills' | 'scripts' | 'instructions' | 'prompts' | 'hooks';
type AttachSkipReason = 'unreadable' | 'binary' | 'too-large' | 'outside-workspace';

type HostToUi = /* existing */
  | { type: 'bots/attach-added'; slot: AttachmentKind; files: { path: string; name: string }[] }
  | { type: 'bots/attach-skipped'; slot: AttachmentKind; name: string; reason: AttachSkipReason; message: string }
  | { type: 'bots/attach-mapped'; name?: string; handle?: string; persona?: string };

type UiToHost = /* existing */
  | { type: 'bots/attach-pick'; slot: AttachmentKind }
  | { type: 'bots/attach-remove'; slot: AttachmentKind; path: string };
```

`bots/create` `draft` and `bots/update` `patch` attachments: `BotAttachment[]` with `kind`. **Agent kind length 0 or 1, never required.** Chrome persist shape `[{ slot, path, snapshot }]` is the same six id values as `kind`.

`slot` / `kind` enum: `'agent' | 'skills' | 'scripts' | 'instructions' | 'prompts' | 'hooks'`.
Ports use `slot`. Persisted field is `kind` and **equals** the slot the user picked.

`bots/attach-mapped` carries only fields the host actually filled (empty-only). UI applies the same empty-only rule as defense in depth. Applied only if that field is empty.

UI **never** reads disk. UI **never** sends snapshot bytes it invented. Host reads, snapshots, and returns labels. Host never starts a hooks runner from this chrome.

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

No Copilot call on skip or validation. Huge-file copy is exactly **`too large`**.

---

## 8. Out of this slice

Single undifferentiated Attach button, fourth view, remote/catalog/GitHub import, bulk swarm wizard, hooks execute/run / hooks-runner, global skill install copy, token/install MCP chrome, skip banner for TokenGovernor trims, overwriting filled name/handle/persona, treating path as a live file, inferring kind from filename, requiring an Agent file, a second runtime, any model other than `vscode.lm`, live path re-read at Send, CLAUDE.md-as-vendor special case, Graphify, leftovers 002/003/009/014, pack/HV/MA/SD changes, BR-6 / Grain B changes.

---

## 9. Tests (docs only — list them, do not write vitest)

Merge bar after PO allocates, on a **new product PR**:

- Save with empty Agent succeeds; bot record has zero `kind: 'agent'`.
- Agent second pick replaces; still 0 or 1 agent.
- `.md` attached under Scripts has `kind: 'scripts'` and does **not** map name/handle/persona.
- `AGENTS.md` under Skills does **not** map.
- Agent slot maps empty name/handle/persona only; filled fields stay; replace remaps empty only.
- Default persona placeholder (`A thoughtful teammate who talks like a person.`) counts as empty for map; do not require wiping to `''`; user-edited persona is not overwritten.
- Ports always carry `slot`.
- Filters: Agent picker does not list `.py`; Scripts picker lists `.md` and `.py`.
- File of 262145 bytes: skip message ends with `too large`; other files in the same pick still attach; no Copilot.
- Scripts/hooks snapshots never spawn / never eval / no hooks-runner.
- TokenGovernor: extras on that bot only; pack label includes kind; trim silent; other bots omit them; vote omits them; minimum-pack miss still `pack-overflow`.
- Missing `kind` on old records still packs; does not count as Agent; host does not infer kind.
- Handle collision on Save: validation, no Copilot.
- Settings Sync still not called. WM / QC / HV / MA / SD tests conceptually still pass (this slice does not change them).
- Attach a workspace file under 256 KiB: snapshot stored on the record; `path` is the relative label; Send does not `fs.readFile` that path.
- Binary / unreadable / outside workspace: matching skip copy; pick continues.
- `attachments` missing on old records reads as `[]`.
