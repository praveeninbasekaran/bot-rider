# BR-4 Debate & Decide

## Purpose

Default Send freezes active bots and runs a capped language debate: sequential propose then critique for two rounds, then `AGREE` \| `DISSENT`. No auto round 3. Acceptance follows architecture blueprint **revision 7**.

## SHALL requirements

1. One orchestrator run SHALL never overlap `sendRequest`. One CTS per run.
2. At RunStarted the host SHALL freeze active bots (`frozenBotIds`) in stable list order and SHALL keep that freeze on split and Continue.
3. Rounds 1–2 SHALL each: Propose each frozen bot, Critique each, then vote (`TurnKind` `propose` \| `critique` \| `consensus`).
4. Vote: the first token SHALL be `AGREE` or `DISSENT` (case-insensitive); the rest is reason; unparseable SHALL count as `DISSENT`.
5. If all votes are `AGREE`, the implementer SHALL be the first frozen bot (then BR-5 / BR-6). Else the host SHALL open a split. There SHALL be no automatic round 3.
6. Continue (`botrider.split.continue`) SHALL run one more propose/critique/vote round on the **same freeze**.
7. Debate turns SHALL be language-only. PatchParser SHALL drop file bodies on debate. Stop SHALL never implement.
8. Workspace context SHALL include the full active editor + selection and **paths only** of other tabs.
9. Prompt order SHALL be: (1) persona+role+instructions (2) workspace (3) history Assistant(text, handle) (4) turn instruction. Drop oldest history first; never drop persona.
10. Zero active bots on a default Send (no single `@` lock) SHALL error with `ErrorCode` `zero-active` and SHALL NOT call Copilot.
11. No workspace folder SHALL error with `ErrorCode` `no-workspace`.
12. `RunStateDto.debateRunning` SHALL be true while streaming turns. Stop during debate SHALL be `botrider.chat.stop`.

## Acceptance (architecture rev 7)

- GIVEN two active bots that DISSENT round 1 and AGREE round 2, THEN implementer runs once after round 2 and not after round 1.
- GIVEN two rounds of DISSENT, THEN split opens (`No consensus`) and round 3 does not start by itself.
- GIVEN Continue, THEN freeze ids are unchanged even if the registry changed, and one more vote round runs.
- GIVEN a debate reply containing a fenced file body, THEN the visible turn has the body dropped.
- GIVEN all bots inactive and no `@`, THEN `zero-active` and request count stays 0.
