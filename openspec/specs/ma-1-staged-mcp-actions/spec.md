# MA-1 Staged MCP actions (Grain B)

## Purpose

Discover existing workspace/user MCP servers. Stage mutating tools on debate/`@`. Independent MCP Approve/Reject (Grain B). Session-only pending. Canonical architecture: [docs/architecture-mcp-actions.md](../../../docs/architecture-mcp-actions.md). Chrome: [docs/ui-ux-mcp-actions.md](../../../docs/ui-ux-mcp-actions.md) §19.

## SHALL requirements

1. The host SHALL discover servers already in the VS Code MCP catalog (`vscode.lm.tools` tagged `mcp`). SHALL NOT install servers, store secrets, write `mcp.json`, or show Bot Rider OAuth. Figma / Azure Boards are fail-copy examples only.
2. Mutating tools on propose / critique / `@` and Continue extra rounds SHALL be **staged**. The host SHALL NEVER `invokeTool` a write inside the Copilot tool loop. Execute only on MCP-gate Approve.
3. Vote / Split / Stop / implementer SHALL stay `tools: none`. Reads (WM-1–3) unchanged.
4. MCP Approve/Reject SHALL be independent of BR-6. Two gates if both exist. User picks order. File fail SHALL NOT block MCP Approve. MCP fail SHALL NOT roll back files or set `applyFailed`. One click SHALL NOT apply both.
5. Pending MCP batch SHALL be session-only. Failed Approve SHALL keep `leftoverIds` and the locked §19.4 copy. `mutating-blocked` copy only when the host cannot stage.

## Acceptance

- GIVEN a mutating tool on debate, THEN it is staged (`mcp/actions-preview`) and `invokeTool` count during `sendRequest` stays 0.
- GIVEN `changeset/approve`, THEN MCP is not invoked. GIVEN `mcp/actions-approve`, THEN `applyEdit` is not called.
- GIVEN both gates pending, THEN one click cannot send both approve messages.
