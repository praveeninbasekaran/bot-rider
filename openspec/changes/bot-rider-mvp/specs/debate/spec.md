# Delta for Debate & Decide (BR-5)

## Purpose

Default Send freezes active bots and runs a two-round language debate. Implementation is a separate pass. Split locks the composer.

## ADDED Requirements

### Requirement: Two-round cap and freeze
At RunStarted the host MUST freeze active bots in stable order and keep that freeze on split/Continue. Rounds 1–2: propose each, critique each, vote (`AGREE`/`DISSENT`; unparseable = `DISSENT`). All AGREE → implementer = first frozen bot. Else split. No auto round 3. Continue = one more propose/critique/vote on the same freeze. Send ignored while `splitOpen`.

### Requirement: Split Continue / Pick / Stop
Composer MUST lock on split. Actions: Continue, Pick a Bot to Decide, Stop (`botrider.chat.stop` only). Titles: `No consensus` / `Debate paused`. Stream Stop snapshots into Split and MUST NEVER implement. Split Stop unlocks without implementation.

### Requirement: Language-only debate and @; separate implementer
Debate and `@` turns MUST be language-only; file bodies dropped. Unknown/multiple/zero-active/invalid handle → error, no Copilot. Solo trailer `NEED_EDIT` | `NO_EDIT` (missing = `NO_EDIT`). Implementer only from unanimous AGREE, pick, or solo `NEED_EDIT`. Implementer JSON `{ files: [{ path, op, content? }] }`; ops `create`|`update`|`delete`.
