# Bot Rider — UI/UX addendum: F8a Work run + F8b sequential Argue + F8c idle follow-on

Fold into `ui-ux-spec.md` as **§27** (F8a Work), **§28** (F8b Argue), and **§29** (F8c idle follow-on). Additive Swarm + New/Edit Bot chrome. Do **not** reopen §20 Attach, §22 model picker, §23 export/import, §24 OpenSpec chips, §25 Context Map, or §26 F7 Debate composer-lock. Do **not** rewrite §27.9 (F8a Work-batch overlap). Do **not** rewrite §28 except the Out pointer. Not a new sidebar. Not a new Activity Bar icon. Not a fourth view. Not Event Bus chrome.

Architecture: [architecture-work-run.md](./architecture-work-run.md). Additive. **WK-1–6 locked** (F8a shipped). **AG-1–4 locked** (F8b host). **FO-1–4 locked** (F8c host). Work is a **different run type**, not Debate chrome. Host Event Bus is **not** painted. HV is **display only**. Debate lock in §26 stays Debate-only. Argue chrome is **§28**, never §27.9. Follow-on chrome is **§29**. Reuse §27 run-board in-flight+waiting. No ARGUE header for follow-on.

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

**Not name-contains `BA`.** Do not infer Spec or Dispatcher from handle / name / role. No reserved **Dev1 / Dev2 / tester** labels on the tree or form.

### 27.4 Work cannot run (visible error)

When Work is selected and Send fails the designation gate (0 or >1 active dispatcher, or 0 or >1 active spec), Swarm error — exact copy:

```
Work needs one Dispatcher and one Spec.
```

No Work-batch. No silent Debate. No form modal. No per-Send picker.

### 27.5 Composer during Work-batch (unlocked ≠ second orchestrator)

While a Work-batch is in flight, the composer is **unlocked** for **`@` / assign / Stop**. This **contrasts** §26: Debate-batch composer stays **locked** until that Debate batch settles.

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

**One** Proposed Changes Files list: the host **union**. **BR-6 Files only after settle.** Not per-worker Files. Not N Approves.

Approve is **disabled** until the Work-batch settles (`hasPendingChanges` false until then).

**MCP Grain B is a separate click** (§19). Files Approve does not invoke MCP. MCP Approve does not apply Files. Do not combine the gates. Do not move MCP onto the Files list.

Collision paths are **absent** from the list and from Approve. Swarm note per dropped path — exact copy:

```
Skipped {path} · collision
```

`{path}` is the workspace-relative path. Disjoint remainder still Approves (host). No last-writer-wins chrome. No whole-batch fail banner. **No auto-Argue** (F8a). **F8b Argue chrome** lives in §28.

§24 spec-id chips stay on those Files rows when cited.

Do **not** paint a reserved tester / Dev1 / Dev2 chip. A worker on test paths is just `@{handle}`. Comparing worker output to spec is **F8d chrome, not F8a**.

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

Event Bus chrome · packet rows · new sidebar · new Activity Bar icon · fourth view · per-Send role picker · reserved Dev1 / Dev2 / tester chrome · name-contains-`BA` inference · Save-time designation gate · blocking Save / New Bot for flags · F8d Stop-one / compare-to-spec · N Approves · combined Files+MCP Approve · last-writer-wins · whole-batch fail on collision · changing default Send to Work · overlap restyle of §26 Debate lock · moving Approve / MCP / packets / OpenSpec onto the run board · reopening §20 / §22 / §23 / §24 / §25 / §26 · F3 dashboard · F4 register · leftovers 002/003/009/014 · Graphify vendor UI · token/quota chrome. **F8b Argue chrome** lives in §28 (not out of the product forever; not §27.9). **F8c idle follow-on chrome** lives in §29 (not out of the product forever).

### 27.14 Copy exact

| Key | Copy |
| --- | --- |
| Designation gate (0 or >1) | `Work needs one Dispatcher and one Spec.` |
| Master Send during Work-batch | `Work batch still running.` |
| Collision drop | `Skipped {path} · collision` |
| Toggle options | `Work` · `Debate` |
| Form flags | `Dispatcher` · `Spec` |
| Pack overflow | `Prompt doesn't fit Copilot` (full §17.11 block) |

---

## 28. Argue chrome (F8b)

**Status:** Additive after §27. **AG-1–4 locked** (host). This section is chrome only. Argue chrome is **§28**, never §27.9. §27.9 stays F8a Work-batch overlap (multiple HV articles MAY stream at once). Do **not** reuse, renumber, or overwrite §27.9 for Argue. Not a fourth view. Not Event Bus chrome. Not packet rows. Not a new sidebar. Not a new Activity Bar icon. Not F3 / F4. Not leftovers 002/003/009/014. Do **not** reopen §20–§26. Do **not** rewrite §27 except the collision / Out pointer. F8a Work | Debate, designation, Work-batch unlocked composer, and one Files list stay as shipped.

Architecture: [architecture-work-run.md](./architecture-work-run.md) F8b / AG-1–4. **This chrome stamp does not change the host winner lock.** Host winner unchanged: SI-2 AGREE one writer handle. Two rounds then drop. No Pick. No host auto-pick. No reserved-role tie-break.

### 28.0 Chrome lock (BA, matches AG-1–4)

- After Work-batch settle, collided paths Argue **one at a time**. Header exactly `ARGUE · {path}`. Workspace-relative path sort. Do not parallelize.
- Sequential ping-pong. **Not overlapping HV** (one article at a time). Contrast §27.9 Work-batch overlap — do not reuse §27.9.
- **Round headers stay** (Argue round 1 / 2 for this path). Not F7 `ROUND n · CRITIQUE`. Not F7 Split card.
- Two rounds. First speaker = claimants sorted by handle.
- Stop = existing `chat/stop`, aborts Argue, **no Split card**, no enterSplit.
- No winner / Stop: exact copy `Skipped {path} · collision`. **Remainder still in Proposed Changes** (visible, not discarded) while Argue runs and after drop.
- Approve **disabled** until every collision is winner or dropped, then **one** Files union (remainder + winners). Not N Approves. MCP Grain B unchanged / separate click.
- **No Pick chrome.** No reserved Dev/tester roles.
- Composer during Argue: Stop works; **@ stays sole respondent** (existing @ chrome, not a second Work run).
- Work | Debate unchanged. No Event Bus chrome. No new Activity Bar.

### 28.1 Header + round headers

One path header at a time (current path only). Exact copy:

```
ARGUE · {path}
```

`{path}` is the workspace-relative path currently being argued. Workspace-relative path sort. Do not parallelize. After Work-batch settle, collided paths Argue **one at a time**.

**Round headers stay** (Argue round 1 / 2 for this path). Not F7 `ROUND n · CRITIQUE`. Not F7 Split card. Not `chat/split`. **No Pick chrome.** No Continue. No vote chips.

### 28.2 HV articles (sequential ping-pong — contrast §27.9)

Sequential ping-pong. **Not overlapping HV** (one article at a time). The current claimant streams; the next waits.

This **contrasts** §27.9: Work-batch overlap (multiple HV articles MAY stream at once) is unchanged for Work-batch. Argue does **not** reuse §27.9.

Do **not** merge bubbles. Host-stripped article text stays source of truth (§18). Existing `chat/turn-start` / `chat/token` / `chat/turn-end`.

Two rounds. First speaker = claimants sorted by handle.

### 28.3 Claimants (chrome identity)

Claimants painted on the board / articles are workers whose Work-batch edits touched that path. Dispatcher/spec only if assigned that path (they wrote it in the Work-batch). Not a reserved role. Not name matching. No reserved Dev/tester roles. Label `@{handle}` (never display name as the identity).

### 28.4 Composer during Argue

Composer during Argue: Stop works; **@ stays sole respondent** (existing @ chrome, not a second Work run).

Do not add Argue as a third Send mode. Work | Debate toggle unchanged. Default **Debate**. No Event Bus chrome. No new Activity Bar.

### 28.5 Stop

**Stop** = existing `botrider.chat.stop` / `chat/stop` only. Aborts this Argue. **No winner.** **No Split card.** No enterSplit. No Debate-paused Split. No `split.stop`. No F8d Stop-one.

No winner / Stop: exact copy `Skipped {path} · collision`. **Remainder still in Proposed Changes** (visible, not discarded) while Argue runs and after drop.

### 28.6 Approve hold + one Files list

Approve is **disabled** until every collision is winner or dropped.

Then **one** Files union (remainder + winners). Not N Approves. Include resolved winner paths. Dropped collision paths absent (`Skipped {path} · collision`). **Remainder still in Proposed Changes** (visible, not discarded) while Argue runs and after drop.

No-collision Work-batch still Approves as F8a (no Argue chrome).

**MCP Grain B unchanged / separate click** (§19). Do not combine the gates.

Collision drop copy — exact, unchanged F8a string:

```
Skipped {path} · collision
```

Prefer silent union include of the winner file. Do not invent extra copy for a winner toast unless a Swarm note is useful; if a note is used, keep it one line and do not contradict AGREE-only winner.

### 28.7 Run board during Argue

The Run board **MAY** show the current Argue speaker ● in-flight and remaining claimants ○ waiting. Clicks are a no-op. Sequential ping-pong, not parallel HV for the same path.

Do **not** show Event Bus / packet rows / path lists on the chip. Do **not** move Approve, MCP, packets, or OpenSpec chips onto the board. No reserved Dev/tester roles on the board.

### 28.8 Work | Debate

Work | Debate toggle unchanged. Default **Debate**. Send follows the toggle. Do **not** add Argue as a third Send mode.

### 28.9 Accessibility

Header `ARGUE · {path}` announced politely **once** when the path starts. Round headers (Argue round 1 / 2 for this path) announced politely when the round starts. Skip notes (`Skipped {path} · collision`) polite once each.

Per-article live regions. **≤ 1 announce / 2 seconds / article.** In-flight / waiting chips: text includes `@{handle}`. Glyph `aria-hidden` if a ● is decorative.

### 28.10 Protocol consume

No new Event Bus protocol members. Consume existing `chat/turn-start` / `chat/token` / `chat/turn-end` / `chat/stop` / `run/state` / `chat/board` / `changeset/preview` / `error`.

No `chat/split`. No `split/continue`. No `split/pick`. **No Pick chrome.** No Continue. No vote UI. No Split card.

UI never calls `vscode.lm`. UI never paints packets.

### 28.11 Out

Event Bus chrome · packet rows · new sidebar · new Activity Bar icon · fourth view · Argue as a third Send mode · Pick chrome · Continue · F7 Split card · `chat/split` · enterSplit · Debate-paused Split · host auto-pick · reserved-role tie-break · reserved Dev/tester roles · vote chips · `ROUND n · CRITIQUE` header · overlapping HV during Argue · reusing or overwriting §27.9 · N Approves · combined Files+MCP Approve · last-writer-wins chrome · discarding remainder from Proposed Changes while Argue runs · F8d Stop-one / compare-to-spec · reopening §20–§26 / F8a WK-1–6 except the collision pointer · F3 dashboard · F4 register · leftovers 002/003/009/014 · Graphify vendor UI · token/quota chrome. **F8c idle follow-on chrome** lives in §29 (not out of the product forever).

### 28.12 Copy exact

| Key | Copy |
| --- | --- |
| Argue header | `ARGUE · {path}` |
| Collision drop (unchanged) | `Skipped {path} · collision` |

---

## 29. Idle follow-on chrome (F8c)

**Status:** Additive after §28. **FO-1–4 locked** (host). This section is chrome only. Follow-on chrome is **§29**. Do **not** reopen §20–§28 except the §27/§28 Out pointer. Do **not** rewrite §27.9 or §28. Not a fourth view. Not Event Bus chrome. Not packet rows. Not a new sidebar. Not a new Activity Bar icon. Not F3 / F4. Not leftovers 002/003/009/014. Do **not** reopen §20–§26. F8a Work | Debate, designation, Work-batch unlocked composer, F8b `ARGUE · {path}`, and one Files list stay as shipped.

Architecture: [architecture-work-run.md](./architecture-work-run.md) F8c / FO-1–4. **This chrome stamp does not change the host FO lock.** Host freeze unchanged: one extra dispatch + one extra Work-batch of idle bots only; disjoint from pending union and among follow-on assignments; cap one per Send; no second Argue.

### 29.0 Chrome lock (BA, matches FO-1–4)

- Follow-on only after first Work-batch + Argue settle. Not during BA, first batch, or Argue. Cap one per Send. Work | Debate unchanged. No third Send mode. No ARGUE header for follow-on.
- No idle bots: silent, Approve first union. No banner.
- Invalid split: exact `Follow-on work skipped.` then first union Approves.
- Follow-on collisions: `Skipped {path} · collision`. No second Argue. No ARGUE header.
- Approve disabled until follow-on settles or skipped. One union. Not N Approves. MCP unchanged.
- Spec/Dispatcher never follow-on workers. Workers = idle-bot handles from the follow-on dispatch split (not reserved roles).
- Composer @/assign/Stop as WK-6. Stop aborts this follow-on batch. Reuse §27 run-board in-flight+waiting chips. No new Activity Bar.

### 29.1 When follow-on chrome shows

Follow-on Work-batch **after Argue** (or after first Work-batch if no Argue). Not during BA, first Work-batch, or Argue.

Cap one per Send. Work | Debate unchanged. No third Send mode. No Follow-on Send mode.

**No ARGUE header for follow-on.** Follow-on is a Work-batch, not Argue. `ARGUE · {path}` stays F8b-only.

### 29.2 Silent skip (zero idle)

No idle bots: silent, Approve first union. **No banner.** Do **not** paint `Follow-on work skipped.` when there are zero idle bots.

### 29.3 Invalid split

Invalid follow-on split: exact copy:

```
Follow-on work skipped.
```

Then first union Approves.

### 29.4 Follow-on collisions

Follow-on collisions: exact copy (unchanged F8a string):

```
Skipped {path} · collision
```

No second Argue. No ARGUE header.

### 29.5 Approve

Approve is **disabled** until follow-on settles or is skipped.

Then **one** union (remainder + F8b winners + follow-on disjoint). Not N Approves. Remainder still in Proposed Changes (visible, not discarded).

**MCP Grain B unchanged / separate click** (§19). Do not combine the gates.

### 29.6 Workers (chrome identity)

Spec/Dispatcher never follow-on workers. Workers = idle-bot handles from the follow-on dispatch split (not reserved roles). Not name matching. No reserved Dev/tester roles. Label `@{handle}` (never display name as the identity). Dropped-collision-only workers MAY appear if they are idle (active, not spec, not dispatcher, no path in the pending union).

### 29.7 Composer + Stop

Composer during follow-on Work-batch: unlocked `@` / assign / Stop as WK-6 / §27. Stop works; **@ stays sole respondent** (existing @ chrome, not a second Work run).

Master Send reuses exact copy:

```
Work batch still running.
```

No Follow-on Send mode. Work | Debate unchanged.

**Stop** = existing `botrider.chat.stop` / `chat/stop` only. Stop aborts this follow-on batch. No enterSplit. No Split card. No F8d Stop-one.

### 29.8 Run board

Reuse **§27** run-board in-flight + waiting chips: ● in-flight + ○ waiting `@{handle}`. Clicks are a no-op.

Do **not** show Event Bus / packet rows / path lists on the chip. Do **not** move Approve, MCP, packets, or OpenSpec chips onto the board. No new Activity Bar. No new sidebar. No fourth view.

### 29.9 Accessibility

Skip note `Follow-on work skipped.` polite once when the invalid split is skipped. Collision notes `Skipped {path} · collision` polite once each. Zero-idle silent skip: **no** announcement / no banner.

Per-article live regions. **≤ 1 announce / 2 seconds / article.** In-flight / waiting chips: text includes `@{handle}`. Glyph `aria-hidden` if a ● is decorative.

Do **not** announce an ARGUE header for follow-on.

### 29.10 Protocol consume

No new Event Bus protocol members. Consume existing `chat/turn-start` / `chat/token` / `chat/turn-end` / `chat/stop` / `run/state` / `chat/board` / `changeset/preview` / `error`.

No `chat/split`. No Pick. No Continue. No ARGUE header for follow-on.

UI never calls `vscode.lm`. UI never paints packets.

### 29.11 Out

Event Bus chrome · packet rows · new sidebar · new Activity Bar icon · fourth view · third Send mode · Follow-on Send mode · ARGUE header for follow-on · Pick chrome · enterSplit · Split card · N Approves · combined Files+MCP Approve · last-writer-wins · second Argue on follow-on collisions · spec/dispatcher as follow-on workers · reserved Dev/tester roles · banner on zero-idle skip · looping follow-on · follow-on during BA/first batch/Argue · F8d Stop-one / compare-to-spec · reopening §20–§28 / F8a WK-1–6 / F8b AG-1–4 except the settle / Out pointer · F3 dashboard · F4 register · leftovers 002/003/009/014 · Graphify vendor UI · token/quota chrome

### 29.12 Copy exact

| Key | Copy |
| --- | --- |
| Follow-on split invalid | `Follow-on work skipped.` |
| Zero idle | _(silent — no banner)_ |
| Master Send during follow-on Work-batch | `Work batch still running.` (reuse WK-5 / §27) |
| Collision drop (unchanged) | `Skipped {path} · collision` |
