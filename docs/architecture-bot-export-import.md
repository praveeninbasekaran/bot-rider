# Bot Rider — F6 bot export / import (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR, QC, HV, MA, SD, TA, MS, or SI. **Not** F7 parallel / Event Bus.
Stories: **EX-1–4 is the full story set.** **EX-1** Export single / multi / (chrome: Export All) as JSON or YAML. Payload: name, handle, persona, role, system instructions (`instructions`), active, modelId, typed attachments (kind + path label + text snapshot). **Not** SI session / transcript / MCP pending / `id` / `createdAt` / `updatedAt`. **EX-2** Import via file picker; create local BR-3 bots (new id, new timestamps). File = one bot object **or** a list. Multi-import: per-bot continue. **EX-3** Handle collision: user picks Skip or Rename. Never overwrite. Never auto-suffix silently. Cancel rename = Skip. Copy exact: `Skipped @{handle} · already taken.` Name-only copy exact: `Skipped "{name}" · a bot with that name already exists.` Prefer the handle line when both collide. Multi: resolve per entry then continue. **EX-4** Never execute scripts/hooks. No API keys. No Marketplace. No hosted sync. F7 parallel Event Bus **out**. No Copilot on export/import.
UI chrome contract: `ui-ux-spec.md` §23 (addendum `ui-ux-bot-export-import.md`).
Date: 2026-09-01.
Parent: `architecture-mvp.md`. Copilot stays `vscode.lm`. ₹0 extra keys. No second runtime. Interchange is a user-chosen file, not BR-3 `globalState` and not Settings Sync.

Split (when PO allocates; **do not allocate in this docs PR**): **Developer 1** host (serialize/parse, collision UX wiring, store create via existing BR-3 create path). **Developer 2** §23 chrome (commands, tree `canSelectMany`, form Export, welcome Import link). QA after both, on a **new product PR**, not stacked on this docs PR.

---

## Story map (EX-1–4)

EX-1–4 stay the set. No new stories.

### EX-1 Export

Export single / multi / (chrome: Export All) as JSON or YAML. Payload fields: `name`, `handle`, `persona`, `role`, `instructions`, `active`, `modelId`, typed attachments with `kind` + path label + text snapshot. **Not** SI session / transcript / MCP pending / `id` / `createdAt` / `updatedAt` (those are host-local). `colorIndex`: **omit** from the interchange schema; new bots get next color on create like BR.

### EX-2 Import

Import via file picker; create local BR-3 bots (new `id`, new timestamps). File = one bot object **or** a list. Multi-import: per-bot continue.

### EX-3 Handle collision

User picks **Skip** or **Rename**. Never overwrite. Never auto-suffix silently. Cancel rename = Skip. Copy exact: `Skipped @{handle} · already taken.` Name-only copy exact: `Skipped "{name}" · a bot with that name already exists.` Prefer the handle line when both collide. Multi: resolve per entry then continue.

### EX-4 Safety

Never execute scripts/hooks. No API keys. No Marketplace. No hosted sync. F7 parallel Event Bus **out**. No Copilot on export/import.

---

## 0. Non-negotiables (PO + EX-1–4 + §23)

- **(EX-1)** Interchange payload is persona + attachments only: `name`, `handle`, `persona`, `role`, `instructions`, `active`, optional `modelId`, optional `attachments[]`. **Omit** `id`, `createdAt`, `updatedAt`, `colorIndex`. **Omit** SI sessions, Swarm transcript, MCP pending actions, RunBoard, changeset.
- **(EX-1)** `colorIndex` is host-local. Do **not** write it to the file. On import, `BotRegistry.create` assigns next color the same way New Bot does today.
- **(EX-1)** Writer **always** emits the v1 envelope (even for one bot). Reader accepts envelope **and** convenience shapes (bare object / bare list) — §2.
- **(EX-1)** JSON and YAML both supported. Format QuickPick defaults to **JSON**. Filenames: `{handle}.bot.json|yaml` (single), `bots.export.json|yaml` (multi / Export All).
- **(EX-2)** Import creates **new** local bots through the existing BR-3 **create** path. New `id`, new `createdAt` / `updatedAt`. Do **not** bump `BotStoreFile.version`. Do **not** `update` an existing record as the import path.
- **(EX-2)** One file may hold one bot or many. After a skip / rename decision, **continue** the rest of the list. Do not abort the whole file because one entry collided.
- **(EX-3)** Collision = handle taken (case-insensitive) **or** name taken (case-insensitive). **Skip** or **Rename** only. **Never overwrite.** **Never** silent auto-suffix (`uniqueHandle` on create-from-name is **not** used for import). Cancel rename (Esc / dismiss) = **Skip**.
- **(EX-3)** Handle-skip copy is exact: `Skipped @{handle} · already taken.` Name-only skip copy is exact (§23): `Skipped "{name}" · a bot with that name already exists.` Prefer the handle line when both collide.
- **(EX-3)** Rename/create still run **BR-2**: unique handle / unique name, handle pattern `[a-z0-9][a-z0-9_-]{0,31}`. Invalid rename stays on the input until the user fixes it or cancels (cancel = Skip).
- **(EX-4)** **Never execute.** Snapshots / scripts / hooks / YAML tags never `spawn`, shell, tasks, eval, or a hooks-runner. YAML parse is **data-only** (safe load). No custom tags.
- **(EX-4)** No API keys in the file or the flow. No Marketplace. No hosted sync. Settings Sync stays off (`setKeysForSync` stays off).
- **(EX-4)** **No Copilot** (`selectChatModels` / `sendRequest`) on export or import. CRUD already never calls `lm`; this slice does not add a gesture that does.
- **(EX-4)** F7 parallel / Event Bus **out**. Sequential Debate unchanged. No Swarm chrome for export/import.
- Attachments: `kind` **is** the slot (`agent | skills | scripts | instructions | prompts | hooks`). `path` is a **label only**. Snapshot **text** travels. Never treat `path` as live authority. Never re-read disk from that path on import. Never execute the snapshot.
- `modelId`: `LanguageModelChat.id` only (label never in the file). On import, **keep** if that id is still in current Copilot discovery; else **unset** (host default). **Do not** block import (MS-3 spirit). Discovery for this check is host-internal if already cached; do **not** require a new user-facing Copilot call to complete import. If discovery is empty / unsigned-in, unset is allowed; import still succeeds.
- BR / QC / HV / MA / SD / TA / MS / SI frozen. Leftovers 002 / 003 / 009 / 014 out. Graphify out. Do **not** reopen §20 / §22.

---

## 1. Component

```
Export Bot | Export Selected | Export All | form Export
    dirty form (if Edit/New dirty) → "Save before export?"
         Save | Export without saving | Cancel
    QuickPick JSON (default) | YAML
    showSaveDialog
         single → {handle}.bot.json|yaml
         multi  → bots.export.json|yaml
    serialize envelope { format: 'botrider.bots.v1', bots: [...] }
         omit id, createdAt, updatedAt, colorIndex
         omit SI session, transcript, MCP pending
         attachments: { kind?, path, name, snapshot }  // path = label
    write UTF-8  →  toast Exported {n}.
    never execute · no Copilot · no API keys

Import (palette | title | welcome)
    showOpenDialog (JSON and YAML)
    parse JSON | safe YAML
    read paths:
         1. envelope format === botrider.bots.v1 → bots[]
         2. bare BotExportEntry object → [that]
         3. bare array of entries → that list
    per entry, continue:
         invalid handle/name/pattern → Skip | Rename (cancel = Skip)
         handle taken → Skip | Rename   copy: Skipped @{handle} · already taken.
         name taken (handle free) → Skip | Rename   copy: Skipped "{name}" · a bot with that name already exists.
         both collide → prefer handle line: Skipped @{handle} · already taken.
         never overwrite · never auto-suffix
         modelId: keep if in current copilot discovery else unset; do not block
         attachments: store snapshot + path label + kind; never execute; path not live
         BotRegistry.create(...)   // new id, timestamps, next colorIndex
    summary toast. No Copilot. No Marketplace. No hosted sync.
```

---

## 2. File schema (locked)

Writer **always** uses the envelope. `format` is required on write.

```ts
type AttachmentKind = 'agent' | 'skills' | 'scripts' | 'instructions' | 'prompts' | 'hooks';

type BotExportFileV1 = {
  format: 'botrider.bots.v1';
  bots: BotExportEntry[];
};

type BotExportEntry = {
  name: string;
  handle: string;
  persona: string;
  role: string;
  instructions: string;
  active: boolean;
  modelId?: string | null;
  attachments?: {
    kind?: AttachmentKind;
    path: string;   // label only — never a live URI
    name: string;
    snapshot: string; // UTF-8 text captured at attach/export time
  }[];
};
```

Unknown extra properties on read: **ignore** (forward compatible). Do not round-trip unknown fields.

### 2.1 Read paths

A file is JSON or YAML. After parse, accept **exactly** these shapes:

| Shape | How to detect | Bots |
| --- | --- | --- |
| Envelope | object with `format === 'botrider.bots.v1'` and `bots` an array | `bots` |
| Bare object | object with `name` + `handle`, **no** `format` key (or `format` absent) | `[object]` as one entry |
| Bare list | top-level array | each element as an entry |

Prefer envelope for any multi-bot file. Bare object is convenience for a single bot. Bare list is convenience for a hand-built list without `format`.

Reject the **file** (do not import any entry) when:

- `format` is present and is **not** `'botrider.bots.v1'`
- `format === 'botrider.bots.v1'` but `bots` is missing or not an array
- parse fails (invalid JSON / unsafe or invalid YAML)

Visible parse/reject copy: `Couldn't read this bot file.` Do not call Copilot.

Empty `bots: []`: toast nothing created; not an error.

### 2.2 Write rules (EX-1)

- Always `{ format: 'botrider.bots.v1', bots: BotExportEntry[] }`.
- One bot → envelope with `bots.length === 1` (not a bare object on write).
- Omit `id`, `createdAt`, `updatedAt`, `colorIndex`.
- Omit empty `modelId` / `null` (or write `null` — reader treats empty / omit / `null` the same).
- `attachments` omitted or `[]` when none. Do not invent kinds. Missing `kind` on a persisted item stays missing (TA migration rule); do not infer from filename.
- `path` is the stored label. Do not resolve or rewrite it against the current workspace.

YAML write: same object graph, UTF-8, no custom tags. Extension `.yaml` (read also accepts `.yml`).

### 2.3 Host-local fields — never in the file

| Field / store | Why |
| --- | --- |
| `id` | New on create |
| `createdAt` / `updatedAt` | New on create |
| `colorIndex` | Reassigned on create (next color like BR) |
| SI `BotSession` / isolation packets | Session-only; F7 isolation frozen |
| Swarm transcript / RunBoard | Session-only |
| MCP pending actions / changeset | Session-only |
| API keys | None exist; never add |

---

## 3. Export (EX-1)

Host-owned. Commands in §23. Native `showQuickPick` then `showSaveDialog`. Command and view ids are camelCase `botRider.bots.*` (locked chrome): `botRider.bots.export` / `exportSelected` / `exportAll` / `import`. Tree view `botRider.bots`. Context `botRider.hasBots`.

| Command (`botRider.*`, camelCase) | Source bots |
| --- | --- |
| `botRider.bots.export` | The context bot (tree item) |
| `botRider.bots.exportSelected` | Tree **selection** (`canSelectMany: true`), not the active checkboxes |
| `botRider.bots.exportAll` | Every bot in `BotRegistry.list()` |
| `botRider.bots.import` | File picker (no export set) |
| Form **Export** | Persisted bot after Save, or current form draft if Export without saving |

Selection is independent of `checkboxState` (active). Export Selected does **not** mean “active bots”.

Zero bots / empty selection: do not open the save dialog. Chrome hides or disables those commands (`when` in §23).

Default QuickPick item: **JSON**. Second: **YAML**. Cancel QuickPick = no export.

Save dialog default filename:

- One bot: `{handle}.bot.json` or `{handle}.bot.yaml`
- Two or more: `bots.export.json` or `bots.export.yaml`

Toast (exact): `Exported {n}.` with `{n}` the number of entries written.

### 3.1 Dirty form

Chrome (§23) owns the modal when New/Edit is dirty (or New never saved):

`Save before export?` → **Save** / **Export without saving** / **Cancel**

- **Save** — existing `bots/create` or `bots/update`, then export the persisted record.
- **Export without saving** — serialize current form fields (including unsaved attachments) to the file only. Do **not** persist. New Bot does **not** appear in the tree.
- **Cancel** — no file.

Invalid draft (BR-2) on Save or Export without saving: existing form validation; no file; no Copilot.

Clean Edit: export the persisted record; no modal.

---

## 4. Import (EX-2)

Host-owned `showOpenDialog`:

- `canSelectFiles: true`, `canSelectFolders: false`, `canSelectMany: false`
- Filters: JSON (`json`) and YAML (`yaml`, `yml`)
- Workspace **not** required (unlike §20 attach). User may import from anywhere they can pick. Cap is the file the user chose; host does not scrape GitHub / Marketplace.

Parse, then walk entries **in order**. Per entry: validate → collide? → Skip|Rename → `create` → continue.

`BotRegistry.create` stays the write path: new `id`, timestamps, `nextColorIndex()`, Settings Sync still off. Last write wins across windows, same as BR-3.

Do **not** call `uniqueHandle` to silently suffix. Import of a free handle uses the file handle as-is (after trim / lower-case, BR-2 pattern).

### 4.1 Per-entry gates (continue)

| Gate | User choice | Skip copy (exact) |
| --- | --- | --- |
| Handle taken (ci), including when name also taken | Skip \| Rename | `Skipped @{handle} · already taken.` (prefer this line when both collide) |
| Name taken, handle free (ci) | Skip \| Rename | `Skipped "{name}" · a bot with that name already exists.` |
| Invalid handle pattern | Skip \| Rename | existing BR-2 pattern copy (form-equivalent); if they Skip: do **not** use the handle-taken line — use `Skipped @{handle} · invalid handle.` |
| Empty name | Skip \| Rename | name-taken copy does not apply; use `Skipped · name is required.` |
| Cancel rename / dismiss | Skip | same skip copy as the gate that opened Rename |
| Parse-ok entry with extra junk fields | ignore extras; import | — |

Rename: native `showInputBox` for the colliding field(s) (handle and/or name). Empty submit is invalid (stay on the box) except cancel. New values re-check BR-2 uniqueness + pattern. Collision against a bot created **earlier in this same import** counts as taken.

Never `update` / overwrite the existing bot. Never delete it.

### 4.2 `modelId` (MS-3 spirit)

If the entry has a non-empty `modelId` and that `LanguageModelChat.id` is in the current Copilot-vendor discovery list, persist it. Else unset / omit (host default). **Do not** block the import. **Do not** fail the file. No fallback toast required on import (form/Swarm copy remains the MS-3 turn-time notice if they later run).

### 4.3 Attachments

Map into `BotAttachment[]` on the new record:

- `kind` kept if it is a known `AttachmentKind`; unknown kind → drop **that attachment**, still import the bot (continue). Missing `kind` → keep as untyped extra (TA migration: packs, does not occupy Agent 0..1).
- At most one `kind: 'agent'`; extra agent rows dropped, bot still imported.
- `path` stored as the label from the file. Do not `fs.readFile` it. File may not exist here.
- `snapshot` is the authority. Per-attachment cap **256 KiB (262144 bytes)** of snapshot text; over cap → skip **that attachment** with existing IE copy `Skipped {name} · too large`, continue the bot and the rest of the list.
- **Never execute** snapshot bytes.

Do not run Agent-slot map-from-file on import (the persona fields already travel on the entry). Attachments are extras only.

### 4.4 Summary

Per-skip: `showInformationMessage` with the exact skip line (non-blocking). Then continue.

End toast:

- All created, none skipped: `Imported {n}.`
- Mix: `Imported {n} · skipped {m}.`
- None created: `Imported 0 · skipped {m}.` (or only the skip lines if m>0 and n=0)

`{n}` / `{m}` are decimal counts of entries, not attachments.

---

## 5. Protocol (minimal)

Tree / palette / title Import and Export are **VS Code commands + native dialogs**. They do **not** need new Swarm `HostToUi` / `UiToHost` members. Do not invent Swarm chrome.

Form **Export** (footer) needs **one** additive UiToHost so the webview does not call `vscode.window` itself:

```ts
type UiToHost = /* existing */
  | {
      type: 'bots/export-self';
      /** Present when Export without saving (or New never persisted). Current form fields. */
      draft?: {
        name: string;
        handle: string;
        persona: string;
        role: string;
        instructions: string;
        active: boolean;
        modelId?: string | null;
        attachments?: {
          kind?: AttachmentKind;
          path: string;
          name: string;
          snapshot: string;
        }[];
      };
    };
```

- Dirty modal is **chrome** (form knows dirty). After the user picks Save, chrome posts existing create/update then `bots/export-self` without `draft` (host exports the persisted bot for this panel’s editing id). After Export without saving, chrome posts `bots/export-self` **with** `draft`. Cancel posts nothing.
- Clean Edit: chrome posts `bots/export-self` without `draft`.
- Host then runs the same QuickPick + save dialog as tree Export.
- **No new HostToUi** for this slice (dialogs are native). Do not add `bots/export-progress` / Swarm rows / a fourth sidebar.

Existing `bots/create` / `bots/update` / `bots/snapshot` unchanged. Import does not go through the form.

---

## 6. Copy

| Situation | Copy |
| --- | --- |
| Handle taken, user Skips (or cancel rename); also when both collide | `Skipped @{handle} · already taken.` |
| Name taken, handle free, user Skips | `Skipped "{name}" · a bot with that name already exists.` |
| Invalid handle, user Skips | `Skipped @{handle} · invalid handle.` |
| Empty name, user Skips | `Skipped · name is required.` |
| Attachment snapshot over 256 KiB | existing IE `Skipped {name} · too large` |
| Unreadable / invalid file | `Couldn't read this bot file.` |
| Dirty form | `Save before export?` (Save / Export without saving / Cancel) |
| Export done | `Exported {n}.` |
| Import done (see §4.4) | `Imported {n}.` / `Imported {n} · skipped {m}.` |

No Copilot call on skip, validation, export, or import.

---

## 7. Out of this slice

Overwrite / merge-into-existing bot, silent auto-suffix, exporting `id` / timestamps / `colorIndex` / SI sessions / transcripts / MCP pending, executing scripts or hooks, treating `path` as a live file, Marketplace / catalog / hosted sync / GitHub scrape, API keys, Copilot on export/import, F7 parallel / Event Bus / concurrent `sendRequest`, fourth sidebar, Swarm chrome, reopening §20 Attach slots or §22 model dropdown, Graphify, leftovers 002 / 003 / 009 / 014, BR / QC / HV / MA / SD / TA / MS / SI product rewrites, bumping `BotStoreFile.version`.

---

## 8. Tests (docs only — list them, do not write vitest)

Merge bar after PO allocates, on a **new product PR**:

- Writer emits `format: 'botrider.bots.v1'` envelope for one bot and for many.
- JSON and YAML round-trip the same entry fields. QuickPick default is JSON.
- Single filename `{handle}.bot.json|yaml`; multi `bots.export.json|yaml`.
- File omits `id`, `createdAt`, `updatedAt`, `colorIndex`, SI session, transcript, MCP pending.
- Reader accepts envelope, bare object, and bare list. Unknown `format` rejects the file (`Couldn't read this bot file.`).
- Import calls create: new `id`, new timestamps, next `colorIndex`; `BotStoreFile.version` unchanged.
- Handle taken → Skip copy exact `Skipped @{handle} · already taken.`; record unchanged (never overwrite).
- Rename then create under the new handle; cancel rename = Skip.
- Never auto-suffix on import (no `uniqueHandle` silent path).
- Name-only collision → Skip copy `Skipped "{name}" · a bot with that name already exists.`; both collide → prefer handle line; continue the list.
- Multi-import: skip one, import the next.
- `modelId` kept if still in Copilot discovery; else unset; import does not block; no Copilot `sendRequest`.
- Attachments: kind + path label + snapshot stored; path not `fs.readFile`’d; scripts/hooks never spawn / never eval / no hooks-runner.
- YAML safe-load only; no custom tag execution.
- Oversize snapshot: skip that attachment `too large`; bot still created.
- No API keys in payload. Settings Sync still off.
- Form Export: dirty modal three-way; Export without saving does not persist a New Bot.
- `bots/export-self` is the only new protocol member; no new HostToUi; no Swarm messages.
- Tree `canSelectMany` selection (not checkboxes) feeds Export Selected.
- WM / QC / HV / MA / SD / TA / MS / SI tests conceptually still pass (this slice does not change them).
