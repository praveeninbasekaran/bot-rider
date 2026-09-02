# Bot Rider — UI/UX addendum: F8a Work run

Fold into `ui-ux-spec.md` as **§27**. Additive Swarm + New/Edit Bot chrome for the **Work** run type. Do **not** reopen §20 Attach, §22 model picker, §23 export/import, §24 OpenSpec chips, §25 Context Map, or §26 F7 Debate composer-lock. Not a new sidebar. Not a new Activity Bar icon. Not a fourth view. Not Event Bus chrome.

Architecture: [architecture-work-run.md](./architecture-work-run.md). Additive. **WK-1–6 locked.** Work is a **different run type**, not Debate chrome. Host Event Bus is **not** painted. HV is **display only**. Debate lock in §26 stays Debate-only.

## 27. Work run chrome (F8a)

**Status:** Additive after §26. **WK-1–6 locked** (host). This file is chrome only. Not a fourth view. Not Event Bus chrome. Not packet rows. Not a new sidebar. Not a new Activity Bar icon. Not token chrome. Not F3 / F4. Not leftovers 002/003/009/014. Do **not** reopen §20 / §22 / §23 / §24 / §25 / §26.

OpenSpec chips stay on Proposed Changes **Files** rows (§24). Context Map unchanged (§25). F7 Debate overlap / composer-lock unchanged (§26).

### 27.1 Surfaces

Same Swarm surfaces as today: sidebar `botRider.chat` and Expand `botRider.chatPanel`. Same component, same thread. Same New/Edit Bot form (`botRider.botForm`).

| Surface | Work chrome |
| --- | --- |
| Swarm composer (sidebar + Expand) | **Work \| Debate** segmented control. Default **Debate**. Send follows it |
| New / Edit Bot | Optional **Dispatcher** and **Spec** checkboxes **after Active** |
| Work-batch composer | **Unlocked** for `@` / assign / Stop (contrast §26 Debate lock) |
| Swarm thread | HV articles **MAY overlap** during Work-batch (display only) |
| Run board | **MAY** show multiple in-flight **and** waiting workers |
| Proposed Changes Files | **One** Files list (union). Collision paths absent |
| Proposed Changes / MCP / OpenSpec chips / Context Map | Unchanged. Do **not** move onto the board |

**No Event Bus chrome.** Do not paint the bus, packet ids, inbox counts, or subscriber lists. Do not add packet rows to the thread.

**Not a per-Send picker.** Composer stays **Work | Debate** only. Do not add a Send-time role / dispatcher / spec picker.

**HV is display only.** Overlapping articles are what the user reads. They are **not** the talk channel and **not** the bot transcript.

### 27.2 Work | Debate toggle

Segmented control on the Swarm composer **and** Expand, next to Send. Default **Debate**.

- **Debate** selected → Send is existing Debate (F7 / §26). This addendum does not restyle Debate.
- **Work** selected → Send is Work (host WK-2 gate).

No new Activity Bar. No new sidebar. No fourth view. Do not persist the toggle across reload (session-only is enough; default Debate on a fresh composer).

### 27.3 Designation checkboxes (New / Edit Bot)

After **Active**, two optional checkboxes:

```
Dispatcher
Spec
```

**Save is not the gate.** The user may Save / New Bot with neither, one, or both checked. Chrome-side zero is valid. Do **not** disable Save. Do **not** block New Bot. Do **not** auto-uncheck other bots when this bot is saved.

Work Send (host) is the gate: exactly one **active** dispatcher and exactly one **active** spec. Chrome shows the Swarm error when Work cannot run — it does **not** rewrite the form.

### 27.4 Work cannot run (visible error)

When Work is selected and Send fails the designation gate (0 or >1 active dispatcher, or 0 or >1 active spec), Swarm error — exact copy:

```
Work needs one Dispatcher and one Spec.
```

No Work-batch. No silent Debate. No form modal. No per-Send picker.

### 27.5 Composer during Work-batch (unlocked ≠ second orchestrator)

While a Work-batch is in flight, the composer is **unlocked** (`@` / assign / Stop). This **contrasts** §26: Debate-batch composer stays **locked** until that Debate batch settles.

Unlocked ≠ second orchestrator:

- New **master-prompt** Send does **not** start a second run. Exact copy:

```
Work batch still running.
```

- `@` to a bot **not** in-flight may run (solo article; existing `@` chrome).
- `@` to an **in-flight** bot waits (no second overlapping article for that bot until its `sendRequest` ends).

`@` picker unchanged (§ Swarm). Assign uses existing `@` insert. Do not add a worker-assign widget.

### 27.6 Stop

**Stop** = existing `botrider.chat.stop` / `chat/stop` only (no `split.stop`, no Stop-one). Card Stop posts `chat/stop`. Stop **aborts all** in-flight streams in **this** Work-batch.

F8d Stop-one is **out**.

### 27.7 Run board in-flight + waiting

The Run board **MAY** show multiple **in-flight** and **waiting** workers during Work:

- In-flight: one static ● / chip per handle (same idea as §26.4).
- Waiting: workers that have an assignment but have not started (BA-phase / dispatch-phase wait, or `@` wait). Distinct from in-flight. Do **not** animate a chase.

Label `@{handle}` (never display name as the identity). Do **not** show Event Bus / packet rows / path lists on the chip.

Do **not** move Approve, MCP actions, isolation packets, or OpenSpec chips onto the board.

Board anatomy otherwise unchanged (§17). Clicking a chip is a no-op.

### 27.8 One Files list + collision note

**One** Proposed Changes Files list: the host **union**. Not per-worker Files. Not N Approves.

Approve is **disabled** until the Work-batch settles (`hasPendingChanges` false until then).

Collision paths are **absent** from the list and from Approve. Swarm note per dropped path — exact copy:

```
Skipped {path} · collision
```

`{path}` is the workspace-relative path. Disjoint remainder still Approves (host). No last-writer-wins chrome. No whole-batch fail banner. **No auto-Argue** (F8b out).

§24 spec-id chips stay on those Files rows when cited.

### 27.9 Overlap (Work-batch)

During Work-batch, more than one HV article **MAY** stream at once. Each article stays that bot’s bubble (`@{handle}`, color + initials). Existing `chat/turn-start` / `chat/token` / `chat/turn-end`.

Do **not** merge bubbles. Host-stripped article text stays source of truth (§18).

BA-phase and dispatch-phase stay one article at a time.

### 27.10 Pack overflow

Unchanged QC-3 thread error. Exact copy (§17.11):

```
Prompt doesn't fit Copilot
The minimum context for this turn is larger than Copilot's window.
Shorten the prompt or shrink the active editor. Required context was not dropped.
```

`error` `code: 'pack-overflow'`. Thread error block on **that bot**. Siblings in the Work-batch keep running (host). No Event Bus / packet chrome on the error.

### 27.11 Accessibility

Per-article live regions. **≤ 1 announce / 2 seconds / article.**

Work | Debate control: accessible name includes the selected mode (`Work` / `Debate`).

Designation checkboxes: labels **Dispatcher** and **Spec**.

Swarm errors (`Work needs one Dispatcher and one Spec.`, `Work batch still running.`, `Skipped {path} · collision`) are polite live announcements once each.

In-flight / waiting chips: text includes `@{handle}`. Glyph `aria-hidden` if a ● is decorative.

### 27.12 Protocol consume

No new Event Bus protocol members. Consume existing `chat/turn-start` / `chat/token` / `chat/turn-end` / `chat/stop` / `run/state` / `chat/board` / `changeset/preview` / `error` / `bots/snapshot`.

Work | Debate is composer chrome; Send is existing `chat/send`. Flags ride existing bot create / update / snapshot.

UI never calls `vscode.lm`. UI never paints packets. UI never implies same-batch workers have ingested each other.

### 27.13 Out

Event Bus chrome · packet rows · new sidebar · new Activity Bar icon · fourth view · per-Send role picker · Save-time designation gate · blocking Save / New Bot for flags · F8b Argue chrome · F8c idle follow-on chrome · F8d Stop-one · N Approves · last-writer-wins · whole-batch fail on collision · changing default Send to Work · overlap restyle of §26 Debate lock · moving Approve / MCP / packets / OpenSpec onto the run board · reopening §20 / §22 / §23 / §24 / §25 / §26 · F3 dashboard · F4 register · leftovers 002/003/009/014 · Graphify vendor UI · token/quota chrome

### 27.14 Copy exact

| Key | Copy |
| --- | --- |
| Designation gate (0 or >1) | `Work needs one Dispatcher and one Spec.` |
| Master Send during Work-batch | `Work batch still running.` |
| Collision drop | `Skipped {path} · collision` |
| Toggle options | `Work` · `Debate` |
| Form flags | `Dispatcher` · `Spec` |
| Pack overflow | `Prompt doesn't fit Copilot` (full §17.11 block) |
