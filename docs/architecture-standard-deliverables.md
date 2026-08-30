# Bot Rider — Standard deliverables (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR-1–BR-6, QC, HV, MA, or IE.
Stories: **SD-1** Swarm ask when format or outline is missing, **SD-2** one primary real file (keyword inference only when a format is named), **SD-3** host-built Office/HTML from board + MCP + decisions, **SD-4** Proposed Changes open (HTML preview / Office inspect).
UI chrome contract: `ui-ux-spec.md` §21 (addendum `ui-ux-deliverables.md`).
Date: 2026-08-30.
Parent: `architecture-mvp.md`. Files still BR-6. MCP still Grain B (`architecture-mcp-actions.md`). IE snapshots (`architecture-bot-attachments.md`) are template **only** if that bot already has one. HV voice unchanged.
Additive. **Copilot stays `vscode.lm`.** No extra keys. No second runtime.

Split (when PO allocates): **Developer 1** host (format detect, Swarm ask, `DeliverableBuilder`, changeset bytes, inspect/preview emit). **Developer 2** §21 Proposed Changes consume (HTML preview, Office inspect line). QA after both.

---

## 0. Non-negotiables (PO + SD-1–4 + §21)

- **Generic**, not a PMO bot. No Bot Rider stock template pack. No gallery.
- Real **`.docx` / `.xlsx` / `.pptx` / `.html`** in the workspace **after BR-6 Approve**. Not markdown renamed. Not `.md` with a fake extension. **No macros.**
- **Curate** from Run board + **current-turn MCP** + host **decisions**. **Not** the Swarm transcript.
- **Infer format from keywords only when they named a format** (Word / Excel / PowerPoint / HTML, or `.docx` `.xlsx` `.pptx` `.html`). Bare **“report” does NOT default to html.**
- **SD-1:** if **format** or **required content / outline** is missing → a bot **asks in Swarm** (HV paragraphs). Composer **stays enabled**. Skip that ask if the task already named **both**. No picker, no modal, no wizard.
- **Split composer lock still wins.** SD ask only when composer is otherwise enabled.
- Until format is known: **do not stage** any deliverable create (not html, not Office).
- **One primary file per run** unless they asked for several formats.
- **Same create path** as other files: Files section, BR-6 Approve / Reject. **No new gate.** MCP stays Grain B and separate.
- **No email.** No fourth view. No token chrome. No pre-Send gate.
- IE snapshot as template **only** if that implementer bot **already** has an attached snapshot that matches the chosen format (HTML text snapshot). Office is a **generic valid file** from the host builder, not a vendored template.
- After Approve, the real file is on disk; OS / VS Code default open applies.
- Additive. **BR / QC / HV / MA / IE frozen.** Leftovers 002/003/009/014 out. Graphify out.

---

## 1. Component

```
Send (goal text + board)
    host FormatSpec = detect(goal, board)
    format missing OR outline missing
        → no implementer, no deliverable create
        → one HV Swarm ask (Word / Excel / PowerPoint / HTML + required content)
        → composer enabled; next chat/send is the answer (same freeze)
        → re-detect; if still missing, ask once more then stop implementer (no silent html)
    format + outline known
        → implementer JSON (path + outline facts, NOT zip bytes)
        → DeliverableBuilder → real bytes / HTML text
        → ChangesetStore create (same BR-6)
        → changeset/preview with real extension + optional kind

html Open  → proposed HTML preview ({filename} (Proposed))
Office Open → inspect line; NEVER vscode.diff on zip/XML
Approve     → applyEdit createFile (binary or UTF-8)  [existing BR-6]
```

---

## 2. Format and outline (SD-1, SD-2)

Host-owned. **No Copilot call** just to guess the format.

**Named format** (any one is enough):

| User said | Format |
| --- | --- |
| `docx`, `word`, `.docx` | `docx` |
| `xlsx`, `excel`, `spreadsheet`, `.xlsx` | `xlsx` |
| `pptx`, `powerpoint`, `ppt`, `.pptx` | `pptx` |
| `html`, `webpage`, `.html` | `html` |

**Not a format:** `report`, `document`, `deck`, `slides`, `plan`, `summary` alone. Those stay **missing format** → Swarm ask. **Never** map `report` → html.

**Outline / required content** is present when the Send (or the user’s Swarm answer) names what belongs in the file (sections, sheet, slides, or an explicit “include X”). A bare “make a Word file” is format **without** outline → still ask.

**Ask copy** is HV conversational, host-instructed, not a picker:

> Which format should I write — Word, Excel, PowerPoint, or HTML — and what has to be in it?

Skip the ask when **both** format and outline are already in the task. Keyword inference runs **only** after a format is named (in the original Send **or** in the answer).

**One primary:** if several formats were not asked for, the host keeps **one** deliverable create (the named format). Extra Office/HTML creates in the same implementer JSON are dropped. If they asked for more than one format, one create per named format.

---

## 3. Swarm ask (no new protocol type)

Not a modal. Not `ui/pick`. Composer **enabled** for the ask only when it is **otherwise enabled**. `deliverableAsk` does **not** override Split lock. Do **not** unlock composer during Split to ask format/outline.

**During Split:** do not ask format/outline and do not implement a deliverable. Split composer lock still wins.

**After Continue/Pick/Stop:** if composer is enabled and format/outline still missing, then ask.

**After consensus with no Split:** composer is enabled so the ask may run before implementer.

After debate/consensus/pick (and Split resolved, if any), **before** implementer:

1. If this run is producing a standard deliverable, composer is otherwise enabled, and format or outline is missing: **do not** start implementer. Emit a visible HV ask turn (host-authored instruction; the speaking bot’s article is the question). Set `deliverableAsk: true` on the run.
2. Next `chat/send` is the **answer**, same freeze, **not** a new debate. Re-run detect. If both are now present → implementer. If still missing → one more ask, then **stop** (no create, no silent html).
3. Stop still cancels. Split still has no implementer until pick/continue as today.
4. Vote / Split / Stop never build a deliverable.

No extra Copilot “format classifier” call. Detect is host string match.

---

## 4. Implementer JSON and builder (SD-3)

Implementer stays JSON. It does **not** emit zip/XML or base64 of a PPTX.

```ts
type DeliverableFormat = 'docx' | 'xlsx' | 'pptx' | 'html';

type DeliverableSpec = {
  format: DeliverableFormat;
  path: string;          // workspace-relative, MUST include the real extension
  title: string;
  outline: string[];     // sections / sheet names / slide titles
  facts?: string[];      // curated one-liners from board + MCP + decisions
};
```

Host **curates** `facts` from `RunBoard` (goal, todos, decisions) + current-turn MCP notes. **Do not** restuff the transcript.

`DeliverableBuilder.build(spec, template?)` returns:

| Format | Bytes | Changeset |
| --- | --- | --- |
| `html` | UTF-8 HTML5 | `op: 'create'`, `content` text |
| `docx` / `xlsx` / `pptx` | valid OOXML zip, **no** `vbaProject.bin`, **no** macros | `op: 'create'`, binary payload (see §5) |

**Generic valid file:** minimal well-formed Office package the OS will open. **No** Bot Rider letterhead/stock deck.

**IE template:** if the implementer bot already has an attachment whose `path`/`name` is `.html` (or snapshot looks like HTML) **and** format is `html`, use that snapshot as the starting document and merge outline/facts. Office formats: **ignore** text snapshots as zip templates (IE skipped binaries). Do not fetch a file from disk at Send.

**Not markdown renamed:** a `.docx` path whose payload is `# heading` markdown is a **FAIL**. Builder output must parse as OOXML / HTML.

---

## 5. Changeset (same BR-6)

Extend the pending file (additive, text files unchanged):

```ts
type ChangeFile = {
  path: string;
  op: 'create' | 'update' | 'delete';
  content?: string;          // UTF-8 text (html + existing code files)
  binary?: Uint8Array;       // Office creates only
  kind?: 'html-preview' | 'office-binary' | 'text';
};
```

If `kind` is omitted, infer from extension: `.html` → `html-preview`; `.docx|.xlsx|.pptx` → `office-binary`; else `text`.

MVP is **creates**. Do not invent Office updates in this slice.

`changeset/preview` **must** send `path` with the real extension. Optional `kind` so the tree can choose Open.

Approve: existing `applyEdit` / `createFile`. For `office-binary`, write **bytes**, not a UTF-8 mis-decode. Reject discards the pending create. **No second Approve.**

MCP Approve is still independent (Grain B). Deliverable files are **not** MCP actions.

---

## 6. Open (SD-4 + §21.2)

| Kind | Host on `review/open-diff` |
| --- | --- |
| `html-preview` | Open readonly preview webview. Title `{filename} (Proposed)`. Default click is preview, not a tag wall. Native text diff is allowed only if the user opens it from the tab. |
| `office-binary` | **Never** `vscode.diff`. Show inspect: `{filename} · new {Word\|Excel\|PowerPoint} file`. |
| `text` | Today’s `vscode.diff`. |

After Approve, do not keep the inspect/preview as the file view; disk file uses the normal editor / OS open.

---

## 7. Protocol (additive)

Do **not** remove `changeset/preview` fields. **Do** add optional `kind` on each preview file:

```ts
type ChangePreviewKind = 'html-preview' | 'office-binary' | 'text';

// changeset/preview files[] gain:
{ path: string; op: 'create' | 'update' | 'delete'; kind?: ChangePreviewKind }
```

No new UiToHost for format pick. Swarm `chat/send` is the ask answer.

`run/state` may add `deliverableAsk?: boolean` so chrome keeps the composer enabled. If omitted, host must still leave composer unlocked during the ask.

---

## 8. Copy / inspect

| Situation | Copy |
| --- | --- |
| Swarm ask | HV question naming Word, Excel, PowerPoint, or HTML **and** required content |
| Office inspect | `{filename} · new Word file` / `new Excel file` / `new PowerPoint file` |
| HTML preview title | `{filename} (Proposed)` |
| Missing format after two asks | no create; no silent html |

---

## 9. Out of this slice

Silent `report`→html, stock template pack, PMO gallery, format picker/modal, email, fourth view, second Approve, `vscode.diff` on Office zip/XML, macros, markdown-as-Office, Graphify, leftovers 002/003/009/014, pack/HV/MA/IE product changes.

---

## 10. Tests (merge bar after PO allocates)

- Bare “write a report”: Swarm ask, **no** `.html` (or Office) create, composer enabled.
- “Word file of the Q3 plan with three sections”: no ask; one `*.docx` create; payload is OOXML zip, not markdown.
- “Excel and PowerPoint of the same plan”: two creates, real extensions; not a third html.
- Named HTML: `.html` create; Open is preview titled `{filename} (Proposed)`.
- Office Open does not call `vscode.diff`.
- `changeset/approve` writes bytes to disk; Reject drops the create; no extra MCP invoke.
- Implementer JSON has no zip bytes; builder is host-side; no `vbaProject.bin`.
- IE html snapshot used only when that bot already attached html and format is html.
- Detect has no `sendRequest`.
- Split-open → no deliverable ask, composer stays locked; after Split resolves and format still missing → Swarm ask with composer enabled.
- WM / QC / HV / MA / IE tests still pass.
