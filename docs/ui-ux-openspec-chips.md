# Bot Rider — UI/UX addendum: OpenSpec spec-id chips

Fold into `ui-ux-spec.md` as **§24**. Proposed Changes **Files** rows only. Do **not** reopen §20 Attach, §22 model picker, or §23 export/import. Not Swarm. Not a fourth sidebar.

Architecture: [architecture-openspec-trace.md](./architecture-openspec-trace.md). Additive. **OS-1–4 locked.** Chip text = catalog id as stored (`BR-6`, `EX-1`). Display only, **not click-to-filter**. Unknown ids never chips. MCP Grain B rows **never** chips. Empty/missing `openspec/` = no chips, **no banner**.

## 24. OpenSpec chips on Proposed Changes Files (F2)

**Status:** Additive after §23. **OS-3 locked** (chrome). Catalog / cite / ingest are host (OS-1, OS-2, OS-4). Not a fourth view. Not Swarm chrome. Not token chrome. Not F7 parallel. Not leftovers 002/003/009/014. Do **not** reopen §20 / §22 / §23.

### 24.1 Surfaces

Only Proposed Changes (`botrider.review`) **Files** rows (`proposedFile`).

| Surface | Chips |
| --- | --- |
| Files row (Modified / Added / Deleted) | Yes, when that file has surviving catalog `specIds` |
| MCP Grain B row | **Never** |
| Files / MCP section headers | Never |
| Swarm thread / round headers / Split / Run board | Never |
| Bots tree / bot form / §20 / §22 / §23 | Never |

Not a fourth sidebar. Approve / Reject / Retry stay BR-6 whole-changeset. MCP Approve / Reject stay Grain B.

### 24.2 Chip text and placement

Chip text = catalog id **as stored** (`BR-6`, `EX-1`). Do not rewrite to titles.

Files `TreeItem.description` stays `Added` / `Modified` / `Deleted`. When surviving ids exist, append ` · ` then the ids in catalog-index order, each separated by ` · `. Example: `Modified · BR-6 · EX-1`. Deduped. Omit the suffix when `specIds` is missing or empty.

Display only. **Not click-to-filter.** Chips are not their own tree items. Row click still Open Diff (`botrider.review.openDiff`). Closing a diff is still not Approve or Reject.

No extra tooltip required. Existing Open Diff / Added decoration may stay.

### 24.3 Unknown and empty catalog

Unknown cited ids **never** appear as chips (host already ignores them; only catalog ids that survived OS-2 are on `specIds`).

Missing `openspec/` or empty catalog: no chips, **no banner**, no welcome-line about OpenSpec. File groups and MCP section stay as today.

### 24.4 Host ↔ UI

- Host → UI: existing `changeset/preview { files }` with optional `specIds?: string[]` on each Files DTO (catalog ids as stored).
- UI → Host: none for chips. Do not invent a cite/filter message.
- UI never reads `openspec/` from disk. UI never calls `vscode.lm`.

### 24.5 Unchanged

§17 Run board. §18 article prose. §19 MCP Grain B (no chips on MCP rows). §20 Attach. §22 model picker. §23 export/import. Round headers. Split Continue / Pick / Stop. Composer. Approve/Reject still whole-changeset BR-6.

### 24.6 Out

Click-to-filter · extra required tooltip · MCP chips · Swarm chips · empty-catalog banner · Cite command / picker · fourth sidebar · F1 Graphify · F3 dashboard · F4 register · F7 parallel · leftovers 002/003/009/014 · reopening §20 / §22 / §23.
