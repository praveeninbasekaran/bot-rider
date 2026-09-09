# MA-1 Staged MCP actions (Grain B)

## Purpose

Discover existing workspace/user MCP servers. Stage mutating tools on debate/`@`. Independent MCP Approve/Reject (Grain B). Session-only pending. Canonical architecture: [docs/architecture-mcp-actions.md](../../../docs/architecture-mcp-actions.md). Chrome: [docs/ui-ux-mcp-actions.md](../../../docs/ui-ux-mcp-actions.md) §19.

## SHALL requirements

1. The host SHALL discover servers already in the VS Code MCP catalog (`vscode.lm.tools` tagged `mcp`). SHALL NOT install servers, store secrets, write `mcp.json`, or show Bot Rider OAuth. Figma / Azure Boards are fail-copy examples only.
2. Mutating tools on propose / critique / `@` and Continue extra rounds SHALL be **staged**. The host SHALL NEVER `invokeTool` a write inside the Copilot tool loop. Execute only on MCP-gate Approve.
3. Vote / Split / Stop / implementer SHALL stay `tools: none`. Reads (WM-1–3) unchanged.
4. MCP Approve/Reject SHALL be independent of BR-6. Two gates if both exist. User picks order. File fail SHALL NOT block MCP Approve. MCP fail SHALL NOT roll back files or set `applyFailed`. One click SHALL NOT apply both.
5. Pending MCP batch SHALL be restorable from PU-7 workspace recovery snapshots. Restored MCP actions SHALL NOT auto-execute. Failed Approve SHALL keep `leftoverIds` and the locked §19.4 copy. `mutating-blocked` copy only when the host cannot stage.
6. Equivalent staged actions SHALL be deduplicated. MCP Approve SHALL show one complete-batch confirmation, execute sequentially with cancellable progress, and remove only completed actions.
7. Cancellation or failure SHALL preserve the failed or unexecuted remainder. A retry SHALL invoke only that remainder.
8. Outside a Chat Participant request, the VS Code API-required `toolInvocationToken` value SHALL remain `undefined`; Bot Rider SHALL NOT fabricate a token.

## Acceptance

- GIVEN a mutating tool on debate, THEN it is staged (`mcp/actions-preview`) and `invokeTool` count during `sendRequest` stays 0.
- GIVEN `changeset/approve`, THEN MCP is not invoked. GIVEN `mcp/actions-approve`, THEN `applyEdit` is not called.
- GIVEN both gates pending, THEN one click cannot send both approve messages.
- GIVEN duplicate staged actions, THEN one unique action appears in the confirmation and executes once.
- GIVEN cancellation or a mid-batch failure, THEN completed actions are removed and all remaining actions stay pending.
