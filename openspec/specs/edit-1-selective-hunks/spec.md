# EDIT-1 Selective hunk patching

Status: **shipped**.

## Requirement

Supported text updates MUST use validated unified hunks. The host MUST bind each proposal to a
workspace source hash, reject stale preview/apply operations, and apply only user-included files in
one WorkspaceEdit. Binary deliverables remain whole-file proposals.

## Acceptance

1. Patch headers match the normalized declared workspace-relative path.
2. Hunk counts, context, and deleted lines validate before preview.
3. A source hash is captured for every prepared file.
4. Source drift is detected before preview and rechecked before apply.
5. Stale text updates cannot apply and expose an explicit regeneration action.
6. File checkboxes control selected preview and application.
7. Selected text changes are submitted in one atomic WorkspaceEdit.
8. Binary deliverables bypass text-hunk parsing.
9. Existing explicit apply-failure reporting remains intact.

Verified by `test/unified-hunk.test.ts`, `test/patch-parser.test.ts`,
`test/changeset-store.test.ts`, and `test/chat-webview.integration.test.ts`.
