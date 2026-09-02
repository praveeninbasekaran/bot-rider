# Bot Rider — F8a Work run / WK-1–6 (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR, QC, HV, MA, SD, TA, MS, SI-1/2/4, EX, OS, CM, or EB-1–4. **Not** a protocol on F7 Debate. **Not** F3 dashboard / F4 register. Layers on frozen F7 isolation (SI-1/2/4 held) + F7 Event Bus (reuse in-process bus) + F6 / F2 / F1.
Stories: **WK-1–6 is the full story set.** **WK-1** New run type **Work**. Not on F7 Debate. Reuse F7 in-process Event Bus + SI-1/2/4. Packets **APPEND**. Never merge `BotSession` stores. Never restuff a global Swarm transcript. HV is display only. `vscode.lm` only. ₹0 extra keys. **Work | Debate** toggle; default **Debate**; Send follows the toggle. Explicit Debate remains. **WK-2** `BotRecord` flags `dispatcher` and `spec`. **At most one active** of each, else Work does not run. New/Edit Bot optional checkboxes after Active. **Save is not the gate** (0 or 2 flags may persist). **Work Send is the gate:** exactly one **active** dispatcher **and** exactly one **active** spec. Else Swarm error `Work needs one Dispatcher and one Spec.` Host never invents a path partition. Spec is **not** name-contains `BA`. Not a per-Send picker. **WK-3** **BA-phase** = sequential `sendRequest` of the one active **spec** bot. Other workers **WAIT**. **WK-4** **Dispatch-phase** then **Work-batch**. Drop reserved **Dev1 / Dev2 / tester** names. Workers = handles in the dispatcher split from remaining **active** bots. Dispatcher **SHALL** assign disjoint path sets; host validates; host never invents a partition. Invalid split → re-split or Swarm note; Work-batch does **not** start. Work-batch = **parallel** `sendRequest` on those disjoint paths. Same-batch **DEAF** (stamped EB-3). QC-3 **that bot only**. **WK-5** Composer **UNLOCKED** for `@` / assign / Stop. Unlocked ≠ second orchestrator. Master Send does **not** start a second run (`Work batch still running.`). **Tester** = a worker assigned **test paths** (not a reserved role): same-batch deaf; packs **BA spec packets + assigned paths**; does not see other workers until settle. Comparing worker output to spec is **F8d, not F8a**. **WK-6** **Union Approve:** BR-6 **Files only after settle**. Collision paths **DROP** + `Skipped {path} · collision`. Approve **disabled** until settle. MCP Grain B is a **separate click**. SI-1 persists the **whole Work run**. Packets **APPEND**. Stop aborts **all** in this batch. No F8b / F8c / F8d.
UI chrome contract: `ui-ux-spec.md` §27 (addendum `ui-ux-work-run.md`). F7 Debate composer-lock stays §26 / Debate-only. Work is a different run type.
Date: 2026-09-02.
Parent: `architecture-mvp.md`. Isolation: `architecture-bot-isolation.md` (SI-1/2/4 held). Event Bus: `architecture-event-bus.md` (reuse in-process bus; Debate composer-lock is Debate-only). OpenSpec: `architecture-openspec-trace.md` (OS-4 bodies stay required talk; §24 chips stay on Proposed Changes Files). Pack: `architecture-token-save.md` (QC-3 unchanged; overflow **that bot only** in a batch). Copilot stays `vscode.lm`. ₹0 extra keys. No second runtime.

Split (when PO allocates; **do not allocate in this docs PR**): **Developer 1** host (Work run type, designation gate, BA-phase, dispatch-phase, disjoint validate, Work-batch, union Approve). **Developer 2** §27 chrome (Work | Debate toggle, form flags, unlocked composer, Stop-all, run-board in-flight+waiting, one Files list, Swarm notes). QA after both, on a **new product PR** after this docs PR merges, **not stacked here**.

---

## Story map (WK-1–6)

WK-1–6 stay the set. No new stories. F8b Argue, F8c idle follow-on, F8d Stop-one / comparing worker output to spec are **not** this slice.

### WK-1 New run type Work

**Work** is a **new run type**. It is **not** a protocol on F7 Debate. Debate stays Debate (EB-1–4 / §26). Default Send stays **Debate**.

Reuse the F7 **host in-process** Event Bus + SI-1 / SI-2 / SI-4. **SI-1 persists the whole Work run** (BA-phase → dispatch-phase → Work-batch → union Approve). Packets **APPEND**. Never merge `BotSession` stores. Never replace or wipe a bot’s own history when others speak. Never restuff a global Swarm transcript into packs. **HV is display only**, not the bot transcript / talk channel. Failed drafts unpublished. `vscode.lm` only. ₹0 extra keys. No second runtime.

**Work | Debate** toggle on the existing Swarm composer (and Expand). Send follows the toggle. Explicit Debate remains. No new Activity Bar. No new sidebar. No per-Send role picker.

### WK-2 Designation (dispatcher + spec)

Additive `BotRecord` flags: `dispatcher?: boolean`, `spec?: boolean` (absent = false). New/Edit Bot: optional **Dispatcher** and **Spec** checkboxes **after Active**.

**Save is not the gate.** 0, 1, or 2 flags may persist on one bot and on the registry. Chrome-side zero is valid on the form. Do **not** block Save / New Bot for missing or extra flags. Do **not** silently clear a sibling bot’s flags on Save. Do **not** add a per-Send picker.

**Work Send is the gate.** Count **active** bots with `dispatcher` and **active** bots with `spec`. Work runs only when **exactly one** active dispatcher **and** **exactly one** active spec. Inactive flagged bots do not count. The same bot **MAY** carry both flags; that still counts as one dispatcher and one spec.

Otherwise Work does **not** run. No BA-phase. No dispatch-phase. No Work-batch. Send does **not** fall through into a silent Debate. Swarm error (0 or >1 of either):

```
Work needs one Dispatcher and one Spec.
```

**Not name matching. Not name-contains `BA`.** Spec bot is the flagged bot only — not a handle / role / persona / display-name guess. That bot **is** BA-phase. Host **never** invents a path partition.

**At most one active dispatcher.** **At most one active spec.** Else Work does not run (Work Send gate). Save may still persist 0 or many flags.

### WK-3 BA-phase (sequential)

When Work Send passes the gate: **BA-phase** = one sequential `sendRequest` of the one active **spec** bot. Other workers **WAIT**. No parallel `sendRequest` in this phase.

BA-phase publishes SI-2 packets at existing SI-2 moments. Packets **APPEND**. HV article is display only.

### WK-4 Dispatch + Work-batch (drop reserved names; parallel disjoint; DEAF; QC-3)

**Drop reserved Dev1 / Dev2 / tester names.** There is no host role named Dev1, Dev2, or tester. Workers are **handles in the dispatcher split** from remaining **active** bots. Role / name / persona / name-contains never select workers.

**Dispatch-phase** = **one** sequential Copilot turn of the one active **dispatcher** bot. Dispatcher **SHALL** assign **disjoint** path sets. Host is the **source of truth**: validates the split is disjoint **before** Work-batch launch. Host **never** invents a path partition.

Invalid split (overlap, empty assignment, unknown handle, inactive handle, or otherwise not a disjoint partition of the declared paths): dispatcher **re-splits** or the host posts a Swarm note. **Work-batch does not start.** Do not “fix” the partition in the host.

**Work-batch** = **parallel** `sendRequest` on those validated **disjoint** paths. Simultaneous start of assigned workers.

**Same-batch DEAF (stamped EB-3):** no sibling packets inside the batch. DROP stands even if a worker has not started yet. In-flight `sendRequest` is never mutated. Publish ≠ ingest. After the batch settles, remaining-turn subscribers **SHALL** ingest **every** packet from that batch **BEFORE** the next `sendRequest` starts.

**QC-3 that bot only.** Pack-overflow skips that worker’s `sendRequest`; siblings in the batch keep running. Copy stays §17.11 `Prompt doesn't fit Copilot`.

### WK-5 Composer + tester-as-path-worker

**Composer UNLOCKED** during Work-batch for `@` / assign / Stop. Unlocked ≠ second orchestrator:

- New **master-prompt** Send does **not** start a second run while Work-batch is in flight. Copy: `Work batch still running.`
- `@` to a bot **not** in-flight **MAY** run (solo; not a second Work run).
- `@` to an **in-flight** bot **waits** until that bot’s `sendRequest` ends.

**Tester** is **not** a reserved role. **Tester** = a worker whose assigned paths are **test paths**. Same-batch **DEAF**. Pack = **BA spec packets + assigned paths**. Does **not** see other workers until settle. **No live worker output** in F8a. **Comparing worker output to spec is F8d, not F8a.**

SI-3 reopened **only** for assigned Work-batch workers (plus the existing Debate-batch reopen in EB). BA-phase, dispatch-phase, and `@` wait-for-in-flight stay sequential.

Each worker’s `sendRequest` uses that bot’s MS-1 `modelId`. `vscode.lm` only.

### WK-6 Union Approve + Stop

**BR-6 Files only after settle.** Host **unions** disjoint file ops after Work-batch **settles**. **ONE** BR-6 Approve of the union. No `applyEdit` mid-batch. `hasPendingChanges` **false** and Approve **disabled** until the batch settles.

Overlapping paths **DROP** from the union. Visible Swarm note per dropped path:

```
Skipped {path} · collision
```

Those paths are **absent** from Approve. The **disjoint remainder** still Approves. No last-writer-wins. No whole-batch fail. **No auto-Argue** (Argue is F8b).

**MCP Grain B is a separate click.** Files Approve does not invoke MCP. MCP Approve does not `applyEdit`. Do not combine the gates. Do not move MCP onto the Files list or the run board.

**SI-1 persists the whole Work run.** Packets **APPEND**. Not reset between BA-phase / dispatch / Work-batch. Reload / run-end still clears.

**Stop** (`botrider.chat.stop` / `chat/stop`) aborts **all** in-flight `sendRequest` in this Work-batch. HV **MAY** overlap (display only). Run board **MAY** show multiple in-flight + waiting. **One** Files list (the union). §24 chips stay on Proposed Changes Files. No F8b / F8c / F8d.

---

## 0. Non-negotiables

- **(WK-1)** Work is a **new run type**, not a protocol on F7 Debate. Do **not** reopen EB-1–4 / §26. Debate composer-lock stays Debate-only.
- **(WK-1)** Reuse F7 **host in-process** Event Bus. Not `vscode.EventBus`. Not network. Not Event Bus chrome.
- **(WK-1)** **SI-1 persists the whole Work run.** Packets **APPEND**. Never merge `BotSession` stores. Never restuff a global Swarm transcript. HV is display only. `vscode.lm` only. ₹0 extra keys. No second runtime.
- **(WK-1)** **Work | Debate** toggle; default **Debate**; Send follows the toggle. No new Activity Bar. No new sidebar. No per-Send role picker. Composer stays Work | Debate only.
- **(WK-2)** Flags `dispatcher` and `spec` on `BotRecord`. Checkboxes after Active. **Save is not the gate.** 0 or 2 flags may persist. Do **not** block Save / New Bot.
- **(WK-2)** **Work Send is the gate:** exactly one active dispatcher **and** exactly one active spec. Else Work does not run. Copy: `Work needs one Dispatcher and one Spec.`
- **(WK-2)** Spec / dispatcher are flags. **Not name matching. Not name-contains `BA`.** Host never invents a path partition. At most one active dispatcher; at most one active spec; else Work does not run.
- **(WK-3)** BA-phase = the one active spec bot, sequential. Other workers WAIT.
- **(WK-4)** Drop reserved **Dev1 / Dev2 / tester** names. Workers = handles in the dispatcher split from remaining active bots.
- **(WK-4)** Dispatch-phase = one sequential dispatcher turn. Dispatcher **SHALL** assign disjoint path sets. Host validates. Invalid → re-split or Swarm note; Work-batch does **not** start. Host never invents a partition.
- **(WK-4)** Work-batch = **parallel** `sendRequest` on disjoint paths. Same-batch **DEAF** (stamped EB-3). QC-3 **that bot only**. In-flight `sendRequest` never mutated.
- **(WK-5)** **Tester** = worker on **test paths** (not a reserved role). Packs BA spec packets + assigned paths. Same-batch deaf. Does not see other workers until settle. Comparing worker output to spec is **F8d, not F8a**.
- **(WK-5)** Composer **`@` / assign / Stop**. Unlocked ≠ second orchestrator. Master Send while in flight: `Work batch still running.` `@` not-in-flight MAY run. `@` in-flight waits.
- **(WK-6)** **BR-6 Files only after settle.** Approve / `hasPendingChanges` false until settle. No `applyEdit` mid-batch. **MCP Grain B is a separate click.**
- **(WK-6)** Collision = **DROP** from the union + `Skipped {path} · collision`. Disjoint remainder Approves. No last-writer-wins. No whole-batch fail. No auto-Argue. No F8b / F8c / F8d.
- **(WK-6)** Stop aborts **all** in this Work-batch. One Files list. §24 chips stay on Proposed Changes Files. Do **not** reopen §20–§26.
- BR / QC / HV / MA / SD / TA / MS / SI-1/2/4 / EX / OS / CM / EB frozen otherwise. Leftovers 002 / 003 / 009 / 014 out. F3 / F4 out. Marketplace / API keys / Settings Sync / Graphify out.

---

## 1. Component

```
Work | Debate toggle (default Debate)
  Debate selected → existing F7 Debate path (EB / §26). This file does not run.
  Work selected  → Work Send gate (WK-2)

Work Send
  active dispatcher count === 1 AND active spec count === 1
    else → Swarm error `Work needs one Dispatcher and one Spec.`
           no BA-phase, no dispatch, no Work-batch
           do not silently start Debate

BA-phase (WK-3)
  sequential sendRequest of the one active spec bot
  other assigned / remaining workers WAIT
  publish SI-2 at turn-end (APPEND; HV display only)

Dispatch-phase (WK-4)
  one sequential sendRequest of the one active dispatcher
  dispatcher SHALL emit disjoint path sets → handles
  workers = those handles ∩ remaining active bots
  NO reserved Dev1 / Dev2 / tester names
  host validates disjoint
    invalid → re-split or Swarm note; Work-batch does NOT start
    host NEVER invents a partition

Work-batch (WK-4 parallel disjoint)
  pack EACH assigned worker NOW:
    persona/system for THIS bot
    + this bot’s SI-1 (whole Work run; APPEND)
    + assigned paths
    + if test paths (tester = path worker, not a role): BA spec packets + assigned paths
    NOT sibling packets from this batch (DEAF / stamped EB-3)
    NOT live worker output (compare-to-spec is F8d)
    NOT HV articles
  start ALL surviving sendRequest together
  QC-3 that bot only; siblings keep running
  in-flight sendRequest NEVER mutated
  composer UNLOCKED for @ / assign / Stop (WK-5)
  master-prompt Send → `Work batch still running.` (no second run)
  @ not-in-flight MAY run (solo)
  @ in-flight WAITS until that sendRequest ends
  Stop → abort ALL in this Work-batch

Batch settles
  remaining-turn subscribers SHALL ingest EVERY packet from this batch
  APPEND into each subscriber’s SI-1
  never merge BotSession stores
  BR-6 Files ONLY after settle (WK-6)
  overlapping paths DROP + `Skipped {path} · collision`
  then ONE BR-6 Files Approve of the remainder
  MCP Grain B = separate click (not this Approve)
  hasPendingChanges false / Approve disabled until this settle

Reload / run clear / Approve|Reject end
  clear BotSessionStore + Event Bus with transcript / board
```

---

## 2. Designation (WK-2)

```ts
// Additive on BotRecord. Absent = false. Do not bump BotStoreFile.version.
type WorkDesignation = {
  dispatcher?: boolean;
  spec?: boolean;
};
```

Persist with BR-3 `BotRecord` like other bot fields. Export/import of these flags is **out** of F8a (do not reopen EX).

New/Edit Bot ports (`bots/create` / `bots/update`) **MAY** pass the flags. Save **succeeds** with any combination (neither, one, both). Registry **MAY** hold zero, one, or many bots flagged dispatcher and/or spec, including several **active** at once.

Work Send counts **active** flags only:

| Active dispatcher | Active spec | Work Send |
| --- | --- | --- |
| 1 | 1 | Run BA-phase |
| 0 / >1 | any | Error; no Work |
| any | 0 / >1 | Error; no Work |

Copy (0 or >1 of either): `Work needs one Dispatcher and one Spec.`

**Not name-contains `BA`.** Spec is the `spec` flag, not a handle / name / role that contains “BA”.

Not a per-Send picker. Composer stays **Work | Debate** only.

---

## 3. Phases

| Phase | `sendRequest` | Who | Siblings hear |
| --- | --- | --- | --- |
| BA-phase | One sequential | The one active spec bot | N/A (others WAIT) |
| Dispatch-phase | One sequential | The one active dispatcher | N/A |
| Work-batch | One parallel batch, simultaneous start | Handles in the validated disjoint split | **Not until the batch settles** (DEAF) |
| `@` not in-flight | One-at-a-time (solo) | Named bot | N/A |
| `@` in-flight | Wait, then that bot after its `sendRequest` ends | Named bot | N/A |
| Master Send during Work-batch | **None** (no second run) | — | Copy `Work batch still running.` |

A **Work-batch** = assigned disjoint workers of **this** Work run (handles in the dispatcher split; **no reserved Dev1 / Dev2 / tester names**). Do **not** mix Debate propose/critique into a Work-batch. Do **not** start Work-batch until dispatch validated. Same-batch **DEAF** (stamped EB-3). QC-3 **that bot only**.

**Stop:** `botrider.chat.stop` / `chat/stop` cancels **all** in-flight tokens in this Work-batch. Existing Stop-during-stream: snapshot, **never implement**. No Stop-one in F8a (that is F8d).

Each `sendRequest` uses that bot’s MS-1 `modelId` via `vscode.lm` only.

---

## 4. Disjoint validate + union (WK-4 / WK-6)

### 4.1 Host validates; host never partitions

Dispatcher output names path sets per worker handle. Host checks:

- every assigned handle is a remaining **active** bot
- path sets are **pairwise disjoint**
- paths are workspace-relative (existing reject `..`, absolute outside, `.git/`)

Fail → no Work-batch. Dispatcher re-splits or Swarm note. Host **does not** rewrite the split.

### 4.2 Union Approve

After Work-batch settles, host unions file ops whose paths are still disjoint.

Overlap (same path claimed by more than one worker in the settled batch):

1. **DROP** that path from the union
2. Swarm note `Skipped {path} · collision`
3. path **absent** from `changeset/preview` / Approve
4. remaining disjoint ops still stage

No last-writer-wins. No whole-batch fail. No auto-Argue.

`hasPendingChanges` stays **false** until this settle. No `applyEdit` mid-batch. **BR-6 Files only after settle.** **ONE** Files Approve. One Files list. **MCP Grain B is a separate click** (existing §19 gate; not combined with Files).

---

## 5. SI + Event Bus reuse

SI-1 / SI-2 / SI-4 **held**. **SI-1 persists the whole Work run** (BA-phase → dispatch-phase → Work-batch → union Approve). Packets **APPEND**. Not reset between phases. Reload / run-end still clears. Never merge stores. Never restuff Swarm / HV into packs.

Work **reuses** the F7 in-process bus (EB-1). Publish at SI-2 moments even if Work-batch siblings are still in flight. Ingest only at batch settle (EB-3 / WK-5 DEAF).

**SI-3 reopened** for assigned Work-batch workers (this file) in addition to Debate-batch speakers (EB). BA-phase, dispatch-phase, `@` wait stay sequential.

Talk = SI-2 verbatim + OS-4 spec bodies when required. Tester (worker on test paths): **BA spec packets + assigned paths**. Same-batch deaf — does not see other workers until settle. Comparing worker output to spec is **F8d, not F8a**. Never lossy-summarize AC. HV is display only.

CM-4 `nodeIds` extras: omit stale, do not block, do not replace SI-2 bodies.

---

## 6. Protocol

**No Event Bus HostToUi / UiToHost members.** Bus stays host-internal.

Existing Swarm members paint articles: `chat/turn-start`, `chat/token`, `chat/turn-end`. Host **MAY** emit overlapping turns in a Work-batch. That is HV **display**, not talk.

Work | Debate is chrome on the existing composer. Send follows the toggle (`chat/send`). Do **not** add a role picker message.

Designation flags ride existing `bots/create` / `bots/update` / `bots/snapshot` (additive fields). Do not invent a Send-time designation port.

`chat/stop` still Stop-all for this Work-batch.

Do **not** reopen attach / model / export / OpenSpec chip / Context Map / §26 ports.

---

## 7. Out of this slice

F8b sequential Argue, F8c idle-bot follow-on, F8d Stop-one + comparing worker output to spec / tester second pass, N staged Approves, combining Files Approve with MCP Grain B, concurrent overlap writers, last-writer-wins, whole-batch fail on collision, auto-Argue, changing default Send to Work, treating Work as a Debate protocol, host-invented path partitions, reserved **Dev1 / Dev2 / tester** roles, name-matching or name-contains-`BA` spec/dispatcher, Save-time designation gate, per-Send role picker, blocking Save / New Bot for flags, sibling ingest inside a Work-batch, mutating in-flight `sendRequest`, `applyEdit` mid-batch / BR-6 Files before settle, merging `BotSession` stores, restuffing a global Swarm transcript / HV into packs, Event Bus chrome / packet rows / new sidebar / new Activity Bar icon, reopening §20–§26 / EB-1–4, F3 dashboard, F4 register, leftovers 002 / 003 / 009 / 014, hosted / `vscode.EventBus` / network bus, extra API keys, second runtime, Graphify, product code in this docs PR.

---

## 8. Tests (docs only — list them, do not write vitest)

Merge bar after PO allocates, on a **new product PR**:

- Work is a distinct run type; Debate default Send unchanged. (WK-1)
- Work reuses host in-process Event Bus; not `vscode.EventBus`; not network. (WK-1)
- Packets append; BotSession stores never merged; packs do not restuff HV / Swarm transcript. (WK-1)
- Save / New Bot succeeds with 0, 1, or 2 designation flags. (WK-2)
- Work Send with 0 or >1 active dispatcher or spec does not run Work; copy `Work needs one Dispatcher and one Spec.` (WK-2)
- Work Send with exactly one active dispatcher and one active spec starts BA-phase. (WK-2)
- Spec / dispatcher are flags, not name matching, not name-contains `BA`. (WK-2)
- SI-1 still present for the whole Work run; packets append; not reset between phases. (WK-1 / WK-6)
- BA-phase is sequential; other workers do not `sendRequest` yet. (WK-3)
- Dispatch-phase is one sequential dispatcher turn. (WK-4)
- Host rejects an overlapping / invalid split; Work-batch does not start; host does not invent a partition. (WK-4)
- Workers are handles in the dispatcher split from remaining active bots; no reserved Dev1 / Dev2 / tester names. (WK-4)
- Work-batch is parallel on disjoint paths; packs exclude sibling packets (DEAF / stamped EB-3) until settle. (WK-4)
- QC-3 overflow of one bot does not cancel siblings. (WK-4)
- In-flight `sendRequest` is not mutated. (WK-4)
- Tester = worker on test paths; pack is BA spec packets + assigned paths; does not see other workers until settle. (WK-5)
- Comparing worker output to spec does not run in F8a (F8d). (WK-5)
- Master Send during Work-batch does not start a second run; copy `Work batch still running.` (WK-5)
- `@` / assign / Stop available; `@` to a not-in-flight bot may run; `@` to an in-flight bot waits. (WK-5)
- BR-6 Files only after settle; `hasPendingChanges` false / no `applyEdit` until then. (WK-6)
- MCP Grain B Approve is a separate click from Files Approve. (WK-6)
- Overlapping paths dropped; note `Skipped {path} · collision`; remainder Approves. (WK-6)
- Stop aborts every in-flight `sendRequest` in this Work-batch. (WK-6)
- One Files list; §24 chips stay on Proposed Changes Files. (WK-6)
- Debate §26 composer-lock unchanged when the toggle is Debate. (WK-1 / §26)
- WM / QC / HV / MA / SD / TA / MS / SI-1/2/4 / EX / OS / CM / EB tests conceptually still pass.
