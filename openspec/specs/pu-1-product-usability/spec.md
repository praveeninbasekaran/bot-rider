# PU-1–PU-8 Product usability recovery

Status: **shipped**. PU-1–PU-8 have implementation and automated evidence; PU-8 keeps tagged releases blocked until external first-task usability attestation.

Canonical product roadmap: [docs/master_product_requirement_document.md](../../../docs/master_product_requirement_document.md).

## PU-1 Protected core bots

Status: **shipped**. Verified by `test/core-bots.test.ts`, existing Work-role tests, and protected form/tree chrome.

### Requirement

Bot Rider MUST maintain exactly one active protected Spec bot and one active protected Dispatcher bot.

### Acceptance

1. A first installation creates both core bots before the user creates a custom bot.
2. Existing installations are migrated without duplicating a valid designated bot.
3. A missing core bot is repaired on activation.
4. A core bot cannot be deleted.
5. A core bot cannot be deactivated.
6. A core bot cannot lose its core designation.
7. A user may select the core bot's Copilot model.
8. A user may customize safe persona wording.
9. Core responsibility clauses remain host-owned and cannot be removed by profile edits or imports.
10. The core bots are not an LLM control plane: host code retains scheduling and safety decisions.

### Supersedes

The revision-7 rule “Empty swarm on first install. No seed bots.”

## PU-2 Swarm transcript parity

Status: **shipped**. Verified by `test/thread-store.test.ts` and `test/transcript-replay.test.ts`.

### Requirement

Every Swarm surface MUST render the same host-owned ordered transcript and recoverable UI state.

### Acceptance

1. User turns are stored before dispatch.
2. Completed bot turns are stored once.
3. Notices and errors are stored once.
4. Split state is represented in the replay snapshot.
5. Pending file-review state is represented in the replay snapshot.
6. Pending MCP-review state is represented in the replay snapshot.
7. Opening Expand after a conversation shows the existing conversation.
8. Recreating the sidebar shows the existing conversation.
9. Parallel turn ordering is stable and does not duplicate articles.
10. Replaying UI state does not restuff the global transcript into any bot's isolated Copilot session.

## PU-3 Bounded Copilot concurrency

### Requirement

All Copilot requests MUST pass through a host-owned bounded scheduler.

Status: **shipped**. Verified by `test/copilot-scheduler.test.ts`, `test/copilot-gateway.test.ts`, and the existing Stop/in-flight regression suites.

### Acceptance

1. The maximum number of concurrent requests is configurable.
2. Requests above the limit wait in a queue.
3. Equal-priority requests are fair.
4. A user-directed `@bot` request may receive explicit priority without bypassing the concurrency limit.
5. Stop cancels queued work for the run.
6. Stop cancels in-flight work for the run.
7. Rate-limit failures use bounded retry.
8. Queue, in-flight, and retry states are visible.
9. No retry can create a duplicate workspace or MCP side effect.

## PU-4 Dependency-aware execution

### Requirement

The Dispatcher bot MUST propose a typed task dependency graph. Deterministic host code MUST validate and execute it.

Status: **shipped**. Verified by `test/task-graph.test.ts` and the Dispatcher DAG integration case in `test/work-run-host.test.ts`.

### Acceptance

1. Every task has an id, owner, dependency list, required artifacts, path claims, readiness state, retry state, and terminal outcome.
2. Unknown bot handles are rejected.
3. Dependency cycles are rejected.
4. Missing required artifacts are rejected.
5. Unsafe phase ordering is rejected.
6. Overlapping path claims cannot run in the same parallel wave.
7. Coding waits for required Spec artifacts.
8. Coding waits for required Architecture artifacts.
9. QA waits for the implementation artifacts it validates.
10. Only dependency-ready tasks run.
11. Independent ready tasks may run in parallel.
12. Blocked tasks remain queued with a visible reason.
13. Worker output is validated against assigned paths and required artifacts.
14. The host never delegates scheduling, cancellation, concurrency, approval, or safety invariants to an LLM.

### Extends

WK-1–WK-6 Work designation and path-partition validation.

## PU-5 Synthesis-based Debate

Status: **shipped**. Verified by `test/debate-convergence.test.ts`, PU-5 host cases in `test/orchestrator.test.ts`, `test/thread-store.test.ts`, and `test/parallel-stream-chrome.test.ts`.

### Requirement

Debate MUST produce a bounded decision through proposal, synthesis, targeted objection, and decision stages.

### Acceptance

1. Independent proposals may run as one bounded parallel wave.
2. A synthesis turn starts only after the proposal wave settles.
3. Critique receives the settled proposal artifacts it is asked to review.
4. Objections identify a concrete blocking issue.
5. Ordinary decisions support a configurable quorum policy.
6. Unanimity is reserved for configured high-risk decisions.
7. Unchanged objections do not trigger endless rounds.
8. Automatic rounds have a hard cap.
9. Success produces one recommendation and one decision record.
10. Failure produces one recommendation and one concise dissent summary.
11. Failure escalates to the user once.
12. Continue and Pick remain explicit user controls.

### Supersedes

BR-4 unanimity-only convergence when PU-5 is implemented.

## PU-6 Consolidated review

Status: **shipped**. Acceptance 1–16 are verified by `test/deliverable-chrome.test.ts`, `test/mcp-actions.test.ts`, `test/mcp-actions-chrome.test.ts`, and `test/contributions.test.ts`. VS Code-native per-tool confirmation remains platform-owned when no Chat Participant invocation token exists.

### Requirement

Swarm MUST present one understandable review entry point while keeping file and MCP side-effect approvals separate.

### Acceptance

1. One idempotent review strip replaces duplicate review banners.
2. The strip shows pending file and MCP counts.
3. File actions remain available while MCP actions are pending.
4. MCP actions remain available while files are pending.
5. Text files open a side-by-side diff.
6. HTML files open a preview.
7. Office deliverables open an inspect flow.
8. Review path lookup is normalized and preserves the pending file payload.
9. MCP failures are visible in Swarm.
10. One Bot Rider confirmation lists the full staged MCP batch.
11. Equivalent MCP actions are deduplicated before confirmation.
12. Confirmed MCP actions show progress.
13. Remaining actions can be cancelled.
14. A failed action preserves the unexecuted remainder.
15. One file approval never invokes MCP actions.
16. One MCP approval never applies workspace files.

## PU-7 Reload recovery

Status: **shipped**. Verified by `test/recovery.test.ts`, `test/chat-webview.integration.test.ts`, and MCP/interruption regression suites.

### Requirement

Bot Rider MUST preserve enough workspace-scoped state to recover interrupted work without silently repeating side effects.

### Acceptance

1. The run id is persisted.
2. The run phase is persisted.
3. The task dependency graph is persisted.
4. The Run Board is persisted.
5. The Swarm transcript is persisted.
6. Pending file-review metadata is persisted.
7. Staged MCP metadata is persisted.
8. Restored MCP actions never execute automatically.
9. Interrupted tasks are marked interrupted rather than completed.
10. Reload offers Resume.
11. Reload offers Review pending.
12. Reload offers Discard.
13. The snapshot schema is versioned.
14. Older supported snapshots are migrated explicitly.

### Supersedes

BR-3 session-loss behavior when PU-7 is implemented.

## PU-8 Public installation

Status: **shipped**. Verified by packaging/install scripts, the Extension Host suite, webview runtime integration, VSIX-first documentation, and `.github/workflows/release.yml`; public release requires explicit non-developer attestation.

### Requirement

Bot Rider MUST be installable and usable without running the repository in an Extension Development Host.

### Acceptance

1. CI produces a versioned VSIX artifact.
2. CI installs the VSIX in a smoke environment.
3. End-user documentation starts with VSIX installation, not F5.
4. The first-run experience verifies Copilot availability.
5. A user can complete a first task without prior repository knowledge.
6. Release is blocked when compile, tests, VSIX smoke, or Graphify freshness checks fail.
