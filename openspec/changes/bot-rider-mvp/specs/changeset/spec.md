# Delta for Changeset Apply (BR-6)

## Purpose

The human reviews one batch of proposed workspace edits. Approve applies the whole batch. Failure is honest.

## ADDED Requirements

### Requirement: Whole-changeset Approve
Approve MUST apply the entire pending batch (create, update, delete) through `ChangesetStore.approve()` → `workspace.applyEdit` only. Retry is the same caller with `buildEdit('retry')`. MUST NOT use `writeFile`, Node `fs`, `TextEditor.edit`, or `needsConfirmation`.

#### Scenario: Success
- WHEN apply returns `ok === true`
- THEN store, proposed docs, and diffs MUST clear, `changeset/cleared` MUST post, `applyFailed` MUST be false

### Requirement: Failed apply never claims success
When `ok === false`, the host MUST keep the store and Review, set `applyFailed` true, and show the honest leftover-create/delete copy. Retry: leftover creates overwrite/replace; already-gone deletes skip. Reject MUST NOT roll back leftovers. `applyFailed` is true only after a failed apply, never on clean pending. Retry title action only when `botrider.applyFailed`.
