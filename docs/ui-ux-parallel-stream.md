# Bot Rider — UI/UX addendum: F7 parallel stream

Fold into `ui-ux-spec.md` as **§26**. Additive Swarm chrome for overlapping HV articles during a parallel Debate batch. Do **not** reopen §20 Attach, §22 model picker, §23 export/import, §24 OpenSpec chips, or §25 Context Map. Not a new sidebar. Not a new Activity Bar icon. Not Event Bus chrome.

Architecture: [architecture-event-bus.md](./architecture-event-bus.md). Additive. **EB-1–4 locked.** Host Event Bus is **not** painted. HV is **display only**, not the talk channel. Talk stays SI-2 verbatim + OS-4 spec bodies (host). Same-batch speakers do **not** hear each other until the phase ends — chrome must not imply that they do.

## 26. Parallel Debate stream (F7)

**Status:** **EB-1–4 and PU-5 shipped.** This file is chrome only. Not a fourth view. Not Event Bus chrome. Not packet rows. Not a new sidebar. Not a new Activity Bar icon.

OpenSpec chips stay on Proposed Changes **Files** rows (§24). Context Map unchanged (§25).

### 26.1 Surfaces

Same Swarm surfaces as today: sidebar `botRider.chat` and Expand `botRider.chatPanel`. Same component, same thread.

| Surface | Parallel chrome |
| --- | --- |
| Swarm thread (sidebar + Expand) | HV articles **MAY overlap** during a parallel Debate batch |
| Round header | `ROUND {n} · PROPOSE`, one synthesis card, then `ROUND {n} · OBJECTION` |
| `@` | Single article. No overlap chrome |
| Vote / Split / implementer | No overlap chrome |
| Activity | One compact keyed timeline distinguishes blocked, queued, in-flight, completed, and failed work |
| Proposed Changes / MCP / OpenSpec chips / Context Map | Unchanged. Do **not** move onto the board |

**No Event Bus chrome.** Do not paint the bus, packet ids, inbox counts, or subscriber lists. Do not add packet rows to the thread.

**HV is display only.** Overlapping articles are what the user reads. They are **not** the talk channel and **not** the bot transcript. Host talk remains SI-2 + OS-4 (see host lock).

### 26.2 Overlap (Debate batch only)

During a parallel Debate batch (remaining proposals or targeted objections — never mixed), more than one HV article **MAY** stream at once. Bot prose defaults to a collapsed native-button disclosure. Expanding responses is capped by `botrider.maxVisibleArticles`; collapsing never deletes transcript data.

Each article stays that bot’s bubble (`@{handle}`, color + initials). Existing `chat/turn-start` / `chat/token` / `chat/turn-end` members. Host **MAY** emit overlapping turns.

Do **not** merge bubbles. Do **not** restyle into a README. Host-stripped article text stays source of truth (§18).

`@` stays one article. Vote, Split card, and implementer stay one-at-a-time visually. No overlap chrome on those paths.

### 26.3 Round headers

Exact chrome (no “parallel” word):

```
ROUND {n} · PROPOSE
```

After the propose batch **settles**:

```
ROUND {n} · OBJECTION
```

`{n}` is the Debate cycle number. Do **not** invent `ROUND {n} · PARALLEL`. Render exactly one current synthesis card and one terminal decision card; replay replaces these keyed cards instead of duplicating them.

Split title / Stopped / Pick copy unchanged (§ copy deck).

### 26.4 Compact activity timeline

The Swarm shows one compact activity row per bot. A keyed merge replaces duplicate chips and distinguishes blocked, queued, retrying/in-flight, completed, and failed states from Run Board, scheduler, and run messages.

- Derive state from `chat/turn-start` / `chat/turn-end`, Run Board todos, scheduler snapshots, and terminal errors.
- Static. Do **not** animate a chase or show tokens / packet text.
- Label `@{handle}`. Activating a row focuses and expands the corresponding disclosure when present.

Do **not** move Approve, MCP actions, isolation packets, or OpenSpec chips onto the board. Those stay Proposed Changes / Grain B / host-internal / §24 Files rows.

Board anatomy otherwise remains unchanged (§17). Dissents stay Split-only.

### 26.5 Composer and Stop

Composer is **locked** until the **batch** settles. Send ignored while any Debate-batch `sendRequest` is in flight.

**Stop** = `botrider.chat.stop` / `chat/stop` only (no `split.stop`). Card Stop posts `chat/stop`. Stop **aborts all** in-flight streams in the batch.

Split helper (unchanged):

```
Resolve the split to send a new prompt.
```

Continue / Pick / Stop on Split stay the existing three actions. Continue starts the next host batch (host lock); chrome does not say “parallel”.

`@` solo overflow keeps today’s QC-3 composer-enabled behavior (`@` is not a parallel batch). During a Debate batch, composer stays locked until the batch settles even if one sibling QC-3s.

### 26.6 Pack overflow

Unchanged QC-3 thread error. Exact copy (§17.11):

```
Prompt doesn't fit Copilot
The minimum context for this turn is larger than Copilot's window.
Shorten the prompt or shrink the active editor. Required context was not dropped.
```

`error` `code: 'pack-overflow'`. Thread error block on **that bot**. Siblings in the batch keep running (host). No pre-Send modal. No silent skip. No Event Bus / packet chrome on the error.

### 26.7 Accessibility

Article-local live regions are disabled. One serialized, adjacent-deduplicated announcement queue owns the polite live region so concurrent streams cannot talk over one another.

Round header change (`PROPOSE` → `OBJECTION`) may announce once when the proposal batch settles.

In-flight chips: text includes `@{handle}`. Glyph `aria-hidden` if a ● is decorative.

### 26.8 Protocol consume

No Event Bus protocol members are exposed. Consume `chat/turn-start` / `chat/token` / `chat/turn-end` / `chat/synthesis` / `chat/decision` / `chat/stop` / `run/state` / `chat/board` / `copilot/scheduler` / `ui/preferences` / `error`.

UI never calls `vscode.lm`. UI never paints packets. UI never implies same-batch bots have ingested each other.

### 26.9 Out

Event Bus chrome · packet rows · packet inbox UI · new sidebar · new Activity Bar icon · “parallel” header · overlap chrome on `@` / vote / Split / implementer · moving Approve / MCP / packets / OpenSpec onto the run board · reopening §20 / §22 / §23 / §24 / §25 · F3 dashboard · F4 register · leftovers 002/003/009/014 · Graphify vendor UI · token/quota chrome · a live region that announces more than once per 2s per article.

### 26.10 Copy exact

| Key | Copy |
| --- | --- |
| Propose header | `ROUND {n} · PROPOSE` |
| Critique header | `ROUND {n} · CRITIQUE` |
| Split helper | `Resolve the split to send a new prompt.` |
| Pack overflow | `Prompt doesn't fit Copilot` (full §17.11 block) |
