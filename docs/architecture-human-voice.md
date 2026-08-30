# Bot Rider — Human voice (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR-1–BR-6. Not a TokenGovernor / pack change.
Stories: **HV-1** host voice on visible debate turns, **HV-2** host strip leftover markdown chrome, **HV-3** length is prompt guidance only.
UI chrome contract: `ui-ux-spec.md` §18 (addendum `ui-ux-chat-prose.md`). Host is the source of truth for stripped article text. UI renders that article; it does not re-strip as source of truth.
Date: 2026-08-30.
Parent: `architecture-mvp.md` (BR-1–BR-6). QC packs: `architecture-token-save.md` (QC-1–3 **unchanged**). WM unchanged. Additive. **No new HostToUi / UiToHost types. No protocol rev.**

Split (when PO allocates): **Developer 1** host (`turnInstruction` voice overlay, strip after protocol parse). **Developer 2** §18 consume only if a later SHA still treats leftover `##` as a README; default is host-stripped already. QA after host.

---

## 0. Non-negotiables (PO + BA HV-1–3 + §18)

- Visible **propose / critique / `@`-direct / Split positions** are conversational prose. Chat, not a rendered README or markdown spec.
- **Host voice wins** on those turns over a stored persona that says “write a spec in markdown.” **Do not rewrite stored persona / instructions text** (bot form, `globalState`). Overlay lives in **this turn’s instruction**, not a persona migration.
- Protocol tokens stay host-parsed: `AGREE` / `DISSENT` (first token on vote), `NEED_EDIT` / `NO_EDIT` (`@` trailer), parseable todo checkbox lines (Run board). They are **stripped from the article** (`chat/turn-end.text`, Split position one-liners). UI does not badge leftovers.
- After that protocol strip, host also strips leftover **`##` / `###` lead-in** and **unsolicited bullet-walls**. **Keep code fences.** **Keep a list if this Send asked for a list** (single-level). Nested lists flatten.
- **No host word-cap.** No mid-turn truncate. No length counter. Length, if any, is **prompt guidance only**.
- **Implementer still JSON** changeset. Not chat. Files stay in Proposed Changes. Implementer instruction still asks for the fenced JSON shape.
- **QC-2 packs unchanged. WM unchanged.** Voice is content style, not pack size policy. TokenGovernor, LSP slice, board, tab paths, implementer bodies = board in-play + changeset, extra tabs paths-only — all stay. Workspace MCP: tools still none on vote/implementer; read-only on propose/critique/@ only.
- `dissents[]` remains Split-only one-liners (§17 lock A). Split card positions stay conversational (stripped).
- Additive. **BR-1–6 frozen.** Copilot-only, ₹0 extra keys. No speaker cap. No pre-Send gate. No fourth view. No voice toggle. No plain-vs-markdown toggle.

### BA locks (HV-1–3 stay the set — no new stories)

- **HV-1:** contractions OK on visible debate/@/split prose.
- **HV-1 AC8 (chrome):** Visible Swarm articles (propose, critique, `@`, split positions) render as chat paragraphs, not a README or document layout. Host sends already-stripped text. UI must not restyle that article into headings/spec chrome. Pointer remains `ui-ux-spec.md` §18 / `ui-ux-chat-prose.md`.
- **HV-3 AC3:** if the user asks for an `.md`/`.html` (or any file), it is produced only by the implementer JSON changeset + BR-6 Approve. Debate/@ must not paste that file as the speaking article (existing language-only sanitize / drop file bodies).
- **WM unchanged** (next to QC packs unchanged): tools still none on vote/implementer; read-only on propose/critique/@ only.
- Prompt is defense in depth; host-stripped article is source of truth.
- Strip rules, protocol, implementer JSON, TokenGovernor, lock A `dissents[]` unchanged.

---

## 1. PromptBuilder / turn instructions (HV-1, HV-3)

`turnInstruction` for `propose` | `critique` | `direct` **must not** ask for a markdown spec, README, heading template, or “respond in markdown.”

Locked guidance (same idea, exact wording may match copy.ts later):

- Propose / critique / `@`: conversational chat. Short paragraphs. No `#` / `##` / `###` headings. No bullet-wall unless the **user request** on this Send asked for a list. Do not emit file bodies, diffs, or JSON changesets.
- Overlay, every debate/@ pack, **after** the stored persona block: *Visible reply is conversational chat, not a markdown spec or README, even if the persona asks for a document.*
- Vote (`consensus`): first token still `AGREE` or `DISSENT`. The rest is conversational reason. Same overlay. Host still `parseVote`.
- Implementer: **unchanged** JSON fence instruction. No human-voice overlay on implementer.

HV-3: optional one line, not a limiter: *Keep it tight.* Never “max N words.” Never drop tokens because of a host counter. Never `chat/token` ellipsis from a cap.

Default create-bot persona/instructions in **new** drafts must not say “respond in markdown” / “write a spec.” Existing saved personas are **not** rewritten.

---

## 2. Host strip (HV-2)

Run **after** stream, on debate / critique / `@` / vote **visible** text, **before** `chat/turn-end` and **before** Split `positions[].text`. Implementer JSON is not this path (`PatchParser` unchanged).

Order:

1. **Existing protocol parse** (unchanged semantics)
   - Vote: `parseVote`; strip a leading `AGREE`/`DISSENT` token from the article (reason remains).
   - `@`: `stripNeedEditTrailer`; trailer not visible.
   - Debate/@: existing language-only sanitize (drop file bodies / changeset fences from speaking turns).
   - Parseable todo lines (`- [ ]` / `- [x]` / `- [>]`): `RunBoardStore.mergeParseableTodos` as today, then **remove those lines from the article** (todos live on the board).
2. **Leftover heading lead-in:** a line whose trimmed form is `#` / `##` / `###` plus optional space plus rest → drop the hashes; keep the rest as a normal sentence. Repeat per line. Do not promote heading scale.
3. **Unsolicited bullet-wall:** if this Send’s `userText` did **not** ask for a list, flatten markdown list lines (`- `, `* `, `1. ` …) to paragraphs (drop the marker, keep the sentence). A **bullet-wall** is two or more consecutive list lines, or a nested list. If this Send **did** ask for a list, keep a **single** level; flatten nesting.
4. **Keep** fenced code (triple-backtick fences) byte-for-byte, including list-looking lines inside the fence. Inline code spans stay.

**“This Send asked for a list”** is deterministic on the current master prompt (`userText` only, not persona, not history):

- true if the prompt matches (case-insensitive) `\b(list|bullet|bullets|checklist)\b` or asks for numbered steps (`\b(numbered|1\)|1\.)\b` as a request), or contains an explicit “as a list”.
- false otherwise. When false, flatten. Do not NLP.

Do **not** strip:

- Round headers, Split card chrome, Run board (host-owned, not article body).
- Code fences.
- `inChangeset` chips / Proposed Changes.

Streaming: `chat/token` may briefly include protocol tokens or `##`; `chat/turn-end.text` is the stripped article and is what the bubble keeps. No mid-turn UI truncate (§18.5).

Split one-liners: `oneLine` of **already-stripped** visible text. `dissents[]` still from those one-liners on Split only.

---

## 3. Protocol / stores

No new `HostToUi` / `UiToHost` members. `chat/turn-end.text` is stripped. `chat/split.positions[].text` is stripped. `chat/board` todos still come from parseable lines **before** they are removed from the article.

ThreadStore stores the **stripped** visible article (what the user saw), not the raw model dump. QC packs still do **not** restuff `history[]` into Copilot.

---

## 4. Out of this slice

Persona rewrite/migration, word-cap, mid-turn truncate, length counter, voice toggle, plain-vs-markdown toggle, speaker cap, pre-Send gate, TokenGovernor / pack policy, implementer-as-chat, Graphify, leftover 002/003/009/014, mutating MCP.

---

## 5. Tests (merge bar after PO allocates)

- Propose/critique/`@` instructions contain the conversational overlay and do **not** contain “markdown spec” / “respond in markdown” / “write a README”.
- Stored persona “Write a spec in markdown with ## headings and a bullet list.” is still persisted as-is; visible turn still conversational (overlay + strip).
- Vote still parses `AGREE`/`DISSENT` as first token; article does not show that token; reason remains.
- `@` `NEED_EDIT`/`NO_EDIT` stripped; implementer still starts only on `NEED_EDIT`.
- Parseable `- [ ]` lines merge to the board and are absent from `chat/turn-end.text`.
- `## Heading` lead-in becomes `Heading` (no hashes) on debate turns.
- Unsolicited consecutive `- ` lines flatten when `userText` is “fix the bug”; kept as a single-level list when `userText` is “list the risks”.
- Fenced code with inner `- ` lines is unchanged.
- Implementer pack still JSON fence; QC-2: debate pack is slice not full buffer; extra tabs paths-only; implementer bodies = board in-play + changeset.
- No new protocol types. WM tools still none on vote/implementer.
- Contractions remain on visible debate/@/split prose (HV-1).
- User ask for `.md`/`.html` (or any file) is implementer JSON changeset + BR-6 Approve only; debate/@ article does not paste that file (HV-3 AC3).
- Visible Swarm articles render as chat paragraphs; UI does not restyle host-stripped text into headings/spec chrome (HV-1 AC8).
