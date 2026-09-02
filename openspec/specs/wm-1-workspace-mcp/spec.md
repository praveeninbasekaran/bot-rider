# WM-1 Workspace MCP (read-only)

## Purpose

Read-only `vscode.lm` MCP tools on propose, critique, and `@`-direct. Vote and implementer stay `tools: 'none'`. Missing MCP is silent (no empty banner). Canonical architecture: [docs/architecture-workspace-mcp.md](../../../docs/architecture-workspace-mcp.md) and [docs/architecture-mvp.md](../../../docs/architecture-mvp.md). WM-4 never-invoke-write is superseded by [docs/architecture-mcp-actions.md](../../../docs/architecture-mcp-actions.md); reads unchanged.

## SHALL requirements

1. The host SHALL offer MCP tools only on propose, critique, and `@`-direct (and Continue extra debate rounds). Consensus/vote and implementer SHALL send `tools: 'none'`.
2. The host SHALL NOT keyword-select tools. Copilot proposes; the host SHALL pass the read-only subset (`mcp` + `readOnlyHint === true`, fail-closed) and SHALL invoke only when that hint holds and the name gate passes.
3. The host SHALL NOT pre-fetch every tool into the prompt. Tools go on `sendRequest`, not as prompt text.
4. HostToUi `chat/mcp-read-start` / `end` / `skip` SHALL fire only for a specific tool call this turn. Unused servers, or unused failed starts, SHALL be silent. No skip banner for them.
5. If no MCP is configured, the host SHALL stay silent (WM-1 AC2). Not an error.
6. Current-turn MCP reads (WM-2) remain TokenGovernor extras: trim MCP payload size first.

## Acceptance

- GIVEN vote or implementer, THEN `tools` is `none` and no MCP-read banner.
- GIVEN no MCP configured, THEN no start/end/skip messages and no empty banner.
- GIVEN a read-only tool this turn, THEN `chat/mcp-read-start` then `end` (or `skip`) for that call only.
