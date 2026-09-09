# Graph Report - bot-rider  (2026-09-05)

## Corpus Check
- 164 files · ~163,959 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2399 nodes · 5087 edges · 124 communities (115 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 168 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b08d2a41`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- chat.js
- HostToUi
- token-governor.ts
- fakes.ts
- deliverable-builder.ts
- package.json
- work-run-chrome.test.ts
- CopilotGateway
- vscode-lm-gateway.ts
- Application
- Orchestrator
- bot.ts
- BotRecord
- BotRegistry
- argue-chrome.test.ts
- webviewHtml
- lsp-slice.ts
- bot-form.js
- context-map.js
- ContextMapHost
- application.ts
- bot-form-model-chrome.test.ts
- review-tree.ts
- bot-attach.test.ts
- bot-export.ts
- mcp-action-store.ts
- openspec-host.test.ts
- .open
- bot-form-attach-chrome.test.ts
- compilerOptions
- bot-model.test.ts
- BotSessionStore
- 27. Work run chrome (F8a)
- mcp-gateway.ts
- Bot Rider — F8a Work run / WK-1–6 + F8b sequential Argue / AG-1–4 + F8c idle follow-on / FO-1–4 (additive slice)
- parallel-stream-chrome.test.ts
- ReviewTreeProvider
- Bot Rider — Bot form import (typed attachments)
- .streamPrepared
- Bot Rider MVP Specification
- context-map-host.test.ts
- PU-1–PU-8 Product usability recovery
- context-map-chrome.test.ts
- 4. Recovery requirements
- PromptMessage
- copilot-gateway.ts
- context-map.ts
- bot-form-export-chrome.test.ts
- messages.ts
- article-chrome.test.ts
- 19. Staged MCP actions (additive chrome, Grain B)
- docs/architecture-mvp.md
- .buildRun
- Bot Rider — F6 bot export / import (additive slice)
- ThreadStore
- article-strip.ts
- ChatHub
- ContextMapNeighborhood
- specs.md
- architecture-bot-attachments.md
- LmModel
- serena
- Bot Rider — F1 Context Map / CM-1–4 (additive slice)
- Bot Rider — F7 parallel / Event Bus / EB-1–4 (additive slice)
- run-board-chrome.test.ts
- [REQ] PU-1
- 22. Per-bot model picker (F5)
- Bot Rider architecture blueprint (revision 7)
- Bot Rider architecture blueprint (revision 7)
- Bot Rider — Standard deliverables (additive slice)
- Bot Rider — Token-save (additive slice)
- Bot Rider — F7 isolation / SI-1–4 (additive slice, host-only)
- Bot Rider — F2 OpenSpec / contract traceability (additive slice)
- Bot Rider UI/UX Specification
- Bot Rider UI/UX Specification
- 17. Run board (additive Swarm chrome)
- 26. Parallel Debate stream (F7)
- 17. Run board (additive Swarm chrome)
- ChangeFile
- orchestrator.ts
- 23. Bot export / import (F6)
- 25. Context Map (F1, Bot Rider–owned)
- Bot Rider — Per-bot Copilot model selection (additive slice)
- Troubleshoot Bot Rider
- transcript-replay.test.ts
- Bot Rider — Staged MCP actions (additive slice)
- inject-product-knowledge.mjs
- VsCodeLmModel
- Architecture decisions
- Tasks: Bot Rider MVP
- RecordingUi
- [SECTION] Context, editing, portability, and audit · docs_product_requirements_crosswalk_md
- Bot Rider — Human voice (additive slice)
- 18. Swarm article prose (additive chrome)
- 24. OpenSpec chips on Proposed Changes Files (F2)
- 19. Staged MCP actions (additive chrome, Grain B)
- ADDED Requirements
- Bot Rider
- BR-4 Debate & Decide
- Install Bot Rider
- [DOC] Bot Rider specs index
- 18. Swarm article prose (additive chrome)
- Proposal: Bot Rider MVP
- ADDED Requirements
- ADDED Requirements
- ADDED Requirements
- ADDED Requirements
- BR-5 Mentions, split, implementer
- [REQ] PU-8
- Bot Rider architecture (rev 7)
- Product requirements crosswalk
- Delta for Persistence (BR-3)
- Contribution points
- Swarm
- BR-3 Bot toggle, delete, persist
- QC-1 Token-save (run board + compact pack)
- SI-1 F7 isolation (host-only)
- BR-2 Bot create / edit
- EX-1 Bot export / import
- [SECTION] 4. Recovery requirements · docs_master_product_requirement_document_md
- BR-6 Gated workspace edit
- MS-1 Per-bot Copilot model selection
- BR-1 Copilot gateway

## God Nodes (most connected - your core abstractions)
1. `Orchestrator` - 88 edges
2. `Application` - 68 edges
3. `BotRecord` - 54 edges
4. `HostToUi` - 53 edges
5. `activate()` - 46 edges
6. `FakeGateway` - 41 edges
7. `MemoryFs` - 36 edges
8. `COPY` - 35 edges
9. `McpGateway` - 35 edges
10. `PromptMessage` - 32 edges

## Surprising Connections (you probably didn't know these)
- `[REQ] PU-2` --implemented_by--> `ChatHub`  [EXTRACTED]
  openspec/specs/pu-1-product-usability/spec.md → src/adapters/chat-view.ts
- `[REQ] PU-6` --implemented_by--> `ReviewTreeProvider`  [EXTRACTED]
  openspec/specs/pu-1-product-usability/spec.md → src/adapters/review-tree.ts
- `[REQ] PU-6` --implemented_by--> `openProposedDiff()`  [EXTRACTED]
  openspec/specs/pu-1-product-usability/spec.md → src/adapters/review-tree.ts
- `[REQ] PU-1` --implemented_by--> `Application`  [EXTRACTED]
  openspec/specs/pu-1-product-usability/spec.md → src/app/application.ts
- `[REQ] PU-7` --implemented_by--> `Application`  [EXTRACTED]
  openspec/specs/pu-1-product-usability/spec.md → src/app/application.ts

## Import Cycles
- None detected.

## Communities (124 total, 8 thin omitted)

### Community 0 - "chat.js"
Cohesion: 0.05
Nodes (82): activeBots(), announce(), announceArticle(), announceOnce(), appendInline(), appendNotice(), appendSnapshotBot(), appendSnapshotError() (+74 more)

### Community 1 - "HostToUi"
Cohesion: 0.11
Nodes (13): VsCodeWorkspacePort, ChangesetStore, ApplyEditPort, DiffCloser, FileSystemPort, ProposedDocHost, WorkspaceContextPort, APPLY_FAILED_MESSAGE (+5 more)

### Community 2 - "token-governor.ts"
Cohesion: 0.06
Nodes (38): BotSession, buildIsolationPacket(), IsolationPacket, packetToMessage(), section(), BOTS_STATE_KEY, EventBusPacket, LspSliceSnapshot (+30 more)

### Community 3 - "fakes.ts"
Cohesion: 0.07
Nodes (32): harness(), harness(), root, scriptCollision(), harness(), harness(), harness(), harness() (+24 more)

### Community 4 - "deliverable-builder.ts"
Cohesion: 0.08
Nodes (45): appXml(), buildHtml(), buildOffice(), coreXml(), crc32(), CRC_TABLE, DeliverableBuilder, docxParts() (+37 more)

### Community 5 - "package.json"
Cohesion: 0.04
Nodes (46): js-yaml, activationEvents, categories, contributes, commands, menus, views, viewsContainers (+38 more)

### Community 6 - "work-run-chrome.test.ts"
Cohesion: 0.05
Nodes (31): chatCss, chatJs, chipsFn, chrome, expand, exportFn, FakeEl, formCss (+23 more)

### Community 7 - "CopilotGateway"
Cohesion: 0.17
Nodes (5): discoverCopilotModels(), CopilotGateway, HungError, LanguageModelPort, CopilotStatus

### Community 8 - "vscode-lm-gateway.ts"
Cohesion: 0.20
Nodes (7): createCopilotGateway(), isTextPart(), isToolCallPart(), mapStream(), VsCodeLanguageModelPort, DisposableLike, LmStreamPart

### Community 9 - "Application"
Cohesion: 0.09
Nodes (15): ContextMapViewProvider, Application, activate(), runExport(), vscodeExportDialogs(), MementoStore, workSwarm(), twoBots() (+7 more)

### Community 10 - "Orchestrator"
Cohesion: 0.12
Nodes (4): CancelSource, Orchestrator, RunBoardStore, idleRunState()

### Community 11 - "bot.ts"
Cohesion: 0.14
Nodes (11): BotsTreeProvider, BotTreeItem, ATTACH_BINARY_PROBE_BYTES, ATTACH_MAX_BYTES, ATTACHMENT_KINDS, avatarSvg(), BOT_COLORS, botColor() (+3 more)

### Community 12 - "BotRecord"
Cohesion: 0.21
Nodes (4): isTurnOk(), remainingWorkBots(), BotRecord, copyBotRecord()

### Community 13 - "BotRegistry"
Cohesion: 0.20
Nodes (11): applyDesignation(), BotRegistry, BotRegistryError, copyAttachments(), copyModelId(), StateStore, agentKindCount(), BotDraft (+3 more)

### Community 14 - "argue-chrome.test.ts"
Cohesion: 0.07
Nodes (28): boardFn, chatCss, chatJs, chipsFn, chrome, expand, formJs, lockFn (+20 more)

### Community 15 - "webviewHtml"
Cohesion: 0.20
Nodes (7): ChatExpandPanel, CONTEXT_KEYS, ContextKey, ContextKeys, csp(), getNonce(), webviewHtml()

### Community 16 - "lsp-slice.ts"
Cohesion: 0.16
Nodes (17): loadSymbols(), SEVERITY, SYMBOL_KIND, toDiagnostic(), toSymbol(), VsCodeLspSlicePort, emptySlice(), findEnclosingRange() (+9 more)

### Community 17 - "bot-form.js"
Cohesion: 0.12
Nodes (21): addFiles(), addSkip(), applyBotsModels(), applyMapped(), captureClean(), collectExportDraft(), collectPersistDraft(), fieldIsEmpty() (+13 more)

### Community 18 - "context-map.js"
Cohesion: 0.17
Nodes (25): applyPan(), edgesOnLayer(), expandPost(), graphForLayer(), inspect(), layout(), nodeFromTarget(), nodeLabel() (+17 more)

### Community 19 - "ContextMapHost"
Cohesion: 0.18
Nodes (4): ContextMapHost, emptyRunGraph(), ContextMapNode, ContextMapRunPayload

### Community 20 - "application.ts"
Cohesion: 0.08
Nodes (23): ChatUiMsg, ChatViewProvider, SYMBOL_KIND, vscodeContextMapActions(), ContextMapActions, COPILOT_JUSTIFICATION, copilotStatusMessage(), COPY (+15 more)

### Community 21 - "bot-form-model-chrome.test.ts"
Cohesion: 0.08
Nodes (13): chatJs, FakeEl, formCss, formJs, HOST_MODELS, loadBotForm(), markup, messageHandler (+5 more)

### Community 22 - "review-tree.ts"
Cohesion: 0.06
Nodes (51): closeProposedDiffs(), EMPTY_PATH, PROPOSED_SCHEME, ProposedContentProvider, proposedUri(), uriFromKey(), htmlPreviewDocument(), mcpFailedViewMessage() (+43 more)

### Community 23 - "bot-attach.test.ts"
Cohesion: 0.08
Nodes (39): FormAttachSession, newDraftDefaults(), newFormSession(), postFormLoad(), vscodePickFiles(), applyEmptyOnly(), ATTACH_DIALOG_TITLE, AttachFileIo (+31 more)

### Community 24 - "bot-export.ts"
Cohesion: 0.06
Nodes (49): attachmentsFromExport(), BOT_EXPORT_FORMAT, BotExportAttachment, BotExportEntry, BotExportFileV1, botsFromTreeSelection(), capAgentAttachments(), collisionChoicePrompt() (+41 more)

### Community 25 - "mcp-action-store.ts"
Cohesion: 0.10
Nodes (17): [REQ] PU-6, [SECTION] Acceptance · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_6_consolidated_review, [SECTION] Requirement · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_6_consolidated_review, [REQ] PU-7, [SECTION] Acceptance · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_7_reload_recovery, [SECTION] Requirement · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_7_reload_recovery, [SECTION] Supersedes · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_7_reload_recovery, ARGS_LINE_MAX (+9 more)

### Community 26 - "openspec-host.test.ts"
Cohesion: 0.07
Nodes (29): slugPath(), ensureExtension(), extractDeliverableSpecs(), FORMATS, looksLikeZipOrBase64(), selectPrimarySpecs(), attachFileCites(), collectExactCatalogIds() (+21 more)

### Community 27 - ".open"
Cohesion: 0.25
Nodes (4): BotFormPanel, botsForExportSelf(), ExportableBot, FormExportSession

### Community 28 - "bot-form-attach-chrome.test.ts"
Cohesion: 0.09
Nodes (14): emptyFn, FakeEl, formCss, formJs, loadBotForm(), mappedFn, markup, messageHandler (+6 more)

### Community 29 - "compilerOptions"
Cohesion: 0.09
Nodes (22): ES2022, node_modules, src/**/*.test.ts, src/**/*.ts, compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames (+14 more)

### Community 30 - "bot-model.test.ts"
Cohesion: 0.16
Nodes (9): BotModelsStatus, botsModelsMessage(), buildCopilotModelOptions(), copilotModelLabel(), CopilotModelOption, FormModelsWatch, shortIdTail(), watchFormCopilotModels() (+1 more)

### Community 31 - "BotSessionStore"
Cohesion: 0.19
Nodes (4): BotSessionStore, copyMessages(), copyPacket(), HostEventBus

### Community 32 - "27. Work run chrome (F8a)"
Cohesion: 0.05
Nodes (44): 27.10 Pack overflow, 27.11 Accessibility, 27.12 Protocol consume, 27.13 Out, 27.14 Copy exact, 27.1 Surfaces, 27.2 Work | Debate toggle, 27.3 Designation checkboxes (New / Edit Bot) (+36 more)

### Community 33 - "mcp-gateway.ts"
Cohesion: 0.05
Nodes (43): asInput(), hasConfiguredServers(), MCP_TOOL_INVOCATION_TOKEN, VsCodeMcpPort, McpBatchApprovalOptions, classifyInvokeError(), clipPreview(), delay() (+35 more)

### Community 34 - "Bot Rider — F8a Work run / WK-1–6 + F8b sequential Argue / AG-1–4 + F8c idle follow-on / FO-1–4 (additive slice)"
Cohesion: 0.05
Nodes (41): 0. Non-negotiables, 1. Component, 2. Designation (WK-2), 3. Phases, 4.1 Host validates; host never partitions, 4.2 Union Approve, 4. Disjoint validate + union (WK-4 / WK-6), 5. SI + Event Bus reuse (+33 more)

### Community 35 - "parallel-stream-chrome.test.ts"
Cohesion: 0.10
Nodes (18): chatCss, chatJs, chipsFn, chrome, expand, lockFn, markFn, onSendFn (+10 more)

### Community 37 - "Bot Rider — Bot form import (typed attachments)"
Cohesion: 0.18
Nodes (11): 0. Non-negotiables (PO + IE-1–4 + TA-1–4 + §20), 1. Component, 2. BotRecord (additive), 3. Agent-slot map (host parse, no Copilot), 4. Picker and skip, 5. TokenGovernor extras (IE-2 + TA-4), 6. Protocol (replace untyped ports), 7. Copy (+3 more)

### Community 38 - ".streamPrepared"
Cohesion: 0.12
Nodes (13): [REQ] PU-3, [SECTION] Acceptance · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_3_bounded_copilot_concurrency, [SECTION] Requirement · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_3_bounded_copilot_concurrency, [REQ] PU-4, [SECTION] Acceptance · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_4_dependency_aware_execution, [SECTION] Extends · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_4_dependency_aware_execution, [SECTION] Requirement · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_4_dependency_aware_execution, [REQ] PU-5 (+5 more)

### Community 39 - "Bot Rider MVP Specification"
Cohesion: 0.06
Nodes (32): Bot Rider MVP Specification, BR-1 Copilot-only `vscode.lm`, BR-2 Custom bots, BR-3 Local persistence, Settings Sync off, BR-4 Swarm chat, BR-5 Debate & Decide, BR-6 Whole-changeset Approve, Purpose (+24 more)

### Community 40 - "context-map-host.test.ts"
Cohesion: 0.10
Nodes (11): toSymbol(), VsCodeContextMapNeighborhood, ContextMapChild, ContextMapFile, ContextMapFolder, ContextMapSymbol, agreeThenImplement(), bot (+3 more)

### Community 41 - "PU-1–PU-8 Product usability recovery"
Cohesion: 0.07
Nodes (29): Acceptance, Acceptance, Acceptance, Acceptance, Acceptance, Acceptance, Acceptance, Acceptance (+21 more)

### Community 42 - "context-map-chrome.test.ts"
Cohesion: 0.13
Nodes (12): chatJs, chrome, css, extension, host, html, js, proto (+4 more)

### Community 43 - "4. Recovery requirements"
Cohesion: 0.07
Nodes (27): 1. Document authority, 2. Audited baseline, 3. Product constraints, 4. Recovery requirements, 5. Capability roadmap, 6. Resolved conflicts, 7. Delivery order, AUD-1 — Technical-debt audit (+19 more)

### Community 44 - "PromptMessage"
Cohesion: 0.16
Nodes (6): toVsCodeMessage(), CopilotSendOpts, ICopilotGateway, CancelToken, PromptMessage, detectTurn()

### Community 45 - "copilot-gateway.ts"
Cohesion: 0.18
Nodes (11): waitForCancel(), consumeResponse(), convoToPrompt(), mapCopilotError(), MAX_MCP_TOOL_ROUNDS, OverlapError, raceHang(), readTextStream() (+3 more)

### Community 46 - "context-map.ts"
Cohesion: 0.31
Nodes (10): addEdge(), addSymbols(), emptyWorkspaceGraph(), fileNodeId(), folderNodeId(), noopContextMapActions, symbolNodeId(), upsertNode() (+2 more)

### Community 47 - "bot-form-export-chrome.test.ts"
Cohesion: 0.09
Nodes (13): BOT_EXPORT_COMMANDS, attachChrome, chatCss, chatJs, FakeEl, formCss, formJs, loadBotForm() (+5 more)

### Community 48 - "messages.ts"
Cohesion: 0.18
Nodes (14): ThreadSnapshot, ThreadTurn, TranscriptBase, TranscriptEntry, TranscriptSplit, ProposedFileDto, RunPhase, RunStateDto (+6 more)

### Community 49 - "article-chrome.test.ts"
Cohesion: 0.17
Nodes (11): chatCss, chatJs, expand, overflowFn, paintArticleFn, root, showSplitFn, sidebar (+3 more)

### Community 50 - "19. Staged MCP actions (additive chrome, Grain B)"
Cohesion: 0.09
Nodes (19): Bot Rider — Workspace MCP (read-only), 19.1 Two independent gates, 19.2 Proposed Changes — second section, 19.3 Swarm review strip, 19.4 Failed MCP Approve, 19.5 Protocol types, 19.6 Skip / mutating-blocked, 19.7 Session-only (+11 more)

### Community 52 - ".buildRun"
Cohesion: 0.20
Nodes (8): botNodeId(), ContextMapRunSource, includesPath(), isCodeNode(), matchCodeNodeIds(), packetCanvasLabel(), proposedFileNodeId(), retainKnownNodeIds()

### Community 53 - "Bot Rider — F6 bot export / import (additive slice)"
Cohesion: 0.09
Nodes (23): 0. Non-negotiables (PO + EX-1–4 + §23), 1. Component, 2.1 Read paths, 2.2 Write rules (EX-1), 2.3 Host-local fields — never in the file, 2. File schema (locked), 3.1 Dirty form, 3. Export (EX-1) (+15 more)

### Community 55 - "article-strip.ts"
Cohesion: 0.38
Nodes (9): flattenListLines(), listInfo(), mapUnfenced(), removeParseableTodoLines(), stripArticleChrome(), stripHeadingLeadIn(), stripLeadingVoteToken(), userAskedForList() (+1 more)

### Community 58 - "specs.md"
Cohesion: 0.24
Nodes (4): Canonical docs, OpenSpec — Bot Rider, Requirements (source of truth), Bot Rider specs index

### Community 59 - "architecture-bot-attachments.md"
Cohesion: 0.11
Nodes (16): 20.1 Slots (replace single Attach), 20.2 Filters and rows, 20.3 Map into empty fields only, 20.4 Skip that file, visible, continue, 20.5 Host to UI (ports pass slot), 20.6 Out, 20. Bot form attachments (typed slots, locked), Bot Rider — UI/UX addendum: Bot form attachments (typed slots) (+8 more)

### Community 61 - "serena"
Cohesion: 0.33
Nodes (5): graphify, serena, C:\Users\iprav\.local\bin\graphify-mcp.exe, C:\Users\iprav\.local\bin\serena.exe, start-mcp-server

### Community 62 - "Bot Rider — F1 Context Map / CM-1–4 (additive slice)"
Cohesion: 0.10
Nodes (20): 0. Non-negotiables, 10. Tests (docs only — list them, do not write vitest), 1. Component, 2. View (CM-1), 3. Graph model (CM-2), 4. Workspace neighborhood (CM-2), 5. This-run graph (CM-2), 6. Protocol (+12 more)

### Community 63 - "Bot Rider — F7 parallel / Event Bus / EB-1–4 (additive slice)"
Cohesion: 0.11
Nodes (19): 0. Non-negotiables, 1. Component, 2. Event Bus (host) — EB-1, 3. Batches (EB-2 / Q1), 4.1 No sibling packets inside the batch, 4.2 SHALL settle-then-ingest, 4.3 QC-3 in a batch, 4. Ingest lock (EB-3) — PO stamped (+11 more)

### Community 64 - "run-board-chrome.test.ts"
Cohesion: 0.40
Nodes (4): chatCss, chatJs, proto, root

### Community 65 - "[REQ] PU-1"
Cohesion: 0.25
Nodes (8): [DOC] PU-1–PU-8 Product usability recovery, [REQ] PU-1, [SECTION] Acceptance · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_1_protected_core_bots, [SECTION] Requirement · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_1_protected_core_bots, [SECTION] Supersedes · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_1_protected_core_bots, [REQ] PU-2, [SECTION] Acceptance · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_2_swarm_transcript_parity, [SECTION] Requirement · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_2_swarm_transcript_parity

### Community 66 - "22. Per-bot model picker (F5)"
Cohesion: 0.25
Nodes (8): 22.1 Placement, 22.2 Options and labels (MS-1), 22.3 Persist and runtime (MS-2, MS-3), 22.4 Where it shows, 22.5 Empty / loading / Copilot missing, 22.6 Host ↔ UI, 22.7 Out, 22. Per-bot model picker (F5)

### Community 68 - "Bot Rider architecture blueprint (revision 7)"
Cohesion: 0.11
Nodes (19): Apply (BR-6), Bot Rider architecture blueprint (revision 7), `buildEdit` table, Commands, Context keys, Copilot gateway (BR-1), Domain types, Folder layout (+11 more)

### Community 69 - "Bot Rider architecture blueprint (revision 7)"
Cohesion: 0.11
Nodes (19): Apply (BR-6), Bot Rider architecture blueprint (revision 7), `buildEdit` table, Commands, Context keys, Copilot gateway (BR-1), Domain types, Folder layout (+11 more)

### Community 70 - "Bot Rider — Standard deliverables (additive slice)"
Cohesion: 0.11
Nodes (16): 0. Non-negotiables (PO + SD-1–4 + §21), 10. Tests (merge bar after PO allocates), 1. Component, 2. Format and outline (SD-1, SD-2), 3. Swarm ask (no new protocol type), 4. Implementer JSON and builder (SD-3), 5. Changeset (same BR-6), 6. Open (SD-4 + §21.2) (+8 more)

### Community 71 - "Bot Rider — Token-save (additive slice)"
Cohesion: 0.12
Nodes (16): 0. Non-negotiables (PO 2026-08-28 + §17 + BA + QC), 1. Why, 2. Components, 3. Protocol (additive HostToUi) — matches §17.7 exactly, 4. Swarm chrome (pointer), 5. PromptBuilder / TokenGovernor, 6. LSP slice, 7. Orchestrator (+8 more)

### Community 72 - "Bot Rider — F7 isolation / SI-1–4 (additive slice, host-only)"
Cohesion: 0.13
Nodes (15): 0. Non-negotiables, 1. Component, 2. Types (host) — SI-1, 3. Publish rules (SI-2), 4. Downstream (SI-2), 5. Pack / TokenGovernor (SI-4 + QC), 6. Protocol (isolation — zero chrome), 7. Out of this slice (+7 more)

### Community 73 - "Bot Rider — F2 OpenSpec / contract traceability (additive slice)"
Cohesion: 0.13
Nodes (15): 0. Non-negotiables, 1. Component, 2. Catalog (OS-1), 3. Cite (OS-2), 4. Review chrome (OS-3) — protocol, 5. Isolation ingest (OS-4), 6. Pack / TokenGovernor (OS-4 + SI-4 + QC), 7. Out of this slice (+7 more)

### Community 74 - "Bot Rider UI/UX Specification"
Cohesion: 0.13
Nodes (15): 20. Bot form attachments (typed slots, locked), 22. Per-bot model picker (F5), 23. Bot export / import (F6), 24. OpenSpec chips on Proposed Changes Files (F2), 25. Context Map (F1, Bot Rider–owned), 26. Parallel Debate stream (F7), 27. Work run (F8a), 28. Sequential Argue (F8b) (+7 more)

### Community 75 - "Bot Rider UI/UX Specification"
Cohesion: 0.13
Nodes (15): Bot Rider UI/UX Specification, Bots tree and form, Commands (category **Bot Rider**), Context keys, Contribution points, Copy deck, Expand, Menus (+7 more)

### Community 76 - "17. Run board (additive Swarm chrome)"
Cohesion: 0.15
Nodes (13): 17.10 Copy exact, 17.11 Pack overflow, 17.1 Placement, 17.2 Anatomy, 17.3 Todos tick, 17.4 Empty, 17.5 Files vs Proposed Changes, 17.6 Sidebar vs Expand (+5 more)

### Community 77 - "26. Parallel Debate stream (F7)"
Cohesion: 0.17
Nodes (12): 26.10 Copy exact, 26.1 Surfaces, 26.2 Overlap (Debate batch only), 26.3 Round headers, 26.4 Run board in-flight, 26.5 Composer and Stop, 26.6 Pack overflow, 26.7 Accessibility (+4 more)

### Community 78 - "17. Run board (additive Swarm chrome)"
Cohesion: 0.17
Nodes (12): 17.10 Copy exact, 17.11 Pack overflow, 17.1 Placement, 17.2 Anatomy, 17.3 Todos tick, 17.4 Empty, 17.5 Files vs Proposed Changes, 17.6 Sidebar vs Expand (+4 more)

### Community 79 - "ChangeFile"
Cohesion: 0.22
Nodes (3): parseAgreeWriter(), CollisionClaim, ChangeFile

### Community 80 - "orchestrator.ts"
Cohesion: 0.08
Nodes (33): usesPerBotModel(), templateForBot(), curateFacts(), oneLine(), MentionParse, oneLine(), parseMentions(), parseVote() (+25 more)

### Community 81 - "23. Bot export / import (F6)"
Cohesion: 0.18
Nodes (11): 23.1 Surfaces, 23.2 Commands (package.json stubs), 23.3 Format QuickPick and files (EX-1), 23.4 Collision (EX-3), 23.5 Multi-import and toasts (EX-2), 23.6 Dirty form, 23.7 Host ↔ UI, 23.8 Tree multi-select (+3 more)

### Community 82 - "25. Context Map (F1, Bot Rider–owned)"
Cohesion: 0.18
Nodes (11): 25.1 Surfaces, 25.2 Layer toggle (CM-2), 25.3 Canvas and nodes, 25.4 Detail strip (CM-3), 25.5 Empty states, 25.6 Refresh (Workspace), 25.7 Host ↔ UI, 25.8 Unchanged (+3 more)

### Community 83 - "Bot Rider — Per-bot Copilot model selection (additive slice)"
Cohesion: 0.20
Nodes (10): 0. Non-negotiables (PO + MS-1–3 + §22), 1. Component, 2. BotRecord (additive), 3. Discovery and labels (MS-1), 4. Runtime resolve (MS-2, MS-3), 5. Protocol (additive), 6. Copy, 7. Out of this slice (+2 more)

### Community 84 - "Troubleshoot Bot Rider"
Cohesion: 0.25
Nodes (7): Copilot, Install / launch, MCP (optional), Proposed Changes, Still stuck, Swarm / debate, Troubleshoot Bot Rider

### Community 85 - "transcript-replay.test.ts"
Cohesion: 0.29
Nodes (6): chat, expanded, extension, hub, protocol, root

### Community 86 - "Bot Rider — Staged MCP actions (additive slice)"
Cohesion: 0.22
Nodes (9): 0. Non-negotiables (PO + MA-1–4 + §19), 1. Component, 2. McpGateway (additive), 3. Copilot tool loop, 4. McpActionStore, 5. Grain B, 6. Protocol, 7–9 (+1 more)

### Community 87 - "inject-product-knowledge.mjs"
Cohesion: 0.14
Nodes (8): documents, edgeKeys, graph, graphPath, mappings, nodeIds, requirementNodes, root

### Community 89 - "Architecture decisions"
Cohesion: 0.22
Nodes (9): Architecture decisions, Decision: Apply only from `ChangesetStore.approve()`, Decision: Copilot only through `vscode.lm`, Decision: Language-only debate, JSON implementer, Decision: Session-only transcript and pending changeset, Design: Bot Rider MVP, Module map, Risks (+1 more)

### Community 90 - "Tasks: Bot Rider MVP"
Cohesion: 0.22
Nodes (8): 1. Extension shell and contribution points, 2. BR-1 Copilot-only vscode.lm, 3. BR-2 / BR-3 Bots and persistence, 4. BR-4 Swarm chat UI, 5. BR-5 Debate & Decide, 6. BR-6 Changeset apply, 7. Tests and docs, Tasks: Bot Rider MVP

### Community 91 - "RecordingUi"
Cohesion: 0.33
Nodes (3): ImportGate, ImportUi, RecordingUi

### Community 92 - "[SECTION] Context, editing, portability, and audit · docs_product_requirements_crosswalk_md"
Cohesion: 0.33
Nodes (6): [DOC] Product requirements crosswalk, [SECTION] Conflict transition rule · docs_product_requirements_crosswalk_md, [SECTION] Context, editing, portability, and audit · docs_product_requirements_crosswalk_md, [SECTION] Product constraints · docs_product_requirements_crosswalk_md, [SECTION] Recovery requirements · docs_product_requirements_crosswalk_md, [SECTION] Shipped capability inventory · docs_product_requirements_crosswalk_md

### Community 93 - "Bot Rider — Human voice (additive slice)"
Cohesion: 0.25
Nodes (8): 0. Non-negotiables (PO + BA HV-1–3 + §18), 1. PromptBuilder / turn instructions (HV-1, HV-3), 2. Host strip (HV-2), 3. Protocol / stores, 4. Out of this slice, 5. Tests (merge bar after PO allocates), BA locks (HV-1–3 stay the set — no new stories), Bot Rider — Human voice (additive slice)

### Community 94 - "18. Swarm article prose (additive chrome)"
Cohesion: 0.15
Nodes (12): 18.1 Surfaces, 18.2 Host-stripped source of truth, 18.3 Keep, 18.4 Do not, 18.5 Streaming, 18.6 Consume leftover hashes, 18. Swarm article prose (additive chrome), Bot Rider — UI/UX addendum: Swarm article prose (+4 more)

### Community 95 - "24. OpenSpec chips on Proposed Changes Files (F2)"
Cohesion: 0.25
Nodes (8): 24.1 Surfaces, 24.2 Chip text and placement, 24.3 Unknown and empty catalog, 24.4 Host ↔ UI, 24.5 Unchanged, 24.6 Out, 24. OpenSpec chips on Proposed Changes Files (F2), Bot Rider — UI/UX addendum: OpenSpec spec-id chips

### Community 96 - "19. Staged MCP actions (additive chrome, Grain B)"
Cohesion: 0.25
Nodes (8): 19.1 Two independent gates, 19.2 Proposed Changes — second section, 19.3 Swarm Review card only, 19.4 Failed MCP Approve, 19.5 Protocol types, 19.6 Skip / mutating-blocked, 19.7 Session-only, 19. Staged MCP actions (additive chrome, Grain B)

### Community 97 - "ADDED Requirements"
Cohesion: 0.25
Nodes (7): ADDED Requirements, Delta for Copilot (BR-1), Purpose, Requirement: Copilot vendor filter, Requirement: Request and status contract, Scenario: CRUD does not select models, Scenario: Recheck click

### Community 98 - "Bot Rider"
Cohesion: 0.40
Nodes (5): Bot Rider, Documentation, How it works, Requirements, Run from source (F5)

### Community 99 - "BR-4 Debate & Decide"
Cohesion: 0.50
Nodes (4): Acceptance (architecture rev 7), BR-4 Debate & Decide, Purpose, SHALL requirements

### Community 100 - "Install Bot Rider"
Cohesion: 0.20
Nodes (9): 1. Clone and install, 2. Open this folder in VS Code, 3. Launch the Extension Development Host, 4. First run (Development Host only), 5. Done when, 6. Prompt you can paste into Copilot Chat, Install Bot Rider, Out of this guide (+1 more)

### Community 102 - "18. Swarm article prose (additive chrome)"
Cohesion: 0.29
Nodes (7): 18.1 Surfaces, 18.2 Host-stripped source of truth, 18.3 Keep, 18.4 Do not, 18.5 Streaming, 18.6 Consume leftover hashes, 18. Swarm article prose (additive chrome)

### Community 103 - "Proposal: Bot Rider MVP"
Cohesion: 0.29
Nodes (7): Approach, In scope (BR-1 … BR-6), Intent, Out of scope, Proposal: Bot Rider MVP, Scope, Why

### Community 104 - "ADDED Requirements"
Cohesion: 0.29
Nodes (6): ADDED Requirements, Delta for Bots (BR-2), Purpose, Requirement: Bot record and handle, Requirement: Toggle vs freeze, Scenario: New Bot form

### Community 105 - "ADDED Requirements"
Cohesion: 0.29
Nodes (6): ADDED Requirements, Delta for Changeset Apply (BR-6), Purpose, Requirement: Failed apply never claims success, Requirement: Whole-changeset Approve, Scenario: Success

### Community 106 - "ADDED Requirements"
Cohesion: 0.29
Nodes (6): ADDED Requirements, Delta for Debate & Decide (BR-5), Purpose, Requirement: Language-only debate and @; separate implementer, Requirement: Split Continue / Pick / Stop, Requirement: Two-round cap and freeze

### Community 107 - "ADDED Requirements"
Cohesion: 0.29
Nodes (6): ADDED Requirements, Delta for Swarm Chat (BR-4), Purpose, Requirement: Swarm surfaces, Requirement: Webview contract, Scenario: @ picker

### Community 108 - "BR-5 Mentions, split, implementer"
Cohesion: 0.29
Nodes (7): Acceptance (architecture rev 7), BR-5 Mentions, split, implementer, Implementer, Mentions, Purpose, SHALL requirements, Split

### Community 109 - "[REQ] PU-8"
Cohesion: 0.33
Nodes (4): [REQ] PU-8, [SECTION] Acceptance · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_8_public_installation, [SECTION] Requirement · openspec_specs_pu_1_product_usability_spec_md · doc_openspec_specs_pu_1_product_usability_spec_md_pu_8_public_installation, root

### Community 110 - "Bot Rider architecture (rev 7)"
Cohesion: 0.33
Nodes (6): Apply table (`ChangesetStore.buildEdit`), Bot Rider architecture (rev 7), Host ids, Host → UI, Protocol, UI → host

### Community 111 - "Product requirements crosswalk"
Cohesion: 0.33
Nodes (6): Conflict transition rule, Context, editing, portability, and audit, Product constraints, Product requirements crosswalk, Recovery requirements, Shipped capability inventory

### Community 112 - "Delta for Persistence (BR-3)"
Cohesion: 0.33
Nodes (5): ADDED Requirements, Delta for Persistence (BR-3), Purpose, Requirement: globalState bots, no Settings Sync, Scenario: Reload

### Community 113 - "Contribution points"
Cohesion: 0.40
Nodes (5): Commands (category **Bot Rider**), Context keys, Contribution points, Menus, Views welcome

### Community 114 - "Swarm"
Cohesion: 0.40
Nodes (5): Expand, @ picker, Split UI, Swarm, Webview engineering

### Community 117 - "BR-3 Bot toggle, delete, persist"
Cohesion: 0.50
Nodes (4): Acceptance (architecture rev 7), BR-3 Bot toggle, delete, persist, Purpose, SHALL requirements

### Community 118 - "QC-1 Token-save (run board + compact pack)"
Cohesion: 0.50
Nodes (4): Acceptance, Purpose, QC-1 Token-save (run board + compact pack), SHALL requirements

### Community 119 - "SI-1 F7 isolation (host-only)"
Cohesion: 0.40
Nodes (4): Acceptance, Purpose, SHALL requirements, SI-1 F7 isolation (host-only)

### Community 121 - "BR-2 Bot create / edit"
Cohesion: 0.50
Nodes (4): Acceptance (architecture rev 7), BR-2 Bot create / edit, Purpose, SHALL requirements

### Community 125 - "EX-1 Bot export / import"
Cohesion: 0.50
Nodes (4): Acceptance, EX-1 Bot export / import, Purpose, SHALL requirements

### Community 127 - "[SECTION] 4. Recovery requirements · docs_master_product_requirement_document_md"
Cohesion: 0.07
Nodes (27): [DOC] Bot Rider Master Product Requirements, [SECTION] 1. Document authority · docs_master_product_requirement_document_md, [SECTION] 2. Audited baseline · docs_master_product_requirement_document_md, [SECTION] 3. Product constraints · docs_master_product_requirement_document_md, [SECTION] PRD-C1 · docs_master_product_requirement_document_md · doc_docs_master_product_requirement_document_md_3_product_constraints, [SECTION] PRD-C2 · docs_master_product_requirement_document_md · doc_docs_master_product_requirement_document_md_3_product_constraints, [SECTION] PRD-C3 · docs_master_product_requirement_document_md · doc_docs_master_product_requirement_document_md_3_product_constraints, [SECTION] PRD-C4 · docs_master_product_requirement_document_md · doc_docs_master_product_requirement_document_md_3_product_constraints (+19 more)

### Community 130 - "BR-6 Gated workspace edit"
Cohesion: 0.50
Nodes (4): Acceptance (architecture rev 7), BR-6 Gated workspace edit, Purpose, SHALL requirements

### Community 134 - "MS-1 Per-bot Copilot model selection"
Cohesion: 0.50
Nodes (4): Acceptance, MS-1 Per-bot Copilot model selection, Purpose, SHALL requirements

### Community 136 - "BR-1 Copilot gateway"
Cohesion: 0.50
Nodes (4): Acceptance (architecture rev 7), BR-1 Copilot gateway, Purpose, SHALL requirements

## Knowledge Gaps
- **904 isolated node(s):** `C:\Users\iprav\.local\bin\serena.exe`, `start-mcp-server`, `C:\Users\iprav\.local\bin\graphify-mcp.exe`, `name`, `displayName` (+899 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1116 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Orchestrator` connect `Orchestrator` to `HostToUi`, `token-governor.ts`, `.streamPrepared`, `Application`, `BotRecord`, `ChangeFile`, `orchestrator.ts`, `messages.ts`, `ContextMapHost`, `application.ts`, `openspec-host.test.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `Application` connect `Application` to `HostToUi`, `token-governor.ts`, `fakes.ts`, `Orchestrator`, `bot.ts`, `BotRegistry`, `ContextMapHost`, `application.ts`, `review-tree.ts`, `bot-attach.test.ts`, `bot-export.ts`, `mcp-action-store.ts`, `openspec-host.test.ts`, `.open`, `bot-model.test.ts`, `mcp-gateway.ts`, `context-map-host.test.ts`, `ThreadStore`, `[REQ] PU-1`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `BotRecord` connect `BotRecord` to `token-governor.ts`, `deliverable-builder.ts`, `Application`, `Orchestrator`, `bot.ts`, `BotRegistry`, `application.ts`, `bot-attach.test.ts`, `bot-export.ts`, `openspec-host.test.ts`, `.open`, `bot-model.test.ts`, `.streamPrepared`, `context-map-host.test.ts`, `context-map.ts`, `messages.ts`, `.buildRun`, `[REQ] PU-1`, `ChangeFile`, `orchestrator.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `activate()` (e.g. with `.reveal()` and `.bindThread()`) actually correct?**
  _`activate()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `C:\Users\iprav\.local\bin\serena.exe`, `start-mcp-server`, `C:\Users\iprav\.local\bin\graphify-mcp.exe` to the rest of the system?**
  _904 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `chat.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05346164127238706 - nodes in this community are weakly interconnected._
- **Should `HostToUi` be split into smaller, more focused modules?**
  _Cohesion score 0.10975609756097561 - nodes in this community are weakly interconnected._