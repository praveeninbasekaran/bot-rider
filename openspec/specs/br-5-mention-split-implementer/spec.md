# BR-5 Mentions, split, implementer

## Purpose

`@handle` locks a language-only turn. Split locks the composer with Continue / Pick / Stop. A separate implementer pass emits fenced JSON `files[]`. Stop is `botrider.chat.stop` only. Acceptance follows architecture blueprint **revision 7**.

## SHALL requirements

### Mentions

1. A single known `@handle` SHALL lock that bot (`TurnKind` `direct`), even if inactive; the checkbox SHALL NOT flip. Copy: `{Name} is inactive · answering this turn only.` Chip: `SOLO · @{handle}`.
2. Unknown handle SHALL error `ErrorCode` `unknown-handle` with `No bot named @{handle}.` and SHALL NOT call Copilot.
3. Multiple `@` mentions SHALL error `ErrorCode` `multiple-mentions` (`Mention only one bot to lock a turn.`) and SHALL NOT call Copilot.
4. Invalid handle SHALL error without calling Copilot (`ErrorCode` `unknown-handle` or equivalent no-lm path).
5. The @ picker SHALL insert `@{handle}` plus a **trailing space**, never the display name.
6. After a solo reply, the last non-empty line SHALL be `NEED_EDIT` or `NO_EDIT` (optional trailing period stripped). Missing token = `NO_EDIT`. The trailer SHALL be stripped from the visible body. Only `NEED_EDIT` SHALL start the implementer for that bot.

### Split

7. Split SHALL lock the composer. Send SHALL be ignored while `splitOpen`. Helper: `Resolve the split to send a new prompt.`
8. Actions SHALL be Continue, Pick a Bot to Decide, and Stop. Stop SHALL be `botrider.chat.stop` (card posts `chat/stop`). There SHALL be no `split.stop`.
9. Titles: `No consensus` (votes) / `Debate paused` (Stop during stream). Stream Stop SHALL cancel, snapshot into Split, and SHALL NEVER implement. Split Stop SHALL end the run and unlock (`Stopped without implementation.`).
10. Pick SHALL implement that bot (`{Name}'s position selected as the direction.`).
11. Palette Stop when `botrider.debateRunning || botrider.splitOpen`. View-title Stop when `debateRunning`.

### Implementer

12. Implementer SHALL run ONLY from: unanimous `AGREE`, split/pick, or solo `NEED_EDIT`.
13. Implementer SHALL emit the first fenced block that JSON-parses with `files[]` (`json` tag optional). Extra prose dropped.
14. Shape: `{ "files": [{ "path", "op", "content"? }] }` with `op` `create` \| `update` \| `delete`. Delete has no content. Invalid op ⇒ `ErrorCode` `validate-failed`. Missing JSON ⇒ `parse-failed`.
15. Paths SHALL stay inside the workspace; reject `..`, absolute outside, `.git/` segments (`validate-failed`).
16. Debate/@ SHALL NOT be parsed as a changeset; file bodies dropped.

## Acceptance (architecture rev 7)

- GIVEN `@nobody hi`, THEN `unknown-handle`, no `sendRequest`.
- GIVEN `@alpha @beta`, THEN `multiple-mentions`, no `sendRequest`.
- GIVEN `@alpha` on an inactive bot, THEN a direct turn runs, checkbox stays off, trailer `NEED_EDIT` may implement, `NO_EDIT` does not.
- GIVEN splitOpen, WHEN the user Sends, THEN request count does not increase.
- GIVEN Stop mid-stream, THEN no implementer JSON is applied and split title is `Debate paused`.
- GIVEN implementer fenced `{ files: [{ path, op: "merge" }] }`, THEN `validate-failed`.
