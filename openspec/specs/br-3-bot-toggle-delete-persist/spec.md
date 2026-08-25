# BR-3 Bot toggle, delete, persist

## Purpose

Active is a checkbox, not deletion. Bots persist locally. Settings Sync stays off. Transcript and pending changesets do not persist. Acceptance follows architecture blueprint **revision 7**.

## SHALL requirements

1. Toggle Active SHALL be `TreeItem.checkboxState` with `manageCheckboxStateManually`, command `botrider.bots.toggle`, separate from **Delete Bot** (`botrider.bots.delete`).
2. Palette SHALL hide toggle and delete (`when: false`).
3. `snapshotActive()` SHALL return active bots in stable list order. `getByHandle` SHALL resolve case-insensitively.
4. In-run edits (including toggle) SHALL mutate persist only; freeze membership SHALL NOT change (architecture rev 7 freeze at RunStarted).
5. Bots SHALL persist in `globalState` key `botrider.bots.v1`.
6. The extension SHALL NEVER call `setKeysForSync`.
7. Swarm transcript SHALL be memory-only and session-only.
8. Pending changeset SHALL be memory-only.
9. Context keys `botrider.hasBots` and `botrider.hasActiveBots` SHALL track list/active state.

## Acceptance (architecture rev 7)

- GIVEN a checked bot, WHEN the user unchecks it, THEN `active` is false and the bot is not deleted.
- GIVEN a debate freeze of two bots, WHEN the user adds or toggles a third during the run, THEN Continue still uses the original `frozenBotIds`.
- GIVEN saved bots and a pending review, WHEN the window reloads, THEN bots remain and transcript/changeset are gone.
- GIVEN source search, THEN `setKeysForSync` is absent.
