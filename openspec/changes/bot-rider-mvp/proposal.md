# Proposal: Bot Rider MVP

> **Historical proposal.** PU-7, EDIT-1, and later capability specs supersede session-loss and whole-batch-only approval. See [openspec/specs.md](../../specs.md) and [docs/master_product_requirement_document.md](../../../docs/master_product_requirement_document.md).

## Intent

Ship a VS Code sidebar extension that lets a developer define a swarm of persona bots, send a master prompt, and have those bots **debate in language** through GitHub Copilot. When they agree (or the user picks a direction), a **separate implementer pass** proposes a workspace changeset. The human reviews proposed files and Approve/Reject applies or discards **included** changes.

The product must feel like Copilot Chat density, never ask for API keys, and never silently write files.

## Why

Coding agents that jump straight to patches skip the disagreement that makes a design review useful. Bot Rider freezes a swarm, runs a capped Debate & Decide loop, and only then emits a JSON changeset. Apply stays honest: a failed `WorkspaceEdit` never claims success, leftover creates/deletes are visible, and Retry is idempotent.

## Scope

### In scope (BR-1 … BR-6)

- **BR-1** Copilot-only `vscode.lm` (vendor `copilot`, user gestures only, no other vendors or API keys)
- **BR-2** Custom bots with handle, persona, role, and instructions (checkbox active, no seed bots, no count cap)
- **BR-3** Local `globalState` persistence for bots; Settings Sync off; PU-7 workspace recovery for transcript/pending work (supersedes session-only baseline)
- **BR-4** Swarm chat UI (sidebar webview + expand panel)
- **BR-5** Debate & Decide: two-round cap, split composer lock with Continue / Pick a bot to decide / Stop, language-only debate and `@` turns, separate implementer pass
- **BR-6** Selective included-file Approve including create/update/delete (EDIT-1); failed apply never claims success

### Out of scope

- Chat Participants, SCM `SourceControl`, or Copilot consent via `authentication.getSession`
- Auto round 3, overlapping `sendRequest`, or implementer-on-Stop
- Rolling back leftover creates or restoring already-deleted files on Reject
- Marketplace packaging / vsix publishing pipeline
- Non-Copilot language-model vendors

## Approach

Host-owned orchestration behind ports so Vitest can fake Copilot. Webviews post protocol messages only; they never call `vscode.lm` or `applyEdit`. `ChangesetStore.approve()` is the sole `workspace.applyEdit` caller. See [docs/architecture-mvp.md](../../../docs/architecture-mvp.md) and [docs/ui-ux-spec.md](../../../docs/ui-ux-spec.md).
