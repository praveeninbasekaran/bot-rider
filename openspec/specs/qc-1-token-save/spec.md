# QC-1 Token-save (run board + compact pack)

## Purpose

Host-owned compact run board in Swarm plus compact Copilot packs. TokenGovernor is host-deterministic. Canonical architecture: [docs/architecture-token-save.md](../../../docs/architecture-token-save.md). Chrome: [docs/ui-ux-run-board.md](../../../docs/ui-ux-run-board.md) §17.

## SHALL requirements

1. Swarm SHALL keep full prose. The board is host-owned facts (goal, todos, decisions, Split-only dissents, files in play). Not a fourth view. Reload clears the board.
2. `dissents[]` SHALL be written only when Split opens. Vote DISSENT SHALL NOT update Dissents.
3. Debate/`@` pack SHALL be prompt + board + LSP slice of the active file (replaces full buffer) + tab paths. Implementer SHALL get full file(s) being written + board; **no** LSP slice on implementer.
4. TokenGovernor SHALL trim extras first (MCP payload, vote compact). If the minimum pack will not fit: Swarm thread `error` `code: 'pack-overflow'`, no `sendRequest`, no silent retry. Do not drop the LSP slice and still call.
5. No Graphify in-tree. No speaker cap. No pre-Send estimate/gate. No token-cop bot.

## Acceptance

- GIVEN Split, THEN Dissents are Split-card one-liners and vote remainder is not `dissents[]`.
- GIVEN debate/`@`, THEN the pack does not include the full active-editor buffer together with the slice.
- GIVEN minimum pack overflow, THEN pack-overflow is a thread error and Copilot is not called.
