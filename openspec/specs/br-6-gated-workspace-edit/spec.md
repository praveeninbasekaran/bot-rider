# BR-6 Gated workspace edit

## Purpose

File changes land only after the human Approves selected pending files. `applyEdit` is gated through `ChangesetStore.approve()`. Failed apply never claims success. `applyFailed` is true only after `ok === false`. Retry shows when `botrider.applyFailed`. **EDIT-1** supersedes whole-batch-only approval for supported text files.

## SHALL requirements

1. `workspace.applyEdit` SHALL be called ONLY from `ChangesetStore.approve()` as `botrider.changeset.approve`. Retry (`botrider.changeset.retry`) SHALL be the same caller with `buildEdit('retry')`.
2. The host SHALL NOT apply via `workspace.fs.writeFile`, Node `fs`, `TextEditor.edit`, or `needsConfirmation`.
3. Approve SHALL apply only **included** pending files in one `WorkspaceEdit`, including create, update, and delete. Excluded or stale files SHALL be skipped.
4. UI SHALL NOT call `applyEdit`. Review title SHALL show Approve/Reject when `botrider.hasPendingChanges`. Retry SHALL show **only** when `botrider.applyFailed` (not on clean pending review).
5. `RunStateDto.applyFailed` / context `botrider.applyFailed` SHALL be true ONLY after `applyEdit` returns `ok === false`. Clean pending preview SHALL have `applyFailed` false.
6. On `ok === true` the host SHALL clear the store, dispose proposed docs, close diffs, post `changeset/cleared`, and set `applyFailed` false.
7. On `ok === false` the host SHALL NOT claim success. Store and Review SHALL stay. The host SHALL post `changeset/apply-failed` with leftoverCreates/leftoverDeletes and the locked honest copy (UI/UX spec).
8. Retry SHALL be idempotent: leftover creates overwrite/replace; already-gone deletes skip (`buildEdit` table in architecture rev 7).
9. Reject SHALL NOT auto-delete leftover creates or restore already-deleted files.
10. Diffs use `botrider-proposed:` with titles `{basename} (Workspace ↔ Proposed)` / `(Empty ↔ Proposed)` / `(Workspace ↔ Deleted)`. Closing a diff SHALL NOT approve or reject. Review lists Modified / Added / Deleted.
11. **Superseded by PU-7:** pending file proposals SHALL be restorable from a versioned workspace recovery snapshot. Stop (`botrider.chat.stop`) SHALL never implement or apply.

## Acceptance (architecture rev 7)

- GIVEN a pending create+update+delete and `applyEdit` true, THEN all three ops were in the edit, store is cleared, `applyFailed` is false.
- GIVEN `applyEdit` false, THEN no `changeset/cleared`, Review still has files, `applyFailed` is true, Retry is available, success is not claimed.
- GIVEN leftover create on disk and already-gone delete, WHEN Retry, THEN create uses overwrite and the gone delete is skipped.
- GIVEN clean pending (not yet approved), THEN `applyFailed` is false and Retry is not in the title bar.
- GIVEN Reject after a failed apply, THEN remaining edits are dropped and leftovers on disk are not rolled back.
