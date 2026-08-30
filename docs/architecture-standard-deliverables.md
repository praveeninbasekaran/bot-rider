# Bot Rider — Standard deliverables (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR-1–BR-6, QC, HV, MA, or IE.
Stories: **SD-1–4 is the full story set.** **SD-1** Swarm ask when format or outline is missing, **SD-2** one primary real file (keyword inference only when a format is named), **SD-3** host-built Office/HTML from board + MCP + decisions, **SD-4** Proposed Changes open (HTML preview / Office inspect).
UI chrome contract: `ui-ux-spec.md` §21 (addendum `ui-ux-deliverables.md`). Chrome pointer remains §21.
Date: 2026-08-30.
Parent: `architecture-mvp.md`. Files still BR-6. MCP still Grain B (`architecture-mcp-actions.md`). IE-attached Office/HTML (`architecture-bot-attachments.md`) may be used as template **only** if that bot already has one. HV voice unchanged.
Additive. **Copilot stays `vscode.lm`.** No extra keys. No second runtime.

Split (when PO allocates): **Developer 1** host (format detect, Swarm ask, `DeliverableBuilder`, changeset bytes, inspect/preview emit). **Developer 2** §21 Proposed Changes consume (HTML preview, Office inspect line). QA after both.

---

## 0. Non-negotiables (PO + SD-1–4 + §21)

- **Generic**, not a PMO bot. **No stock template pack.** No gallery. No template picker/pack. **No email.**
- Real **`.docx` / `.xlsx` / `.pptx` / `.html`** in the workspace **after BR-6 Approve**. Not markdown renamed. Not `.md` with a fake extension. **No macros.**
- **Curate** from Run board + **current-turn MCP** + host **decisions**. **Not** the Swarm transcript.
- **Keyword inference only when they named a format:** `deck` → `pptx`; `spreadsheet` → `xlsx`; `word doc` / `word document` → `docx`; `html` → `html`. Bare **“report”** still asks. Bare **“document”** without Word still asks. **Never** map `report` → html.
- **Missing format OR only “report”:** Swarm HV question naming Word / Excel / PowerPoint / HTML. Composer enabled. **Not during Split;** Split still locks send if open. **SD ask only after Continue, or when there is no Split.** Split composer lock still wins. Composer **stays enabled** for the ask itself.
- **Missing outline:** ask what must be in the document; **do not invent sections.** Format + outline questions **MAY share one turn.**
- **Format AND content already named:** no questions; create in existing Files section (BR-6) with real extension. **Do NOT auto-open** Word / Excel / PowerPoint / browser after Approve.
- Until format is known: **do not stage** any deliverable create (not html, not Office).
- **One primary file** unless this Send asked for more formats.
- **Same create path** as other files: Files section, BR-6 Approve / Reject. **No new gate.** MCP stays Grain B and separate.
- No fourth view. No token chrome. No pre-Send gate.
- **No stock template pack. Generic valid file if no IE template.** IE-attached Office/HTML may be used as template when that bot already has one.
- After Approve, the real file is on disk. **Do NOT auto-open** Word / Excel / PowerPoint / browser.
- Additive. **BR / QC / HV / MA / IE frozen.** Leftovers 002/003/009/014 out. Graphify out.
- **Implementer** still runs after consensus or Pick, and only once format+outline are known.

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
            → do NOT auto-open Word / Excel / PowerPoint / browser
```

---

## 2. Format and outline (SD-1, SD-2)

Host-owned. **No Copilot call** just to guess the format.

**Keyword inference only when they named a format:**

| User said | Format |
| --- | --- |
| `deck` | `pptx` |
| `spreadsheet` | `xlsx` |
| `word doc` / `word document` | `docx` |
| `html` | `html` |
| `docx`, `word`, `.docx` | `docx` |
| `xlsx`, `excel`, `.xlsx` | `xlsx` |
| `pptx`, `powerpoint`, `ppt`, `.pptx` | `pptx` |
| `webpage`, `.html` | `html` |

**Not a format:** bare **“report”** still asks. Bare **“document”** without Word still asks. `slides`, `plan`, `summary` alone stay **missing format** → Swarm ask. **Never** map `report` → html.

**Outline / required content** is present when the Send (or the user’s Swarm answer) names what belongs in the file (sections, sheet, slides, or an explicit “include X”). A bare “make a Word file” is format **without** outline → still ask. **Do not invent sections.**

**Ask copy** is HV conversational, host-instructed, not a picker. Format + outline questions **MAY share one turn.**

Missing format OR only “report”:

> Which format should I write — Word, Excel, PowerPoint, or HTML?

Missing outline: ask what must be in the document; do not invent sections. Shared-turn example when both are missing:

> Which format should I write — Word, Excel, PowerPoint, or HTML — and what has to be in it?

**Format AND content already named:** no questions; create in existing Files section (BR-6) with real extension. Keyword inference runs **only** after a format is named (in the original Send **or** in the answer).

**One primary:** unless this Send asked for more formats, the host keeps **one** deliverable create (the named format). Extra Office/HTML creates in the same implementer JSON are dropped. If this Send asked for more than one format, one create per named format.

---

## 3. Swarm ask (no new protocol type)

Not a modal. Not `ui/pick`. **SD ask only after Continue, or when there is no Split.** Split composer lock still wins. Composer **stays enabled** for the ask itself. `deliverableAsk` does **not** override Split lock. Do **not** unlock composer during Split to ask format/outline. **Split still locks send if open.**

**During Split:** do not ask format/outline and do not implement a deliverable. Split still locks send if open.

**Missing format OR only “report”:** Swarm HV question naming Word / Excel / PowerPoint / HTML. Composer enabled. Not during Split.

**Missing outline:** ask what must be in the document; do not invent sections. Format + outline questions **MAY share one turn.**

**After Continue, or when there is no Split:** if format or outline is missing, then ask. Composer stays enabled for that ask.

**Implementer** still runs after consensus or Pick, and only once format+outline are known.

After debate/consensus (no Split), or after Continue, **before** implementer:

1. If this run is producing a standard deliverable and format or outline is missing: **do not** start implementer. Emit a visible HV ask turn (host-authored instruction; the speaking bot’s article is the question). Set `deliverableAsk: true` on the run.
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

**No stock template pack. Generic valid file if no IE template.** Minimal well-formed Office package the OS will open. No Bot Rider letterhead/stock deck.

**IE template:** IE-attached Office/HTML may be used as template when that bot already has one that matches the chosen format. Merge outline/facts. Do not fetch a file from disk at Send. Curate from board + current-turn MCP + decisions, not transcript.

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

After Approve, do not keep the inspect/preview as the file view; the real file is on disk. **Do NOT auto-open** Word / Excel / PowerPoint / browser after Approve.

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
| Missing format OR only “report” | HV question naming Word, Excel, PowerPoint, or HTML |
| Missing outline | ask what must be in the document; do not invent sections |
| Format + outline both missing | MAY share one turn (format names + what must be in it) |
| Office inspect | `{filename} · new Word file` / `new Excel file` / `new PowerPoint file` |
| HTML preview title | `{filename} (Proposed)` |
| Missing format after two asks | no create; no silent html |

---

## 9. Out of this slice

Silent `report`→html, inventing sections, stock template pack, template picker/pack, PMO gallery, format picker/modal, email, fourth view, second Approve, auto-open Word/Excel/PowerPoint/browser after Approve, `vscode.diff` on Office zip/XML, macros, markdown-as-Office, Graphify, leftovers 002/003/009/014, pack/HV/MA/IE product changes.

---

## 10. Tests (merge bar after PO allocates)

- Bare “write a report” (or only “report”): Swarm HV question naming Word / Excel / PowerPoint / HTML, **no** `.html` (or Office) create, composer enabled. Not during Split.
- Bare “document” without Word: still asks (missing format).
- Missing outline: ask what must be in the document; do not invent sections. Format + outline questions MAY share one turn.
- “Word file of the Q3 plan with three sections”: format AND content already named → no questions; one `*.docx` create in Files (BR-6); payload is OOXML zip, not markdown; **do not auto-open** Word after Approve.
- `deck` → `pptx`; `spreadsheet` → `xlsx`; `word doc` / `word document` → `docx`; `html` → `html`.
- “Excel and PowerPoint of the same plan”: two creates, real extensions; not a third html. One primary unless this Send asked for more formats.
- Named HTML: `.html` create; Open is preview titled `{filename} (Proposed)`.
- Office Open does not call `vscode.diff`.
- `changeset/approve` writes bytes to disk; Reject drops the create; no extra MCP invoke. **Do NOT auto-open** Word / Excel / PowerPoint / browser after Approve.
- Implementer JSON has no zip bytes; builder is host-side; no `vbaProject.bin`.
- Generic valid file if no IE template. IE-attached Office/HTML may be used as template when that bot already has one.
- Detect has no `sendRequest`.
- Split-open → no deliverable ask, composer stays locked (Split still locks send if open). After Continue (or when there is no Split) and format still missing → Swarm ask with composer enabled.
- Implementer after consensus or Pick only once format+outline are known.
- WM / QC / HV / MA / IE tests still pass.
