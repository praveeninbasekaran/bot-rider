# Bot Rider — F2 OpenSpec / contract traceability (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR, QC, HV, MA, SD, TA, MS, SI, or EX. **Not** F1 Graphify. **Not** F3 dashboard / F4 register. **Not** F7 parallel / Event Bus / concurrent `sendRequest`.
Stories: **OS-1–4 is the full story set.** **OS-1** Catalog: host reads workspace `openspec/` if present. Index-if-present. Never write or invent later-slice files at **runtime**. Missing `openspec/` = empty catalog, **no error**. Missing slice file = id absent, not an error. **OS-2** Cite: implementer file changes may include catalog spec ids. Unknown id **ignored, not a block**. No cite command. Never invent ids. Debate / `@` do **not** write cites. Cites on implementer changeset **only**. **OS-3** Review / §24: Proposed Changes **Files** rows show spec-id chips when cited. Chip text = catalog id as stored (`BR-6`, `EX-1`). Display only, **not click-to-filter**. No extra tooltip required. MCP Grain B rows **never** chips. Empty/missing `openspec/` = no chips, **no banner**. Not a fourth sidebar. Not Swarm. §20 / §22 / §23 / round headers / Split / Run board unchanged. Approve/Reject still whole-changeset BR-6. Unknown cited ids never appear as chips. **OS-4** Ingest: F7 isolation packets for implementer + bots with a remaining turn include matching spec **bodies verbatim** when ids are cited **or** the master prompt contains **exact** catalog ids (`BR-6`, `EX-1`), not fuzzy titles. Never lossy-summarize AC. Inactive bots no packets. Sequential unchanged. TokenGovernor: required spec bodies like published packets; QC-3 pack-overflow if they cannot fit; **no silent drop**.
UI chrome contract: `ui-ux-spec.md` §24 (addendum `ui-ux-openspec-chips.md`).
Date: 2026-09-02.
Parent: `architecture-mvp.md`. Isolation: `architecture-bot-isolation.md` (SI sequential + required packets). Pack: `architecture-token-save.md` (QC minimum pack unchanged except required published packets **and** required spec bodies must not be silently trimmed). Copilot stays `vscode.lm`. Sequential Debate unchanged. ₹0 extra keys. No second runtime.

Split (when PO allocates; **do not allocate in this docs PR**): **Developer 1** host (catalog read, cite filter, `specIds` on changeset preview, isolation ingest of spec bodies, TokenGovernor required-body rule). **Developer 2** §24 chrome (Files-only chips). QA after both, on a **new product PR**, not stacked on this docs PR.

---

## Story map (OS-1–4)

OS-1–4 stay the set. No new stories.

### OS-1 Catalog

Host reads workspace `openspec/` if present. Index-if-present. Never write or invent later-slice files at **runtime**. Missing `openspec/` = empty catalog, **no error**. Missing slice file = id absent, not an error.

### OS-2 Cite

Implementer file changes may include catalog spec ids. Unknown id **ignored, not a block**. No cite command. Never invent ids. Debate / `@` do **not** write cites. Cites on implementer changeset **only**.

### OS-3 Review / §24

Proposed Changes **Files** rows show spec-id chips when cited. Chip text = catalog id as stored (`BR-6`, `EX-1`). Display only, **not click-to-filter**. No extra tooltip required. MCP Grain B rows **never** chips. Empty/missing `openspec/` = no chips, **no banner**. Not a fourth sidebar. Not Swarm. §20 / §22 / §23 / round headers / Split / Run board unchanged. Approve/Reject still whole-changeset BR-6. Unknown cited ids never appear as chips (host already ignores them). Only catalog ids that survived OS-2 show.

### OS-4 Ingest

F7 isolation packets for implementer + bots with a remaining turn include matching spec **bodies verbatim** when ids are cited **or** the master prompt contains **exact** catalog ids (`BR-6`, `EX-1`), not fuzzy titles. Never lossy-summarize AC. Inactive bots no packets. Sequential unchanged. TokenGovernor: required spec bodies like published packets; QC-3 pack-overflow if they cannot fit; **no silent drop**.

---

## 0. Non-negotiables

- **(OS-1)** Catalog is **read-only** from the opened workspace folder. Path: `openspec/` at the workspace root (same folder as BR `no-workspace`). If that directory is absent, catalog is **empty**. **No error.** **No banner.** **No invent.**
- **(OS-1)** Index-if-present: build the catalog from `openspec/specs.md` when that file exists. Id column = catalog id **as stored** (`BR-6`, `EX-1`). Spec column = relative path to `openspec/specs/<slug>/spec.md`. If `openspec/` exists but `specs.md` is missing, catalog is empty (no error; do **not** invent ids by scanning directories).
- **(OS-1)** For each index row, if the linked `spec.md` is missing or unreadable, that **id is absent** from the catalog. Not an error. Do not keep a hollow id.
- **(OS-1)** Host SHALL NOT write, create, or rewrite files under `openspec/` at **runtime**. SHALL NOT invent later-slice ids or spec bodies. Docs/catalog files in this repo are authored in git, not by the running extension.
- **(OS-1)** Ids match the stored strings in the index (and matching docs): `BR-1`…`BR-6`, `WM-1`, `MA-1`, `QC-1`, `HV-1`, `IE-1`, `TA-1`, `SD-1`, `MS-1`, `SI-1`, `EX-1`. Do **not** invent F3 / F4 / F1 / F7-parallel catalog rows.
- **(OS-2)** No Cite command, no Cite picker, no Swarm cite chrome. Host **never invents** ids.
- **(OS-2)** Cites attach to **implementer changeset files only**. Debate / `@` / vote / Split SHALL NOT write cites. PatchParser still drops file bodies on debate/@.
- **(OS-2)** Unknown cited ids are **ignored**, not a parse/validate block, not `parse-failed` / `validate-failed`.
- **(OS-3)** Chips are Proposed Changes **Files** rows only. MCP Grain B rows **never** chips. Not a fourth sidebar. Not Swarm. Do **not** reopen §20 / §22 / §23. Round headers, Split, Run board unchanged. Approve/Reject still whole-changeset BR-6.
- **(OS-3)** Chip text = catalog id as stored. Display only. **Not click-to-filter.** No extra tooltip required. Unknown ids **never** appear as chips.
- **(OS-3)** Empty / missing `openspec/` → no chips, **no banner**.
- **(OS-4)** Spec **bodies** (full `spec.md` text) ingest **verbatim** into F7 isolation packets for the implementer and bots with a remaining turn in this sequential run. Never lossy-summarize acceptance criteria. Inactive bots: no packets. Sequential orchestrator unchanged.
- **(OS-4)** Match is **exact catalog id as stored** (`BR-6`, `EX-1`), not fuzzy titles. Trigger: cited ids that survived OS-2 **or** the master prompt (`userText` of this Send) contains those exact ids.
- **(OS-4)** TokenGovernor: required spec bodies join **required published packets** (not silent extras). If they cannot fit with the QC minimum pack → existing QC-3 `error` `code: 'pack-overflow'`, no `sendRequest`, **no silent drop**. Attachment / MCP extras still trim silent first.
- BR / QC / HV / MA / SD / TA / MS / SI / EX frozen otherwise. Leftovers 002 / 003 / 009 / 014 out. Graphify out. Marketplace / API keys / Settings Sync out. Specs are **not** executed as code.

---

## 1. Component

```
Workspace folder open / Send / implementer parse
  OpenSpecCatalog.load(workspace/openspec)
    missing openspec/            → empty catalog, no error, no banner
    missing openspec/specs.md    → empty catalog, no error
    row in specs.md, missing spec.md → that id absent (not an error)
    never write openspec/ at runtime
    never invent ids or bodies

Implementer files[] (only)
  collect candidate ids from optional specIds[] + exact catalog-id tokens in content
  keep ids that exist in catalog; drop unknown (not a block)
  debate / @ / vote / Split: specIds empty; do not write cites

changeset/preview
  ProposedFileDto.specIds? = surviving catalog ids (as stored)
  Files rows: §24 chips from specIds
  MCP Grain B rows: never chips

Isolation publish (SI-2 moments; OS-4 bodies)
  match ids = cited surviving ids ∪ exact catalog ids in this Send userText
  packet.specs[] = { id, body } verbatim spec.md for each match
  enqueue for remaining-turn bots + implementer
  NOT inactive; NOT fan-out to everyone
  NEVER lossy-summarize AC

Next pack (sequential)
  required = QC min pack + required SI packets + required spec bodies (OS-4)
  TokenGovernor: trim silent extras first
  required spec bodies stay; if they miss → pack-overflow; no Copilot call
```

---

## 2. Catalog (OS-1)

Session cache allowed. Re-read on folder change / reload / next Send. Never persist the catalog to `globalState` / BR-3.

```ts
type OpenSpecEntry = {
  id: string;      // as stored in specs.md (BR-6, EX-1)
  body: string;    // full spec.md text, verbatim
};

type OpenSpecCatalog = {
  entries: OpenSpecEntry[]; // empty if openspec/ or specs.md missing
};
```

Index parse: markdown table in `openspec/specs.md`. First column is the id as stored. Spec link target is the `spec.md` path relative to `openspec/`. Trim cells. Ignore header / separator rows. Duplicate ids: first row wins; later duplicates are absent (not an error).

Do **not** execute spec markdown. Do **not** treat specs as code, skills, or hooks.

---

## 3. Cite (OS-2)

Implementer JSON `files[]` (BR-6) may carry optional `specIds: string[]` on a file object. Host also collects **exact** catalog ids that appear as whole tokens in that file’s `content` (id as stored; not a title match; `BR-6` does not match `BR-60`).

Union per file, then **filter to catalog**. Unknown ids dropped. Empty `specIds` after filter is fine.

Debate / `@` / vote / Split: no `specIds` on any host DTO. Language-only sanitize unchanged.

No Cite command. Host never invents an id that is not in the catalog and not in the implementer file.

Store surviving ids on the pending `ChangeFile` and emit them on `changeset/preview`:

```ts
// additive on ProposedFileDto / ChangeFile — omit when empty
specIds?: string[]; // catalog ids as stored, surviving OS-2, stable catalog-index order, deduped
```

Missing / empty `specIds` = no chips for that row.

---

## 4. Review chrome (OS-3) — protocol

No new HostToUi / UiToHost message types. Additive field only:

`changeset/preview { files: ProposedFileDto[] }` where each file may include `specIds`.

No UiToHost for chips (display only, not click-to-filter). Clicking a Files row still Open Diff (`botrider.review.openDiff`). Approve / Reject / Retry stay BR-6 whole-changeset.

MCP `mcp/actions-preview` is unchanged. MCP rows **never** grow `specIds` and **never** show chips.

Empty catalog: omit `specIds` (or `[]`). UI shows no chips and **no** empty-catalog banner.

Chrome contract: [ui-ux-openspec-chips.md](./ui-ux-openspec-chips.md) §24.

---

## 5. Isolation ingest (OS-4)

Match set for this run / Send:

1. Surviving cited ids on the pending implementer changeset (OS-2), **or**
2. Exact catalog ids (as stored) that appear as whole tokens in the master prompt (`userText`)

Not fuzzy titles. Not “gated workspace” → `BR-6`.

For each matched id, copy `spec.md` **body verbatim** onto the isolation packet (new `specs` field; do **not** stuff a summary into `requirements`). Never lossy-summarize acceptance criteria.

```ts
type IsolationPacket = {
  id: string;
  fromBotId?: string;
  at: 'turn-end' | 'consensus' | 'pick';
  requirements: string[];
  decisions: string[];
  constraints: string[];
  openQuestions: string[];
  specs?: { id: string; body: string }[]; // OS-4; omit when empty
};
```

Downstream unchanged from SI-2: bots with a remaining turn in this sequential run (including prior speakers who will speak again) + implementer. **Not inactive. Not fan-out to everyone.**

Publish moments stay SI-2. Sequential orchestrator unchanged (SI-3). Visible Swarm stays HV. No Swarm rows for spec packets.

---

## 6. Pack / TokenGovernor (OS-4 + SI-4 + QC)

Minimum pack unchanged from QC-2 / SI-4 except: ingested **required spec bodies** for this turn join the required set with required published isolation packets (not silent-trim extras).

Trim order on overflow:

1. Silent extras (MCP payload size, attachment extras, vote compact) — unchanged
2. Never silently drop required isolation packets, **required spec bodies**, board / slice / implementer files / tab paths / prompt
3. If still over → pack-overflow (QC-3); no Copilot call (`sendRequest`)

QC-3 location lock unchanged: visible Swarm thread `error` `code: 'pack-overflow'`, no `sendRequest`, no silent retry, composer stays enabled.

---

## 7. Out of this slice

F3 dashboard, F4 register, F1 Graphify, F7 Event Bus / parallel / concurrent `sendRequest`, leftovers 002 / 003 / 009 / 014, Marketplace, API keys, Settings Sync, executing specs as code, cite command / cite picker, click-to-filter chips, Swarm / Run-board / MCP chips, empty-catalog banner, fourth sidebar, reopening §20 / §22 / §23, rewriting BR-1–6 spec files, inventing F3/F4/F1/F7-parallel catalog specs, product code in this docs PR.

---

## 8. Tests (docs only — list them, do not write vitest)

Merge bar after PO allocates, on a **new product PR**:

- Missing `openspec/` → empty catalog, no error, no banner, no chips. (OS-1, OS-3)
- `openspec/` present, `specs.md` missing → empty catalog, no error. (OS-1)
- Index row whose `spec.md` is missing → that id absent; other rows still load. (OS-1)
- Host does not write `openspec/` at runtime. (OS-1)
- Implementer `specIds` / exact id in file content: catalog id survives; unknown id dropped; parse still succeeds. (OS-2)
- Debate / `@` changeset (if any) has no cites. (OS-2)
- Files row with surviving ids shows chips with catalog id as stored (`BR-6`, `EX-1`). (OS-3)
- Unknown ids never appear as chips. (OS-3)
- MCP Grain B rows never chips. (OS-3)
- Chip click is not filter; row click still Open Diff. Approve still whole-changeset. (OS-3)
- Master prompt containing exact `EX-1` ingests that spec body verbatim into remaining-turn + implementer packets. Fuzzy title does not. (OS-4)
- Inactive bots do not receive spec-body packets. (OS-4)
- Required spec bodies that cannot fit → pack-overflow; no Copilot call; no silent drop. (OS-4)
- Attachment extras still trim silent. (OS-4)
- Sequential: no overlapping `sendRequest`. (SI-3)
- WM / QC / HV / MA / SD / TA / MS / SI / EX tests conceptually still pass.
