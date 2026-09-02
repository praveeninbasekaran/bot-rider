# Bot Rider — F7 parallel / Event Bus / EB-1–4 (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR, QC, HV, MA, SD, TA, MS, SI-1/2/4, EX, OS, or CM. **Not** F3 dashboard / F4 register. Layers on frozen F7 isolation (SI-1/2/4 held) + F6 / F2 / F1.
Stories: **EB-1–4 is the full story set.** **EB-1** Event Bus is **host in-process only**. Not `vscode.EventBus`. Not network. Publish at existing SI-2 moments (turn-end / consensus / Pick) even if siblings still in flight. Subscribe remaining-turn + implementer. Not fan-out to inactive / done. **EB-2 (Q1)** Remaining propose speakers = one parallel `sendRequest` batch; then remaining critique = second batch. Do **not** mix propose + critique. A scheduling round = one parallel batch. Stop aborts all in-flight `sendRequest`. Composer locked until the batch settles. Continue = another parallel batch among remaining debate speakers of that phase. `@` solo. Vote / Split / implementer one-at-a-time. **EB-3** **No sibling packets inside the batch.** DROP stands even if a speaker has not started yet. Do **not** fold late-start ingest. Same-batch speakers do **NOT** hear each other until the phase ends. Full simultaneous start. In-flight `sendRequest` is never mutated. After a batch settles, remaining-turn bots + implementer **SHALL** ingest **every** packet from that batch **BEFORE** the next `sendRequest` starts. Critique is the talk step (all propose packets + own SI-1). Continue / later batches: same. No silent drop. QC-3 pack-overflow **that bot only**; siblings in the batch keep running. **EB-4** SI-1 persists the whole run (propose → critique → Continue / Split / Pick). Packets **APPEND** into the subscriber’s SI-1. Never merge `BotSession` stores. Never replace or wipe a bot’s own history when others speak. Never restuff a global Swarm transcript into packs. Not reset between batches. Reload / run-end still clears. BR-3 is not a session store. Talk = SI-2 verbatim (`requirements` / `decisions` / `constraints` / `openQuestions`) + OS-4 spec bodies. Never lossy-summarize AC. **HV is display only**, not the bot transcript / talk channel. Failed drafts unpublished. Implementer one JSON changeset after consensus / Pick, with the full packet set. SI-1/2/4 held. **SI-3 reopened** for Debate speakers in a batch. CM-4 `nodeIds` extras: omit stale, do not block, do not replace SI-2 bodies. Each bot MS-1 `modelId`. `vscode.lm` only. ₹0 extra keys. No new speaker cap.
UI chrome contract: `ui-ux-spec.md` §26 (addendum `ui-ux-parallel-stream.md`). Host is the talk-channel source of truth. HV overlap is display only.
Date: 2026-09-02.
Parent: `architecture-mvp.md`. Isolation: `architecture-bot-isolation.md` (SI-1/2/4 held; SI-3 reopened here). OpenSpec: `architecture-openspec-trace.md` (OS-4 bodies stay required talk). Pack: `architecture-token-save.md` (QC-3 unchanged; overflow **that bot only** in a batch). Context Map: `architecture-context-map.md` (CM-4 extras only). Copilot stays `vscode.lm`. ₹0 extra keys. No second runtime.

Split (when PO allocates; **do not allocate in this docs PR**): **Developer 1** host (in-process Event Bus, parallel debate batches, settle-then-ingest, SI-1 append). **Developer 2** §26 chrome (overlapping HV articles, `ROUND {n} · PROPOSE` / `CRITIQUE`, run-board in-flight chips, composer lock, Stop). QA after both, on a **new product PR** after this docs PR merges, **not stacked here**.

---

## Story map (EB-1–4)

EB-1–4 stay the set. No new stories.

### EB-1 Host in-process Event Bus

Event Bus is **host in-process only**. Not `vscode.EventBus`. Not network. Not a webview bus. Not a sidebar.

Publish at existing SI-2 moments: meaningful turn-end (propose / critique / direct that produced lasting content) **and** consensus / Pick — **even if siblings in the same batch are still in flight**.

Subscribe: bots with a remaining turn in this run + implementer. **Not** inactive. **Not** bots done for this run. **Not** fan-out to everyone.

Publishing a packet is **not** ingest. Same-batch speakers do **not** hear that packet until the phase / batch ends (EB-3).

### EB-2 Parallel debate batches (Q1)

Remaining **propose** speakers = one parallel `sendRequest` batch. After that batch settles, remaining **critique** speakers = a second parallel batch. Do **not** mix propose + critique in one batch. A scheduling round = one parallel batch of one `TurnKind`.

Stop (`botrider.chat.stop` / `chat/stop`) **aborts all** in-flight `sendRequest` in the batch. Composer **locked** until the batch settles.

Continue = another parallel batch among remaining debate speakers of that phase. If Continue starts a new propose / critique cycle (existing BR-5, same freeze), that is a propose batch then a critique batch — same Q1 rule.

**`@` solo.** One speaker. One article. Not a parallel batch.

**Vote / Split / implementer:** one-at-a-time. No overlapping `sendRequest`. Implementer emits **one** JSON changeset after consensus / Pick, packed with the **full** settled packet set (EB-4).

Full **simultaneous start** of a batch is the model. Host starts every remaining speaker of that phase together.

### EB-3 Settle-then-ingest (PO lock)

**No sibling packets inside the batch.** DROP stands even if a speaker has not started yet. Do **not** fold late-start ingest. There is **no MAY**.

Same-batch speakers do **NOT** hear each other until the phase ends.

Full simultaneous start. In-flight `sendRequest` is **never** mutated (no inbox splice, no pack restuff, no mid-flight prompt edit).

**SHALL:** after a batch settles, remaining-turn bots + implementer ingest **every** packet published from that batch **BEFORE** the next `sendRequest` starts.

Critique is the **talk step** for the prior propose batch: each remaining critique speaker’s pack = own SI-1 + **all** propose packets from the settled batch (verbatim SI-2 + required OS-4 bodies) + QC minimum pack.

Continue / later batches: same rule — ingest **all** settled packets from **prior** batches first. No silent drop.

QC-3 pack-overflow is **that bot only**. Siblings in the batch keep running. An overflowed bot still gets **no** sibling packets from this batch (DROP stands even if that bot never started).

### EB-4 SI-1 persist + talk channel

SI-1 persists the **whole run**: propose → critique → Continue / Split / Pick. **Not** reset between batches. Reload / run-end still clears (with ThreadStore / RunBoard). BR-3 is **not** a session store. Do **not** persist sessions to `BotRecord` / `globalState`.

Packets **APPEND** into the subscriber’s SI-1. Never merge `BotSession` stores. Never replace or wipe a bot’s own history when others speak. Never restuff a global Swarm transcript into packs.

**Talk** (what Copilot sees) = SI-2 verbatim (`requirements` / `decisions` / `constraints` / `openQuestions`) + OS-4 spec bodies. Never lossy-summarize acceptance criteria.

**HV is display only.** Visible Swarm articles are **not** the talk channel and **not** the bot transcript. Failed drafts unpublished (existing SI-2).

SI-1 / SI-2 / SI-4 **held**. **SI-3 reopened** only for Debate speakers in a batch. CM-4 `nodeIds` extras: omit stale, do not block, do not replace SI-2 bodies. Each bot uses its MS-1 `modelId` on its own `sendRequest`. `vscode.lm` only. ₹0 extra keys. No new speaker cap.

---

## 0. Non-negotiables

- **(EB-1)** Event Bus lives **inside the host process**. It is **not** `vscode.EventBus`, **not** a network / websocket / MCP bus, **not** a webview `postMessage` topic named Event Bus, **not** chrome.
- **(EB-1)** Publish at existing SI-2 moments (turn-end / consensus / Pick) **even if siblings still in flight**. Subscribe remaining-turn + implementer. **Not** fan-out to inactive / done / everyone.
- **(EB-1)** Publish ≠ ingest. A published packet waits until EB-3 settle-then-ingest.
- **(EB-2 / Q1)** Remaining propose speakers = one parallel `sendRequest` batch; then remaining critique = second batch. **Do not mix propose + critique.** A scheduling round = one parallel batch.
- **(EB-2)** Full **simultaneous start** of every remaining speaker in that batch.
- **(EB-2)** Stop aborts **all** in-flight `sendRequest`. Composer locked until the batch settles. Continue = another parallel batch among remaining debate speakers of that phase (or a new Q1 propose-then-critique cycle on BR-5 Continue).
- **(EB-2)** `@` solo. Vote / Split / implementer **one-at-a-time**. No overlap chrome for those paths (see §26).
- **(EB-2)** Implementer: **one** JSON changeset after consensus / Pick, with the **full** packet set ingested first (EB-3 + EB-4).
- **(EB-3) No sibling packets inside the batch.** DROP stands even if a speaker has not started yet. Do **not** fold late-start ingest. Same-batch speakers do **NOT** hear each other until the phase ends. **No MAY.**
- **(EB-3)** In-flight `sendRequest` is **never** mutated.
- **(EB-3) SHALL:** after a batch settles, remaining-turn bots + implementer ingest **every** packet from that batch **BEFORE** the next `sendRequest` starts. Critique is the talk step (all propose packets + own SI-1). Continue / later batches: ingest all settled packets from prior batches first. **No silent drop.**
- **(EB-3)** QC-3 pack-overflow = **that bot only**; siblings in the batch keep running. Copy stays §17.11 `Prompt doesn't fit Copilot`.
- **(EB-4)** SI-1 persists the whole run. Packets **APPEND**. Never merge `BotSession` stores. Never replace / wipe a bot’s own history when others speak. Never restuff a global Swarm transcript. Not reset between batches. Reload / run-end still clears. BR-3 is not a session store.
- **(EB-4)** Talk = SI-2 verbatim + OS-4 spec bodies. Never lossy-summarize AC. **HV is display only**, not the talk channel. Failed drafts unpublished.
- **(EB-4)** SI-1/2/4 held. **SI-3 reopened** for Debate speakers in a batch only. `@` / vote / Split / implementer stay sequential.
- **(EB-4)** CM-4 `nodeIds?: string[]` extras: omit unknown / stale; do **not** block the packet or the turn; do **not** replace SI-2 bodies. Incomplete graph is not QC-3.
- **(EB-4)** Each bot’s `sendRequest` uses that bot’s MS-1 `modelId` (empty / missing = host default that turn + visible copy; do not block). `vscode.lm` only. ₹0 extra keys. **No new speaker cap** — all remaining speakers of the phase are in the batch.
- Isolation chrome stays zero. Parallel chrome is §26 only. Do **not** reopen §20–§25. OpenSpec chips stay on Proposed Changes Files. Context Map unchanged.
- BR / QC / HV / MA / SD / TA / MS / SI-1/2/4 / EX / OS / CM frozen otherwise. Leftovers 002 / 003 / 009 / 014 out. F3 / F4 out. Marketplace / API keys / Settings Sync out.

---

## 1. Component

```
Run start
  BotSessionStore empty (session-only; SI-1 held)
  Event Bus empty (host in-process; not vscode.EventBus; not network)

Debate phase start (propose XOR critique)          ← EB-2 / Q1
  remaining speakers of THIS TurnKind
  pack EACH speaker NOW (simultaneous start):
    persona/system for THIS bot
    + this bot’s SI-1 (own history + packets already ingested)
    + QC board + LSP + tab paths + extras
    + OS-4 required bodies already required for this pack
    NOT sibling packets from this batch
    NOT HV articles
  TokenGovernor per bot:
    overflow → QC-3 that bot only; do not start that sendRequest
    siblings still start
  start ALL surviving sendRequest together
  in-flight sendRequest NEVER mutated
  no sibling packets inside the batch
  DROP stands even if a speaker has not started yet

Speaker turn-end (sibling may still be in flight)   ← EB-1 publish
  if meaningful: publish IsolationPacket at SI-2 moment
  enqueue for remaining-turn + implementer
  NOT fan-out to inactive / done
  NOT ingest yet (publish ≠ ingest)
  HV article paints in Swarm (display only)

Batch settles (all sendRequest in the batch ended, overflowed, or aborted)
  remaining-turn bots + implementer
    SHALL ingest EVERY packet from this batch
    APPEND into each subscriber’s SI-1
    never merge BotSession stores
    never replace / wipe that bot’s own history
  THEN the next sendRequest may start
    critique batch: talk = all propose packets + own SI-1
    later / Continue batches: ingest all settled packets from prior batches first
    implementer: full packet set, then one JSON changeset

@ solo / vote / Split / implementer
  one sendRequest at a time (SI-3 still sequential here)
  implementer after consensus / Pick only; full packet set already ingested

Stop (botrider.chat.stop)
  abort ALL in-flight sendRequest
  snapshot into Split; never implement

Reload / run clear / Approve|Reject end
  clear BotSessionStore + Event Bus with transcript / board
```

---

## 2. Event Bus (host) — EB-1

Host-internal. Not a VS Code API. Not a protocol member. Not chrome.

```ts
// Host-internal only. Do not add HostToUi / UiToHost Event Bus messages.
type EventBusPacket = IsolationPacket; // SI-2 shape; OS-4 specs[] + CM-4 nodeIds? extras unchanged

type EventBus = {
  // publish at SI-2 moments even if siblings still in flight
  publish(packet: EventBusPacket): void;
  // subscribers = remaining-turn + implementer (resolved at publish time)
  // ingest happens ONLY at batch settle (EB-3), never mid-flight
};
```

`IsolationPacket` stays the SI-2 type ([architecture-bot-isolation.md](./architecture-bot-isolation.md)):

```ts
type IsolationPacket = {
  id: string;
  fromBotId?: string; // omit for host/consensus
  at: 'turn-end' | 'consensus' | 'pick';
  requirements: string[];
  decisions: string[];
  constraints: string[];
  openQuestions: string[];
  specs?: { id: string; body: string }[]; // OS-4; omit when empty
  nodeIds?: string[]; // CM-4 extras only; omit unknown/stale; omit when empty
};
```

CM-4 `nodeIds` extras: omit stale, do **not** block, do **not** replace SI-2 bodies. Required talk is still the verbatim fields + OS-4 bodies (SI-4 / OS-4 / QC-3).

Do **not** name this `vscode.EventBus`. Do **not** invent a network topic. Do **not** expose packets as Swarm rows.

---

## 3. Batches (EB-2 / Q1)

| Path | `sendRequest` | Speakers hear siblings |
| --- | --- | --- |
| Debate **propose** (remaining) | One parallel batch, simultaneous start | **Not until the propose batch settles** |
| Debate **critique** (remaining) | Second parallel batch, after propose settled | **Not until the critique batch settles**; talk on start = all **prior** propose packets + own SI-1 |
| Continue (BR-5) | Another parallel batch among remaining debate speakers of that phase (or a new propose-then-critique cycle, same freeze) | Same settle-then-ingest |
| `@` solo | One-at-a-time | N/A (single speaker) |
| Vote (`consensus`) | One-at-a-time | Prior settled packets already ingested |
| Split chrome | No Copilot | — |
| Implementer | One-at-a-time, after consensus / Pick | Full packet set ingested first |

A **batch** = remaining speakers of **one** `TurnKind` (`propose` XOR `critique`). Do **not** mix.

A **scheduling round** = one parallel batch. Visible chrome still uses BR-4 round **n**: `ROUND {n} · PROPOSE` then, after that batch settles, `ROUND {n} · CRITIQUE`. No header that says “parallel”.

**Simultaneous start:** at batch open the host packs and starts every remaining speaker of that phase together. QC-3 overflow skips that bot’s `sendRequest` only. **No sibling packets inside the batch** — DROP stands even if a speaker has not started yet.

**Stop:** `botrider.chat.stop` / `chat/stop` cancels **all** in-flight tokens in the batch. Existing Stop-during-stream: snapshot into Split, **never implement**. Split Stop: end, composer unlocks. Split helper stays `Resolve the split to send a new prompt.`

**Composer:** locked until the **batch** settles (not per-article). Send ignored while the batch is in flight.

**No new speaker cap.** All remaining speakers of the phase are in the batch.

Each speaker’s `sendRequest` uses that bot’s MS-1 `modelId` via `vscode.lm` only.

---

## 4. Ingest lock (EB-3) — PO stamped

This section is the lock. Do **not** fold late-start ingest. Do **not** add a MAY.

### 4.1 No sibling packets inside the batch

**No sibling packets inside the batch.** DROP stands even if a speaker has not started yet.

Same-batch speakers do **NOT** hear each other until the phase ends.

Full simultaneous start. In-flight `sendRequest` is never mutated.

### 4.2 SHALL settle-then-ingest

After a batch **settles** (every `sendRequest` in that batch ended, overflowed, or aborted):

1. Remaining-turn bots + implementer **SHALL** ingest **every** packet published from that batch.
2. Ingest **APPENDS** into each subscriber’s SI-1 (EB-4).
3. **THEN** the next `sendRequest` may start.

**Critique is the talk step** for the propose batch: all propose packets + own SI-1. No silent drop of a published packet.

**Continue / later batches:** ingest all settled packets from **prior** batches first, then start.

Failed drafts stay unpublished (SI-2). Stop / Reject / failed turn: do **not** publish a packet that would carry failed drafts as requirements. Unpublished ≠ silent drop of a packet that **was** published.

### 4.3 QC-3 in a batch

If required packets + QC minimum pack cannot fit for **one** bot at the start of **that bot’s** `sendRequest`:

- existing QC-3 `error` `code: 'pack-overflow'`
- copy stays §17.11 `Prompt doesn't fit Copilot`
- **no** `sendRequest` for **that bot**
- **no** silent drop of required packets to sneak a call
- siblings in the batch **keep running**
- that bot still has **no sibling packets** from this batch (DROP stands even if it never started)
- composer stays **locked** until the **batch** settles (`@` solo overflow keeps today’s QC-3 “composer enabled” — `@` is not a parallel batch)

---

## 5. SI-1 persist + talk (EB-4)

**Persist whole run.** One `BotSession` per bot for propose → critique → Continue / Split / Pick. Not reset between batches. Reload / run-end / Approve|Reject-clear still empties the store with the transcript and board.

**APPEND, never replace.** Ingested packets become additional structured user messages on **that** subscriber’s SI-1. Do **not** merge two `BotSession` stores. Do **not** replace or wipe a bot’s own history because a sibling spoke. Do **not** restuff ThreadStore / HV articles / a global Swarm transcript into packs.

**Talk channel** (Copilot pack):

- SI-2 verbatim `requirements` / `decisions` / `constraints` / `openQuestions`
- OS-4 spec bodies when required (cited surviving ids ∪ exact catalog ids in this Send)
- that bot’s own SI-1 history
- QC minimum pack (board + slice-or-implementer-files + tab paths + prompt)

**Not talk:** HV articles, Swarm chrome, Event Bus (there is no Event Bus chrome), Context Map canvas, packet rows.

Never lossy-summarize acceptance criteria. Failed drafts unpublished.

Implementer: one JSON changeset after consensus / Pick. Pack includes the **full** packet set (every published packet this run that the implementer subscribed to). PatchParser / BR-6 unchanged.

---

## 6. Protocol

**No new Event Bus HostToUi / UiToHost members.** Isolation + Event Bus stay host-internal.

Existing Swarm members already paint articles: `chat/turn-start`, `chat/token`, `chat/turn-end`. Host **MAY** emit overlapping turn-start / token / turn-end for Debate speakers in one batch. That is HV **display**, not talk.

Run-board in-flight chips (§26) **MAY** derive from outstanding `chat/turn-start` without `chat/turn-end` (one static ● / chip per handle). Do **not** invent packet rows. Do **not** move Approve / MCP / packets / OpenSpec onto the board.

`chat/stop` still Stop. Split helper unchanged.

Do **not** reopen attach / model / export / OpenSpec chip / Context Map ports.

---

## 7. SI-3 reopen (isolation hold)

[architecture-bot-isolation.md](./architecture-bot-isolation.md) **SI-1 / SI-2 / SI-4 held.**

**SI-3 reopened** for Debate speakers in a batch: concurrent `sendRequest` is allowed **only** for remaining propose-xor-critique speakers in that batch (this file).

Still sequential (one `sendRequest` at a time): `@` solo, vote, Split (no Copilot), implementer.

Visible Swarm stays HV prose. Isolation itself still has zero chrome. Parallel chrome is §26.

Ingest next-pack **after batch settle**, never mid-flight. Append into SI-1, never replace.

---

## 8. Out of this slice

Sibling packets inside a batch (including when a speaker has not started), mutating in-flight `sendRequest`, mixing propose + critique in one batch, merging `BotSession` stores, replacing / wiping a bot’s own history, restuffing a global Swarm transcript / HV articles into packs, resetting SI-1 between batches, persisting sessions to BR-3 / `globalState`, Event Bus chrome / packet rows / new sidebar / new Activity Bar icon, a header that says “parallel”, moving Approve / MCP / packets / OpenSpec onto the run board, reopening §20–§25, F3 dashboard, F4 register, leftovers 002 / 003 / 009 / 014, `vscode.EventBus`, network Event Bus, non-`vscode.lm` models, extra API keys, a new speaker cap, Graphify-as-vendor, product code in this docs PR.

---

## 9. Tests (docs only — list them, do not write vitest)

Merge bar after PO allocates, on a **new product PR**:

- Event Bus is host-in-process; not `vscode.EventBus`; not network; no Event Bus HostToUi. (EB-1)
- Publish at turn-end / consensus / Pick even while a sibling `sendRequest` is in flight. (EB-1)
- Inactive / done bots are not subscribers. Not fan-out to everyone. (EB-1)
- Remaining propose speakers share one parallel batch; critique starts only after propose settled; no mixed batch. (EB-2)
- Full simultaneous start: no speaker in the batch is packed after a sibling in that batch has already published. (EB-2 / EB-3)
- `@` / vote / Split / implementer never overlap `sendRequest`. (EB-2)
- Implementer runs after consensus / Pick with the full packet set; one JSON changeset. (EB-2 / EB-4)
- Stop cancels every in-flight `sendRequest` in the batch. (EB-2)
- Composer locked until the batch settles. (EB-2)
- Same-batch speakers’ packs do **not** include sibling packets from that batch, including when a speaker has not started. (EB-3)
- In-flight `sendRequest` is not mutated when a sibling publishes. (EB-3)
- After settle, remaining-turn + implementer packs include **every** packet from that batch before the next `sendRequest`. (EB-3)
- Critique is the talk step: pack includes all propose packets + own SI-1. (EB-3 / EB-4)
- Continue / later batch ingests all settled packets from prior batches first. (EB-3)
- No silent drop of a published packet. (EB-3)
- QC-3 overflow of one bot does not cancel siblings; that bot still has no sibling packets from the batch. (EB-3)
- SI-1 still present at critique / Continue / Split / Pick; not reset between batches. (EB-4)
- Ingest appends; subscriber’s own history is not replaced or wiped. (EB-4)
- BotSession stores are never merged. (EB-4)
- Packs do not restuff HV articles or a global Swarm transcript. (EB-4)
- Talk fields are SI-2 verbatim + OS-4 bodies; AC is not lossy-summarized. (EB-4)
- Failed drafts unpublished. (EB-4)
- CM-4 stale `nodeIds` omitted; turn not blocked; SI-2 bodies unchanged. (EB-4)
- Each parallel `sendRequest` uses that bot’s MS-1 `modelId`. (EB-4)
- Reload / run-end clears SI-1; BR-3 / `BotStoreFile.version` unchanged. (EB-4)
- WM / QC / HV / MA / SD / TA / MS / SI-1/2/4 / EX / OS / CM tests conceptually still pass.
