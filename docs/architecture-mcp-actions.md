# Bot Rider — Staged MCP actions (additive slice)

Status: **shipped (MA-1–MA-4 + PU-6 batch approval).** Verified by `test/mcp-actions.test.ts`, `test/mcp-gateway.test.ts`, and `test/mcp-actions-chrome.test.ts`. Implementation-allocation notes below are historical.
Stories: **MA-1** discover existing servers, **MA-2** stage mutating tools on debate/@ (and Continue extra rounds), **MA-3** independent MCP Approve/Reject (Grain B), **MA-4** fail / skip / PU-7-restorable pending.
UI chrome contract: `ui-ux-spec.md` §19 (addendum `ui-ux-mcp-actions.md`).
Date: 2026-08-30.
Parent: `architecture-mvp.md`. Reads: `architecture-workspace-mcp.md` (WM-1–3 **unchanged**; WM-4 “never invoke write” is **superseded** by staging + MCP-gate Approve). Additive protocol. **No pack/TokenGovernor change. No HV change.**

Split (when PO allocates): **Developer 1** host (`McpGateway` stage path, `McpActionStore`, CopilotGateway loop, commands). **Developer 2** Proposed Changes MCP section + Swarm `MCP actions · {n}` Review card. QA after both.

---

## 0. Non-negotiables (PO + MA-1–4 + §19)

- Discover servers **already** in the VS Code workspace / user MCP catalog (`vscode.lm.tools` tagged `mcp`). **No** Bot Rider install, **no** secrets in the extension, **no** `mcp.json` writes, **no** OAuth UI. Figma / Azure Boards are **examples in copy**, not hardcoded vendors.
- **Reads:** unchanged. Live `chat/mcp-read-*` on propose / critique / `@` and **Continue extra rounds**. Current-turn pack. `MAX_MCP_TOOL_ROUNDS` still 8.
- **Vote / Split / Stop / implementer:** still **no MCP tools**. Implementer is JSON files only. Stop never starts implementer and never invokes staged MCP.
- **Mutations:** Copilot may **propose** tools that are not `readOnlyHint`. Host **STAGES** them. **Never** `invokeTool` a write inside the Copilot tool loop. Execute **only** on MCP-gate Approve. Reject discards **that MCP batch only**.
- **Grain B:** MCP Approve/Reject is **independent of BR-6**. Two gates if both exist. User picks order. File fail does **not** block MCP Approve. MCP fail does **not** roll back files. **One click must not apply both.**
- Pending MCP batch metadata is **restorable** from PU-7 workspace recovery snapshots. Restored actions never auto-execute. File pending store unchanged on MCP-only Reject.
- Failed MCP Approve: **keep the batch**, never claim success, no silent retry. Retry must not be blocked solely because the remote object now exists/changed. Copy **exact** §19.4.
- Missing MCP: visible skip. Unauth: visible error, no silent retry. §16 `mutating-blocked` copy **only when the host cannot stage**.
- Additive. **BR-1–6, QC packs, HV frozen.** Leftovers 002/003/009/014 out. Graphify out. No fourth view. No Run-board MCP region. No token chrome. No pre-Send gate.

---

## 1. Component

CopilotGateway.send (propose | critique | direct | Continue extra debate): options.tools = listReadOnly() union listStageable(). Read-only invoke as today. Mutating + can stage: McpActionStore.append, mcp/actions-preview, tool-result staged not executed. NEVER invokeTool on a mutating call in this loop. cannot stage: chat/mcp-skip mutating-blocked. consensus/implement: tools none. mcp/actions-approve invokes staged tools outside Copilot loop. mcp/actions-reject discards MCP batch only. changeset/approve applyEdit only.

## 2. McpGateway (additive)
Keep listReadOnly/allow/invoke/ensureStartedFromSend. Add listStageable() and decide(call) -> invoke | stage | McpSkipReason. Stageable = mcp-tagged and not in listReadOnly. No vendor match. Cannot stage = mutating-blocked + existing Writes through {server} copy.

## 3. Copilot tool loop
opts.tools: mcp-debate | none. Propose/critique/direct/Continue extra debate = mcp-debate. Consensus, implementer, turns after Split/Stop open = none. Stage: do not invokeTool; emit full mcp/actions-preview; feed Copilot "Staged for user Approve. Not executed."; no Swarm thread args dump. argsLine ~80 chars. MAX_MCP_TOOL_ROUNDS still caps the Copilot loop not Approve invokes. Stop cancels in-flight reads, does not execute staged MCP; pending stays until Reject, successful Approve, or reload.

## 4. McpActionStore
Session-scoped with PU-7 metadata restore. snapshot/append/clear/approve. Append deduplicates equivalent server/tool/argument payloads. Approve walks in order and invokes outside `sendRequest`, reports progress, and checks cancellation between actions. Success removes that action immediately. Cancellation preserves the remainder. Failure keeps `leftoverIds` from the failed action onward, emits `mcp/actions-failed`, and never claims success. Retry invokes only the remainder. Reject emits `mcp/actions-cleared`; files stay untouched. Reload without recovery Discard may clear the batch.

## 5. Grain B
Files BR-6 changeset/approve applyEdit only. MCP mcp/actions-approve invoke staged only. Two pairs when both pending. User order. File fail does not block MCP Approve. MCP fail does not roll back files or set applyFailed. One click must not send both messages. MCP Approve allowed while Split is open; new staging is not.

MCP Approve first shows one modal Bot Rider confirmation containing every deduplicated staged action. Confirmed actions execute sequentially in one cancellable progress notification. VS Code 1.99 requires `toolInvocationToken: undefined` outside a Chat Participant request; custom webviews cannot mint a valid token. Platform-owned per-tool native confirmations therefore cannot be coalesced by Bot Rider.

## 6. Protocol
McpActionDto: id, server, tool, argsLine, botId, handle.
HostToUi: mcp/actions-preview { actions }, mcp/actions-cleared, mcp/actions-failed { message, leftoverIds }.
UiToHost: mcp/actions-approve, mcp/actions-reject.
Failed message exact:
MCP actions failed
Some remote side effects (Figma, Azure Boards, or other servers) may already have happened and may not roll back.
Swarm card MCP actions · {n} + Review consumes preview. No Approve on the card.

## 7–9
Copy/skip table as architected. Out: combined Approve, per-action Accept, live mutating invoke, files-first, Run-board MCP, fourth sidebar, token chrome, pre-Send gate, Bot Rider OAuth, Graphify, leftovers 002/003/009/014, pack/HV, implementer MCP.
Tests: debate stages mutating with invokeTool 0 during send; vote/implementer tools none; preview has server/tool/argsLine/handle; changeset/approve does not invoke MCP; mcp/actions-approve does not applyEdit; failed keep leftover + locked copy; reject/reload cleared without clearing files; cannot-stage still mutating-blocked; no Figma/Azure in McpGateway except fail copy; WM/QC/HV tests still pass.
