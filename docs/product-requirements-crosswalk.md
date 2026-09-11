# Product requirements crosswalk

Baseline: 2026-09-04  
Product authority: [master_product_requirement_document.md](./master_product_requirement_document.md)  
Recovery acceptance: [PU-1–PU-8](../openspec/specs/pu-1-product-usability/spec.md)

Status meanings:

- **Shipped** — implementation and automated acceptance evidence exist.
- **Partial** — useful implementation exists but does not satisfy the product requirement.
- **Planned** — requirement is baselined but runtime implementation is intentionally outside P0.
- **Deferred** — explicitly sequenced after the core product is usable.

## Product constraints

| Requirement | Status | Primary implementation symbols | Test evidence |
| --- | --- | --- | --- |
| PRD-C1 Copilot only | Shipped | `CopilotGateway`, `discoverCopilotModels`, `VsCodeLanguageModelPort` | `test/copilot-gateway.test.ts`, `test/bot-model.test.ts` |
| PRD-C2 Deterministic control plane | Shipped | `routeSend`, `routeStop`, `TaskGraphScheduler`, `CopilotRequestScheduler`, `HostEventBus.publishEvent`, host-owned `Orchestrator`, `ChangesetStore.approve` | `test/orchestration-boundaries.test.ts`, `test/task-graph.test.ts`, `test/copilot-scheduler.test.ts`, `test/shared-state-events.test.ts`, `test/work-run-host.test.ts`, `test/debate-convergence.test.ts` |
| PRD-C3 Local-first context | Shipped | `RepositoryContextService`, `VsCodeRepositoryContextPort`, `VsCodeLspSlicePort`, `ContextMapHost`, `OpenSpecCatalog`, `TokenGovernor` | `test/repository-context.test.ts`, `test/prompt-builder.test.ts`, `test/context-map-host.test.ts`, `test/openspec-host.test.ts` |
| PRD-C4 Explicit side-effect approval | Shipped with platform limitation | `ChangesetStore`, `McpActionStore`, `ReviewTreeProvider`, `paintReviewStrip`, `mcpBatchConfirmation` | `test/changeset-store.test.ts`, `test/mcp-actions.test.ts`, `test/deliverable-chrome.test.ts`, `test/mcp-actions-chrome.test.ts` |

## Recovery requirements

| Requirement | Status | Current implementation evidence | Missing acceptance | Planned code surface | Planned tests |
| --- | --- | --- | --- | --- | --- |
| PU-1 Protected core bots | Shipped | `CORE_BOT_PROFILES`, `BotRegistry.ensureCoreBots`, registry mutation guards, `coreResponsibility`, protected form/tree chrome | All PU-1 acceptance criteria implemented | `src/domain/core-bot.ts`, `src/app/bot-registry.ts`, `src/app/token-governor.ts`, bot form/tree adapters | `test/core-bots.test.ts` plus Work-role regression tests |
| PU-2 Swarm transcript parity | Shipped | `ThreadStore.snapshot`, `ThreadStore.recordHostMessage`, `ChatHub.replayTo`, `restoreTranscript` | All PU-2 acceptance criteria implemented | `src/app/thread-store.ts`, `src/protocol/messages.ts`, `src/adapters/chat-view.ts`, `src/app/application.ts`, `media/chat.js` | `test/thread-store.test.ts`, `test/transcript-replay.test.ts` |
| PU-3 Bounded Copilot concurrency | Shipped | `CopilotRequestScheduler`, `CopilotGateway.send`, `normalizeCopilotConcurrency`, `copilot/scheduler`, `paintScheduler` | All PU-3 acceptance criteria implemented; retries are intentionally disabled after output or for MCP-capable turns to prevent duplicate side effects | `src/app/copilot-scheduler.ts`, `src/app/copilot-gateway.ts`, `src/extension.ts`, `src/protocol/messages.ts`, `media/chat.js` | `test/copilot-scheduler.test.ts`, `test/copilot-gateway.test.ts`, Stop/in-flight host regressions |
| PU-4 Dependency-aware execution | Shipped | `parseTaskGraph`, `validateTaskGraph`, `TaskGraphScheduler`, `Orchestrator.runTaskGraph`, `RunBoardStore.setTaskGraph` | All PU-4 acceptance criteria implemented | `src/app/task-graph.ts`, `src/app/orchestrator.ts`, `src/app/run-board.ts`, `src/app/prompt-builder.ts` | `test/task-graph.test.ts`, `test/work-run-host.test.ts` |
| PU-5 Synthesis-based Debate | Shipped | `normalizeDebatePolicy`, `synthesisOwner`, `selectDebateObjectors`, `parseBlockingObjection`, `evaluateDebateDecision`, `Orchestrator.runDebateRounds`, `chat/synthesis`, `chat/decision`, compact activity timeline | All PU-5 acceptance criteria implemented; invalid vote text does not satisfy quorum and high-risk requests require unanimity | `src/app/debate-policy.ts`, `src/app/orchestrator.ts`, `src/app/prompt-builder.ts`, `src/app/thread-store.ts`, `src/protocol/messages.ts`, `media/chat.js`, `media/chat.css` | `test/debate-convergence.test.ts`, PU-5 cases in `test/orchestrator.test.ts`, `test/thread-store.test.ts`, `test/parallel-stream-chrome.test.ts`, `test/event-bus-host.test.ts` |
| PU-6 Consolidated review | Shipped with platform limitation | `paintReviewStrip`, `ReviewTreeProvider.revealFiles`, `ReviewTreeProvider.revealMcp`, `openProposedDiff`, `mcpBatchConfirmation`, `McpActionStore.approve`, `VsCodeMcpPort.invokeTool` | VS Code-native per-tool prompts cannot be coalesced without a Chat Participant-provided `toolInvocationToken`; custom webviews cannot create one | Platform capability only; no Bot Rider code surface can supply this token | `test/deliverable-chrome.test.ts`, `test/mcp-actions.test.ts`, `test/mcp-actions-chrome.test.ts`, `test/contributions.test.ts` |
| PU-7 Reload recovery | Shipped with follow-up | `WorkspaceRecoveryStore`, `Application.offerRecovery`, `reviewRecovered`, `resumeRecovered`, `persistRecoveryNow`, `ThreadStore.restore`, MCP metadata-only restore | Snapshot migration for older versions remains follow-up | `src/app/recovery.ts`, application/orchestrator/thread/run-board/MCP restore wiring, `media/chat.js` | `test/recovery.test.ts`, `test/chat-webview.integration.test.ts`, existing interruption and MCP safety regressions |
| PU-8 Public installation | Shipped with follow-up | `package:vsix`, `test:extension`, `test:vsix`, release workflow, Graphify fingerprint, VSIX-first onboarding/install docs | Tagged/public release blocked until external non-developer attestation is recorded | `scripts/package-vsix.mjs`, `scripts/vsix-smoke.mjs`, `.github/workflows/release.yml`, `.vscodeignore` | Extension Host suite, webview runtime integration, full Vitest suite, isolated VSIX install smoke |

## Context, editing, portability, and audit

| Requirement | Status | Primary implementation symbols | Test evidence or gap |
| --- | --- | --- | --- |
| CTX-1 Whole-repository code graph | Shipped | `RepositoryContextService.rebuild`, `VsCodeRepositoryContextPort`, symbol/import/call edges, `Orchestrator.prepareSpeaker` injection | `test/repository-context.test.ts`, prompt/context regressions |
| CTX-2 Local documentation retrieval | Shipped | `markdownChunks`, deterministic lexical ranking, bounded `buildContext` | `test/repository-context.test.ts` budget and relevance cases |
| CTX-3 Requirements graph links | Shipped with follow-up | `RepositoryContextService.linksFor`, requirement nodes, `OpenSpecCatalog`, `ContextMapHost.nodeIdsFor` | `test/repository-context.test.ts`, `test/openspec-host.test.ts`, `test/context-map-host.test.ts`; runtime Context Map DAG/proposed-file edges remain follow-up |
| EDIT-1 Selective hunk patching | Shipped | `parseUnifiedPatch`, `applyUnifiedPatch`, `sourceHash`, `ChangesetStore.setPendingPrepared`, stale approval gate, review-tree checkboxes, regeneration action | `test/unified-hunk.test.ts`, `test/patch-parser.test.ts`, `test/changeset-store.test.ts`, `test/chat-webview.integration.test.ts` |
| PORT-1 Bot profile portability | Shipped | `exportBots`, `parseBotExportText`, `importBotEntries` | `test/bot-export.test.ts` |
| AUD-1 Technical-debt audit | Deferred | No product scanner | No audit tests |
| VIZ-1 Context visualization | Partial/Deferred | Context Map workspace and run layers | `test/context-map-host.test.ts`, `test/context-map-chrome.test.ts`; richer graph telemetry deferred |

## Shipped capability inventory

| Capability | Architecture | Implementation | Tests |
| --- | --- | --- | --- |
| BR-1 Copilot gateway | `docs/architecture-mvp.md` | `src/app/copilot-gateway.ts`, `src/adapters/vscode-lm-gateway.ts` | `test/copilot-gateway.test.ts` |
| BR-2/BR-3 bot CRUD and persistence | `docs/architecture-mvp.md` | `src/app/bot-registry.ts`, `src/domain/bot.ts` | `test/bot-registry.test.ts` |
| BR-4/BR-5 Debate and implementer | `docs/architecture-mvp.md` | `src/app/orchestrator.ts`, `src/app/prompt-builder.ts`, `src/app/patch-parser.ts` | `test/orchestrator.test.ts` |
| BR-6 gated workspace edit | `docs/architecture-mvp.md` | `src/app/changeset-store.ts`, `src/adapters/vscode-workspace.ts` | `test/changeset-store.test.ts`, `test/application-apply.test.ts` |
| MA staged MCP actions | `docs/architecture-mcp-actions.md` | `src/app/mcp-gateway.ts`, `src/app/mcp-action-store.ts` | `test/mcp-actions.test.ts` |
| QC token governor and board | `docs/architecture-token-save.md` | `src/app/token-governor.ts`, `src/app/run-board.ts`, `src/app/lsp-slice.ts` | `test/prompt-builder.test.ts`, `test/run-board.test.ts` |
| HV conversational rendering | `docs/architecture-human-voice.md` | `src/app/article-strip.ts`, `src/app/prompt-builder.ts` | `test/human-voice.test.ts` |
| TA typed attachments | `docs/architecture-bot-attachments.md` | `src/app/bot-attach.ts`, `src/adapters/bot-form-panel.ts` | `test/bot-attach.test.ts` |
| SD standard deliverables | `docs/architecture-standard-deliverables.md` | `src/app/deliverable-detect.ts`, `src/app/deliverable-builder.ts`, `src/app/deliverable-open.ts` | `test/deliverable-host.test.ts`, `test/deliverable-builder.test.ts` |
| MS per-bot models | `docs/architecture-bot-model.md` | `src/app/bot-models.ts`, `src/app/copilot-gateway.ts` | `test/bot-model.test.ts` |
| SI isolated sessions | `docs/architecture-bot-isolation.md` | `src/app/bot-session-store.ts` | `test/isolation-host.test.ts` |
| EX profile import/export | `docs/architecture-bot-export-import.md` | `src/app/bot-export.ts` | `test/bot-export.test.ts` |
| OS OpenSpec traceability | `docs/architecture-openspec-trace.md` | `src/app/openspec-catalog.ts` | `test/openspec-host.test.ts` |
| CM Context Map | `docs/architecture-context-map.md` | `src/app/context-map.ts`, `src/adapters/context-map-view.ts` | `test/context-map-host.test.ts`, `test/context-map-chrome.test.ts` |
| EB parallel Debate batches | `docs/architecture-event-bus.md` | `src/app/event-bus.ts`, `Orchestrator.runDebateBatch` | `test/event-bus-host.test.ts`, `test/parallel-stream-chrome.test.ts` |
| WK Work batches | `docs/architecture-work-run.md` | `Orchestrator.runWork`, `Orchestrator.runWorkBatch`, `src/app/work-split.ts` | `test/work-run-host.test.ts`, `test/work-run-chrome.test.ts` |
| AG collision argument | `docs/architecture-work-run.md` | `Orchestrator.runArgue`, `Orchestrator.arguePath` | `test/argue-host.test.ts`, `test/argue-chrome.test.ts` |
| EDIT-1 selective hunk patching | `openspec/specs/edit-1-selective-hunks/spec.md` | `src/app/unified-hunk.ts`, `src/app/changeset-store.ts`, `src/app/patch-parser.ts` | `test/unified-hunk.test.ts`, `test/changeset-store.test.ts` |
| PU-7 reload recovery | `openspec/specs/pu-1-product-usability/spec.md` | `src/app/recovery.ts`, `Application.persistRecoveryNow` | `test/recovery.test.ts`, `test/chat-webview.integration.test.ts` |
| CTX repository context | `openspec/specs/ctx-1-repository-context/spec.md` | `src/app/repository-context.ts`, `src/adapters/vscode-repository-context.ts` | `test/repository-context.test.ts` |
| PU-8 distribution | `docs/INSTALL.md` | `scripts/package-vsix.mjs`, `.github/workflows/release.yml` | `test/integration/suite/index.js`, `npm run test:vsix` |
| FO idle follow-on | `docs/architecture-work-run.md` | Not implemented | No product tests |

## Conflict transition rule

A planned requirement does not silently change shipped behavior. Each implementation change MUST:

1. update the relevant PU status from Planned or Partial to Shipped;
2. update or supersede the conflicting capability spec;
3. add automated acceptance evidence;
4. update this crosswalk;
5. refresh the Graphify knowledge graph.
