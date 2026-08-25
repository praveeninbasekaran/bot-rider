# Design: Bot Rider MVP

## Technical approach

Host-owned TypeScript extension. App layer (`src/app/*`) depends on ports, not `vscode`. Adapters (`src/adapters/*`) bind VS Code. Vitest fakes the ports so `npm test` never loads `vscode.lm`.

Orchestrator: one run, one `CancelSource`, sequential `sendRequest`. Freeze is a snapshot of `BotRecord` copies at RunStarted. Webviews are a `ChatHub` that broadcasts protocol messages; they do not call language models or apply edits.

## Architecture decisions

### Decision: Copilot only through `vscode.lm`

No Chat Participant (would couple to Copilot Chat's request object and model picker). No `authentication.getSession` (Copilot consent is `selectChatModels` / `canSendRequest` on user gestures). Recheck command title is **Sign in to GitHub Copilot**.

### Decision: Apply only from `ChangesetStore.approve()`

Create/update/delete go through `WorkspaceEdit` (`createFile` with contents, full-document replace, `deleteFile`). Retry uses the architecture table in [docs/architecture.md](../../../docs/architecture.md). Partial disk effects on failure are disclosed; Bot Rider does not invent a rollback journal.

### Decision: Session-only transcript and pending changeset

Bots are the only `globalState` document (`botrider.bots.v1`). Settings Sync stays off so personas do not roam via Sync without an explicit product decision.

### Decision: Language-only debate, JSON implementer

Debate/@ turns strip fenced file bodies. Only the implementer parse path accepts `{ files: [...] }`. Stop never enters that path.

## Module map

| Concern | Module |
| --- | --- |
| BR-1 | `src/app/copilot-gateway.ts`, `src/adapters/vscode-lm-gateway.ts` |
| BR-2 | `src/app/bot-registry.ts`, `src/adapters/bots-tree.ts`, `src/adapters/bot-form-panel.ts` |
| BR-3 | `BotRegistry` + `ExtensionContext.globalState` (no `setKeysForSync`) |
| BR-4 | `src/adapters/chat-view.ts`, `chat-expand-panel.ts`, `media/chat.*` |
| BR-5 | `src/app/orchestrator.ts`, `prompt-builder.ts`, `patch-parser.ts`, `mentions.ts` |
| BR-6 | `src/app/changeset-store.ts`, `src/adapters/vscode-workspace.ts`, `review-tree.ts`, `proposed-content-provider.ts` |

Host ids and protocol: [docs/architecture.md](../../../docs/architecture.md) (rev 7). Folder layout and run machine: [docs/architecture-mvp.md](../../../docs/architecture-mvp.md). UI copy and surfaces: [docs/ui-ux-spec.md](../../../docs/ui-ux-spec.md).

## Risks

- Copilot consent UX is owned by VS Code; Bot Rider only selects vendor `copilot` on gestures.
- Failed `applyEdit` can leave creates/deletes on disk; copy MUST stay honest (BR-6).
- 60s hang leaves the run cancellable; the in-flight request is not silently retried.
