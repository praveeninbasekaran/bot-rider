# Bot Rider — UI/UX addendum: F7 parallel stream

Fold into `ui-ux-spec.md` as **§26**. Additive Swarm chrome for overlapping HV articles during a parallel Debate batch. Do **not** reopen §20 Attach, §22 model picker, §23 export/import, §24 OpenSpec chips, or §25 Context Map. Not a new sidebar. Not a new Activity Bar icon. Not Event Bus chrome.

Architecture: [architecture-event-bus.md](./architecture-event-bus.md). Additive. **EB-1–4 locked.** Host Event Bus is **not** painted. HV is **display only**, not the talk channel. Talk stays SI-2 verbatim + OS-4 spec bodies (host). Same-batch speakers do **not** hear each other until the phase ends — chrome must not imply that they do.

## 26. Parallel Debate stream (F7)

**Status:** Additive after §25. **EB-1–4 locked** (host). This file is chrome only. Not a fourth view. Not Event Bus chrome. Not packet rows. Not a new sidebar. Not a new Activity Bar icon. Not token chrome. Not F3 / F4. Not leftovers 002/003/009/014. Do **not** reopen §20 / §22 / §23 / §24 / §25.

OpenSpec chips stay on Proposed Changes **Files** rows (§24). Context Map unchanged (§25).

### 26.1 Surfaces

Same Swarm surfaces as today: sidebar `botRider.chat` and Expand `botRider.chatPanel`. Same component, same thread.

| Surface | Parallel chrome |
| --- | --- |
| Swarm thread (sidebar + Expand) | HV articles **MAY overlap** during a parallel Debate batch |
| Round header | `ROUND {n} · PROPOSE` then, after propose settled, `ROUND {n} · CRITIQUE` |
| `@` | Single article. No overlap chrome |
| Vote / Split / implementer | No overlap chrome |
| Run board | **MAY** show multiple in-flight speakers (one static ● / chip per handle) |
| Proposed Changes / MCP / OpenSpec chips / Context Map | Unchanged. Do **not** move onto the board |

**No Event Bus chrome.** Do not paint the bus, packet ids, inbox counts, or subscriber lists. Do not add packet rows to the thread.

**HV is display only.** Overlapping articles are what the user reads. They are **not** the talk channel and **not** the bot transcript. Host talk remains SI-2 + OS-4 (see host lock).

### 26.2 Overlap (Debate batch only)

During a parallel Debate batch (remaining propose **or** remaining critique — never mixed), more than one HV article **MAY** stream at once.

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
ROUND {n} · CRITIQUE
```

`{n}` is the existing BR-4 round number. Do **not** invent `ROUND {n} · PARALLEL`. Do **not** show both PROPOSE and CRITIQUE as the live header at once. Critique header appears only after propose settled.

Split title / Stopped / Pick copy unchanged (§ copy deck).

### 26.4 Run board in-flight

The Run board **MAY** show multiple in-flight speakers while a Debate batch is running: **one static ● / chip per handle**.

- Derive from outstanding `chat/turn-start` without `chat/turn-end` (or equivalent host run-state the UI already has).
- Static. Do **not** animate a chase. Do **not** show tokens / packet text on the chip.
- Label `@{handle}` (never display name as the identity).
- Omit the region when only one speaker is in flight if the existing current-todo ● already covers it; showing one chip is allowed.

Do **not** move Approve, MCP actions, isolation packets, or OpenSpec chips onto the board. Those stay Proposed Changes / Grain B / host-internal / §24 Files rows.

Board anatomy otherwise unchanged (§17). Dissents stay Split-only. Clicking a chip is a no-op.

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

Per-article live regions. **≤ 1 announce / 2 seconds / article.**

Do **not** use a single thread-wide live region that announces every sibling token. Overflow / Stop / Split announcements stay existing polite patterns; do not stack them onto every streaming article.

Round header change (`PROPOSE` → `CRITIQUE`) may announce once when the propose batch settles.

In-flight chips: text includes `@{handle}`. Glyph `aria-hidden` if a ● is decorative.

### 26.8 Protocol consume

No new Event Bus protocol members. Consume existing `chat/turn-start` / `chat/token` / `chat/turn-end` / `chat/stop` / `run/state` / `chat/board` / `error`.

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
