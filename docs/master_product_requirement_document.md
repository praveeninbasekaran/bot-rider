# Bot Rider Master Product Requirements

Status: **authoritative product roadmap**  
Baseline date: **2026-09-04**

## 1. Document authority

This document defines the product direction and supersedes contradictory scope decisions in the revision-7 MVP documents. Existing OpenSpec requirements remain the acceptance contract for shipped behavior until a superseding recovery requirement is implemented.

Authority order:

1. This master product requirements document defines product intent and roadmap priority.
2. `openspec/specs/pu-1-product-usability/spec.md` defines the recovery acceptance criteria.
3. Capability specs under `openspec/specs/` define shipped behavior that has not been superseded.
4. Architecture documents describe implementation design and must not silently redefine product requirements.

The requirement and implementation crosswalk is maintained in [product-requirements-crosswalk.md](./product-requirements-crosswalk.md).

## 2. Audited baseline

The repository is beyond the original MVP baseline:

- Copilot-only model discovery and per-bot model selection are shipped.
- Bot JSON/YAML import and export are shipped.
- Per-bot session isolation is shipped.
- Parallel Debate and Work batches are shipped.
- OpenSpec citation chips and packet ingest are shipped.
- The on-demand Context Map is shipped.
- Standard document deliverables are shipped.

Recovery P0–P3 is shipped. Remaining product gaps:

- snapshot schema migration for older workspace recovery versions;
- incremental/LSP-backed repository indexing beyond the current local AST scan;
- runtime task/proposed-file graph links in the Context Map;
- packaged-extension activation smoke beyond isolated install;
- recorded non-developer first-task usability attestation before a public tag release;
- P4 technical-debt audit, richer 2D visualization, and 3D evaluation remain deferred.

## 3. Product constraints

### PRD-C1 — Copilot only

All model requests MUST use `vscode.lm` with Copilot models. Bot Rider MUST NOT require separate model API keys.

Status: **shipped**.

### PRD-C2 — Deterministic control plane

Scheduling, dependency validation, cancellation, concurrency, approvals, and workspace-write safety MUST remain deterministic host responsibilities.

The product MUST NOT delegate these guarantees to an LLM orchestrator bot. The Dispatcher bot MAY propose a task dependency graph; host code MUST validate and execute it.

Status: **shipped**. Lifecycle, Debate, Work, and review policies are separated from the host execution engine. The typed dependency graph, bounded Copilot scheduler, typed event bus, and deterministic approvals remain host-owned.

### PRD-C3 — Local-first context

Repository indexing and documentation retrieval MUST run locally by default. Missing optional semantic components MUST degrade to deterministic symbol and text retrieval.

Status: **shipped**. Local repository indexing, Markdown retrieval, LSP slice fallback, and bounded prompt injection run without external semantic services.

### PRD-C4 — Explicit side-effect approval

Workspace writes and mutating MCP calls MUST remain separately reviewable. Approval MUST be understandable as one review workflow without silently combining the two side-effect gates.

Status: **shipped with platform limitation**. Consolidated navigation, selective file approval, one full-batch MCP confirmation, deduplication, sequential progress, cancellation, and remainder preservation are shipped. VS Code-native per-tool prompts may still appear when no Chat Participant invocation token exists.

## 4. Recovery requirements

Detailed acceptance criteria are in `openspec/specs/pu-1-product-usability/spec.md`.

### PU-1 — Protected core bots

Every installation MUST contain one active Spec bot and one active Dispatcher bot. Users MAY change model and safe persona wording. Users MUST NOT delete, deactivate, undesignate, or remove the core responsibility clauses from these bots.

Status: **shipped**. Activation idempotently adopts or seeds one protected active Spec and Dispatcher. Core identity, designation, activity, responsibilities, and deletion are host-protected; model and persona remain customizable.

### PU-2 — Swarm transcript parity

The sidebar and expanded Swarm MUST show the same ordered user turns, bot turns, notices, errors, Split state, and pending-review state whenever either webview is created or reopened.

Status: **shipped**. The host records a versioned ordered snapshot and replays it idempotently in both Swarm surfaces.

### PU-3 — Bounded Copilot concurrency

Bot Rider MUST bound concurrent Copilot requests. Excess requests MUST queue. Stop MUST cancel queued and in-flight work belonging to the run. Rate-limit failures MUST use bounded retry with visible status.

Status: **shipped**. A configurable host scheduler bounds requests, queues fairly, prioritizes directed turns without starvation, cancels by run token, and safely retries quota failures with visible state.

### PU-4 — Dependency-aware execution

The Dispatcher MUST emit a typed task dependency graph. Host code MUST reject cycles, unknown bots, missing artifacts, unsafe ordering, and overlapping path claims within a parallel wave.

Only dependency-ready tasks MAY run. Planning and architecture artifacts MUST complete before dependent coding. QA MUST wait for the implementation artifacts it validates.

Status: **shipped**. Dispatcher DAGs are host-validated and executed in dependency-ready, path-safe waves with visible blockers and output gates.

### PU-5 — Synthesis-based Debate

Debate MUST separate independent proposals, synthesis, targeted objections, and decision. Ordinary decisions MUST support a configurable quorum policy. Unanimity MUST be reserved for configured high-risk decisions.

Automatic rounds MUST be bounded. Failure to converge MUST produce one recommendation, one dissent summary, and one human escalation.

Status: **shipped**. Debate now runs proposal, Dispatcher-owned synthesis (with deterministic fallback), targeted objection, and host decision stages. Configurable quorum, blocker classes, high-risk unanimity, automatic-round caps, one-time escalation, Continue, and Pick are covered by policy, host, replay, and UI regressions.

### PU-6 — Consolidated review

Swarm MUST expose one idempotent review entry point for pending files and MCP actions. File and MCP approval MUST remain separate safety gates.

Text files MUST open a diff. HTML MUST open a preview. Office deliverables MUST open an inspect flow. MCP actions MUST receive one batch confirmation before execution and MUST NOT generate a prompt storm.

Status: **shipped with platform limitation**. Consolidated navigation, selective file approval, one full-batch MCP confirmation, deduplication, sequential progress, cancellation, and remainder preservation are shipped. VS Code 1.99 only provides `toolInvocationToken` to Chat Participant request handlers; the custom Swarm webview cannot mint one, so VS Code may still require native confirmation for individual tools.

### PU-7 — Reload recovery

Bot Rider MUST persist enough workspace-scoped state to recover the transcript, run phase, dependency graph, Run Board, and pending file review after reload.

Restored MCP actions MUST never execute automatically. The user MUST receive Resume, Review pending, and Discard choices.

Status: **shipped**. A versioned workspace snapshot restores transcript, run/DAG/board state, file proposals, and MCP metadata behind explicit Resume, Review pending, or Discard choices; running turns are marked interrupted. Older snapshot versions are rejected until an explicit migration path is added.

### PU-8 — Public installation

Bot Rider MUST produce an installable VSIX artifact. Installation and first successful task MUST not require cloning the repository or launching an Extension Development Host.

Status: **shipped**. Versioned VSIX packaging, isolated install/activation smoke tests, VSIX-first documentation, CI artifacts, Graphify freshness checks, and an explicit non-developer usability attestation gate complement the guided first-run experience.

## 5. Capability roadmap

### CTX-1 — Whole-repository code graph

Build a local index of files, symbols, imports, and available call relationships. Prompt assembly MUST inject task-relevant neighborhoods rather than whole files.

Status: **shipped**. `RepositoryContextService` builds a separate local file/symbol/import/call index and injects bounded task-relevant neighborhoods without changing the on-demand Context Map.

### CTX-2 — Local documentation retrieval

Index local Markdown and return the most relevant passages for a task without an external vector database.

Status: **shipped**. Local heading-based Markdown chunks are ranked against task terms and trimmed deterministically without an external vector service.

### CTX-3 — Requirements graph links

Link OpenSpec requirements, task nodes, code nodes, and proposed files. Preserve verbatim acceptance criteria when they are required context.

Status: **shipped with follow-up**. The local repository index links requirement IDs, task paths, and proposed files to indexed code/document nodes while preserving the existing OpenSpec catalog and verbatim packet bodies. Runtime Context Map edges for DAG/proposed-file neighborhoods remain a follow-up.

### EDIT-1 — Selective hunk patching

Generated text changes MUST support validated unified hunks, stale-base detection, per-file inclusion, preview, and explicit apply.

Status: **shipped**. Text updates accept validated unified hunks with source hashes, stale-base gates, explicit regeneration, per-file inclusion, selected preview, and one atomic WorkspaceEdit; binary deliverables retain whole-file handling.

### PORT-1 — Bot profile portability

Users MUST be able to import and export one or more bot profiles as JSON or YAML.

Status: **shipped**.

### AUD-1 — Technical-debt audit

After the core workflow is stable, the product SHOULD index TODO, FIXME, unhandled failure paths, and unimplemented contracts in a dedicated audit view.

Status: **deferred**.

### VIZ-1 — Context visualization

After repository context is validated, the product SHOULD provide a useful 2D dependency and run-activity visualization. 3D visualization MUST remain optional and MUST be justified by usability evidence.

Status: **deferred**. The shipped Context Map provides a smaller two-layer graph.

## 6. Resolved conflicts

| Previous rule | Resolution |
| --- | --- |
| Empty first install; no seed bots | Superseded by PU-1 protected Spec and Dispatcher bots |
| Two rounds require unanimous AGREE | Superseded by PU-5 after the synthesis decision policy ships |
| All speakers in a phase start together | Superseded by PU-3 and PU-4; only bounded dependency-ready tasks run together |
| Work starts after designation and path-split validation | Extended by PU-4 semantic artifact gates |
| Transcript and pending work die on reload | Superseded by PU-7 after recovery ships |
| Whole-file replacement | Superseded by EDIT-1 for supported text files |
| File and MCP approvals are independent but fragmented | Safety separation remains; PU-6 consolidates navigation and batch confirmation |
| Context Map must not crawl the repository | Retained for the existing view; CTX-1 adds a separate local indexing service |
| Graphify is not a product runtime dependency | Retained; Graphify remains development knowledge infrastructure |
| Marketplace delivery is out of MVP | Superseded by PU-8 public distribution |

## 7. Delivery order

1. P0: requirements baseline, traceability crosswalk, and development knowledge graph.
2. P0: transcript, review, MCP confirmation, protected core bots, and onboarding.
3. P1: deterministic dependency scheduler and bounded Copilot queue.
4. P1: synthesis-based Debate and calmer parallel UI.
5. P2: hunk patching and reload recovery.
6. P3: whole-repository context and public distribution.
7. P4: technical-debt dashboard and richer visualization.
