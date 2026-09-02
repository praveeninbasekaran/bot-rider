# Bot Rider — F7 isolation / SI-1–4 (additive slice, host-only)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR, QC, HV, MA, SD, TA, or MS. **SI-1 / SI-2 / SI-4 held.** **SI-3 reopened** for Debate speakers in a batch — [architecture-event-bus.md](./architecture-event-bus.md). Isolation itself is still host-only, zero chrome.
Stories: **SI-1–4 is the full story set.** **SI-1** Per-bot session store: each bot `LanguageModelChatMessage[]` (system + its turns + controlled ingest). No global swarm transcript in every pack. Session-only. BR-3 unchanged. Persists the whole run (propose → critique → Continue / Split / Pick). Packets **APPEND**; never merge `BotSession` stores; never replace. **SI-2** Controlled ingest: structured packets (requirements, decisions, constraints, open questions) verbatim. Drop banter + failed drafts only. Never lossy-summarize acceptance criteria. Publish: end of each meaningful bot turn AND consensus/Pick. Downstream: bots with a remaining turn (including prior speakers if they speak again) + implementer. Not inactive. Not fan-out to everyone. Ingest next-pack **after batch settle**, never mid-flight. **SI-3** Reopened for Debate speakers in a batch (parallel `sendRequest`). `@` / vote / Split / implementer stay one-at-a-time. Visible Swarm full HV prose. Parallel chrome is §26, not this file. MS/TA/HV/MA/SD/QC otherwise frozen. **SI-4** TokenGovernor may trim extras silent. Required published packets must not be silently cut; minimum pack miss → QC-3 pack-overflow, no Copilot call.
**Zero new UI for isolation.** No `ui-ux-bot-isolation.md`. Parallel chrome is `ui-ux-spec.md` §26 / `ui-ux-parallel-stream.md`. Do **not** reopen §20 / §22. Visible Swarm stays HV. Host-only isolation.
Date: 2026-09-01. SI-3 reopen: 2026-09-02.
Parent: `architecture-mvp.md`. Parallel: `architecture-event-bus.md` (EB-1–4). Pack: `architecture-token-save.md` (QC minimum pack unchanged except required published packets must not be silently trimmed). HV / MA / WM / TA / MS untouched for isolation chrome. Copilot stays `vscode.lm`. ₹0 extra keys. No second runtime.

Split (when PO allocates; **do not allocate in this docs PR**): **Developer 1** host (`BotSessionStore`, publish / ingest, pack wiring, TokenGovernor required-packet rule). **Developer 2** — none expected (zero chrome). Only if a chrome gap appears. QA after host, on a **new product PR**, not stacked on this docs PR.

---

## Story map (SI-1–4)

SI-1–4 stay the set. No new stories.

### SI-1 Per-bot session store

Each bot `LanguageModelChatMessage[]` (system + its turns + controlled ingest). No global swarm transcript in every pack. Session-only. BR-3 unchanged. Persists the whole run. Packets **APPEND** into that bot’s session. Never merge `BotSession` stores. Never replace or wipe a bot’s own history when others speak.

### SI-2 Controlled ingest

Structured packets (requirements, decisions, constraints, open questions) verbatim. Drop banter + failed drafts only. Never lossy-summarize acceptance criteria.

Publish: end of each meaningful bot turn AND consensus/Pick.

Downstream: bots with a remaining turn (including prior speakers if they speak again) + implementer. Not inactive. Not fan-out to everyone. Ingest next-pack **after batch settle**, never mid-flight.

### SI-3 Reopened for Debate speakers in a batch

Debate speakers in a batch: concurrent `sendRequest` allowed — [architecture-event-bus.md](./architecture-event-bus.md). `@` / vote / Split / implementer stay one-at-a-time. Same-batch speakers do **not** hear each other until the phase ends. Visible Swarm full HV prose. Isolation chrome still zero. MS/TA/HV/MA/SD/QC otherwise frozen.

### SI-4 TokenGovernor

May trim extras silent. Required published packets must not be silently cut; minimum pack miss → QC-3 pack-overflow, no Copilot call.

---

## 0. Non-negotiables

- **(SI-1)** Each bot has its own in-memory session: `LanguageModelChatMessage[]` (system / persona + that bot’s own turns + ingested packets). Session-only: reload / end of run clears with the Swarm transcript. BR-3 unchanged (do not persist sessions to `BotRecord` / `globalState`).
- **(SI-1)** Host does **not** restuff the full global Swarm transcript into every Copilot pack (QC already stopped that; this slice formalizes per-bot history + handoffs).
- **(SI-1 held)** SI-1 persists the whole run (propose → critique → Continue / Split / Pick). **Not** reset between batches. Packets **APPEND** into the subscriber’s SI-1. Never merge `BotSession` stores. Never replace or wipe a bot’s own history when others speak.
- **(SI-2)** Controlled publish of structured packets only. Fields: `requirements`, `decisions`, `constraints`, `openQuestions` (host-owned strings / lists). **Verbatim.** Drop debate banter and failed drafts only. Never lossy-summarize away acceptance criteria.
- **(SI-2)** Publish at end of each meaningful bot turn (propose / critique / direct that produced lasting content) AND on consensus / Pick.
- **(SI-2)** Downstream receivers: bots that still have a remaining turn (including ones that already spoke if they will speak again) + implementer. Not inactive. Not bots that are done for this run. **Not fan-out to everyone.**
- **(SI-2 held)** Ingest next-pack **after the batch settles**, never mid-flight. Same-batch speakers do **not** hear each other until the phase ends. **No sibling packets inside the batch.** DROP stands even if a speaker has not started yet — [architecture-event-bus.md](./architecture-event-bus.md).
- **(SI-3 reopened)** Debate speakers in a batch: concurrent `sendRequest` allowed (Event Bus / EB-1–4). `@` / vote / Split / implementer stay one `sendRequest` at a time. In-flight `sendRequest` is never mutated.
- **(SI-3)** Visible Swarm stays full HV prose. No new Swarm chrome **for isolation**. Parallel chrome is §26. No tree / form chrome. No fourth sidebar. MS / TA / HV / MA / SD / QC otherwise frozen.
- **(SI-4)** TokenGovernor: attachment / MCP-style extras still trim silent first. **Required published packets for this turn are NOT silent extras.** If they cannot fit with prompt + board + (LSP slice OR implementer files) + tab paths → existing QC-3 `error` `code: 'pack-overflow'`, no `sendRequest` / no Copilot call, composer enabled.
- BR frozen otherwise (SI-1: BR-3 unchanged). Leftovers 002 / 003 / 009 / 014 out. Graphify out.

---

## 1. Component

```
Run start
  BotSessionStore empty (session-only)

Bot turn end (propose|critique|direct meaningful) OR consensus|Pick
  host builds IsolationPacket { requirements, decisions, constraints, openQuestions }
    from RunBoard + host decisions + that turn’s lasting facts
    NOT from raw Swarm banter; NOT lossy summary of acceptance criteria
  publish packet → enqueue for each downstream bot (remaining turns + implementer)
    NOT fan-out to everyone; NOT inactive; NOT bots done for this run

Next pack (after batch settle — never mid-flight)
  remaining-turn + implementer ingest EVERY packet from the settled batch
  packets APPEND into that bot’s SI-1 (never replace; never merge stores)
  pack = persona/system for THIS bot
        + this bot’s session history (its prior messages)
        + ingested packets queued for this bot (verbatim)
        + QC board + LSP/implementer + tab paths + extras (attachments/MCP)
  TokenGovernor:
    trim silent extras first
    required packets stay; if min pack + required packets miss → pack-overflow
  Debate batch: parallel sendRequest among remaining speakers of that phase
    (see architecture-event-bus.md; same-batch speakers do not hear each other yet)
  @ / vote / implementer: sendRequest one at a time
  append this bot’s user/assistant messages to ITS session only

Reload / run clear / Approve|Reject end
  clear BotSessionStore with transcript/board
```

---

## 2. Types (host) — SI-1

```ts
type IsolationPacket = {
  id: string;
  fromBotId?: string; // omit for host/consensus
  at: 'turn-end' | 'consensus' | 'pick';
  requirements: string[];
  decisions: string[];
  constraints: string[];
  openQuestions: string[];
};

// Per-bot session — NOT persisted to BotRecord / globalState
type BotSession = {
  botId: string;
  messages: PromptMessage[]; // or LanguageModelChatMessage-shaped host DTOs
  inbox: IsolationPacket[];  // awaiting ingest into next pack
};
```

Do **not** bump `BotStoreFile.version`. Sessions are not BR-3. Not on `BotRecord`. Not `globalState`. Clear with ThreadStore / RunBoard on reload / run end.

Optional CM-4 extra: published SI packets MAY carry additive `nodeIds?: string[]` when a packet maps to a Context Map code node. Omit unknown/stale ids. Do **not** replace SI-2 verbatim bodies. Do **not** block the packet or the turn. See [architecture-context-map.md](./architecture-context-map.md).

---

## 3. Publish rules (SI-2)

Host extracts packet fields from:

- RunBoard goal / todos / decisions / dissents / files (host facts)
- Explicit lasting outcomes of the turn (e.g. AGREE / NEED_EDIT trailers already host-parsed — keep as decisions / constraints, not raw banter)
- User Send / Pick direction

Do **not** paste the full HV article into `requirements`. Do **not** invent sections. Empty arrays allowed if nothing new.

Publish moments:

1. End of meaningful propose / critique / direct turn
2. Consensus
3. Pick a bot (post-split)

Stop / Reject / failed turn: do **not** publish a packet that would carry failed drafts as requirements.

---

## 4. Downstream (SI-2)

When publishing, enqueue a copy (or id-ref) for:

- Every active bot that still has a remaining speak slot in this sequential run (including prior speakers who will speak again)
- The implementer when implementation will run

Do **not** enqueue for inactive bots (unless this-turn `@` solo — that bot is the downstream). **Not fan-out to everyone.**

Ingest inbox packets into that bot’s session as structured user messages (verbatim field text) **after the batch settles**, **BEFORE** the next `sendRequest` starts — never mid-flight. **No sibling packets inside the batch.** DROP stands even if a speaker has not started yet. **APPEND** into SI-1; never replace; never merge `BotSession` stores. Then clear those from inbox. See [architecture-event-bus.md](./architecture-event-bus.md).

---

## 5. Pack / TokenGovernor (SI-4 + QC)

Minimum pack unchanged from QC-2 except: ingested **required** isolation packets for this turn join the required set (not silent-trim extras). Required OpenSpec spec bodies (OS-4, [architecture-openspec-trace.md](./architecture-openspec-trace.md)) join that required set like published packets.

Trim order on overflow:

1. Silent extras (MCP payload size, attachment extras, vote compact) — unchanged
2. Never silently drop required isolation packets or board / slice / implementer files / tab paths / prompt
3. If still over → pack-overflow (QC-3); no Copilot call (`sendRequest`)

No restuff of full ThreadStore transcript into packs (SI-1).

QC-3 location lock unchanged: visible Swarm thread `error` `code: 'pack-overflow'`, no `sendRequest`, no silent retry, composer stays enabled. Do **not** drop required packets (or the LSP slice) and still call.

---

## 6. Protocol (isolation — zero chrome)

**No new HostToUi / UiToHost required for isolation** (zero chrome). Isolation is host-internal.

Optional: none. Do not invent Swarm rows for packets. Do not add a fourth sidebar, tree row, or form control.

Visible Swarm stays full HV prose. **SI-3 reopened** for Debate speakers in a batch — [architecture-event-bus.md](./architecture-event-bus.md). Parallel chrome is §26, not this file.

---

## 7. Out of this slice

New isolation UI / packet rows, fourth sidebar, tree / form changes, reopening §20 / §22, lossy summarizer that drops acceptance criteria, silent trim of required packets, fan-out to everyone / inactive bots, persisting sessions to disk, merging `BotSession` stores, replacing a bot’s own history, sibling packets inside a batch, mutating in-flight `sendRequest`, Graphify, leftovers 002 / 003 / 009 / 014, F6 export / import, BR / QC / HV / MA / SD / TA / MS product rewrites.

F7 parallel / Event Bus is **not** out — it is [architecture-event-bus.md](./architecture-event-bus.md) (this file holds SI-1/2/4 and reopens SI-3).

---

## 8. Tests (docs only — list them, do not write vitest)

Merge bar after PO allocates, on a **new product PR**:

- Each bot’s Copilot pack does not include other bots’ full HV articles as transcript restuff. (SI-1)
- Sessions are session-only; BR-3 / `BotStoreFile.version` unchanged. (SI-1)
- Published packet fields appear verbatim in downstream bot packs. (SI-2)
- Banter / failed drafts are not published as requirements. (SI-2)
- Inactive bots do not receive inbox packets. Not fan-out to everyone. (SI-2)
- Implementer receives packets before implement pack. (SI-2)
- Debate batch: overlapping `sendRequest` only among remaining speakers of that phase; `@` / vote / implementer stay sequential. (SI-3 reopened)
- Ingest after batch settle, never mid-flight; packets append, never replace. (SI-1 / SI-2 held)
- Visible Swarm still full HV prose; isolation adds no UI protocol members. (SI-3)
- Required packets that cannot fit → pack-overflow; no Copilot call. (SI-4)
- Attachment extras still trim silent. (SI-4)
- Reload clears sessions.
- WM / QC / HV / MA / SD / TA / MS tests conceptually still pass.
