# Bot Rider — UI/UX addendum: Staged MCP actions (Grain B)

Fold into `ui-ux-spec.md` §19. Additive MCP-gate chrome. Not a combined file+MCP Approve. Not grain A.

Architecture: [architecture-mcp-actions.md](./architecture-mcp-actions.md). Two independent Approve gates. File Approve is BR-6 only. MCP Approve is the MCP gate only.

## 19. Staged MCP actions (additive chrome, Grain B)

**Status:** Additive after §17 / §18. Grain B: two independent Approve gates. Not a host rewrite of BR-6. Not one Approve for files+MCP.

**Out:** combined Approve · per-action Accept · Approve on the Swarm card · pending MCP list in the thread · Run-board MCP region · fourth sidebar · token chrome · pre-Send gate · grain A (one Approve for files+MCP) · Bot Rider OAuth.

### 19.1 Two independent gates
Files: `changeset/approve` | `changeset/reject` (`botrider.changeset.approve` / `.reject`) — `applyEdit` only.
MCP: `mcp/actions-approve` | `mcp/actions-reject` (`botrider.mcp.approve` / `.reject`) — invoke staged tools only.
Two pairs when both a file changeset and an MCP batch are pending. User picks order. File fail does **not** block MCP Approve. MCP fail does **not** roll back files or set `applyFailed`. **One click must not apply both** (must not send both messages).

MCP Approve is allowed while Split is open; new staging is not.

### 19.2 Proposed Changes — second section
When an MCP batch is pending, Proposed Changes (`botrider.review`) shows a **second section** for staged MCP actions: `server`, `tool`, `argsLine`, `handle`.
File groups (**Modified** / **Added** / **Deleted**) stay as today.
MCP Approve / Reject are the MCP commands, not the changeset commands.

### 19.3 Swarm Review card only
Consumes `mcp/actions-preview` only. Label **`MCP actions · {n}`** plus **Review**.
**No Approve on the card.** Pending list is **not** in the thread.

### 19.4 Failed MCP Approve
Keep the batch (`leftoverIds` including the failed id). Never claim success. No silent retry. Retry must not be blocked solely because the remote object now exists or changed.

Exact copy:

```
MCP actions failed
Some remote side effects (Figma, Azure Boards, or other servers) may already have happened and may not roll back.
```

Figma / Azure Boards are **examples in copy**, not hardcoded vendors.

### 19.5 Protocol types
`McpActionDto`: `id`, `server`, `tool`, `argsLine`, `botId`, `handle`.

HostToUi: `mcp/actions-preview { actions }`, `mcp/actions-cleared`, `mcp/actions-failed { message, leftoverIds }`.
UiToHost: `mcp/actions-approve`, `mcp/actions-reject`.

Do not invent extra protocol members. Do not use a combined Approve.

### 19.6 Skip / mutating-blocked
§16 `mutating-blocked` copy (`Writes through {server} aren't available in Bot Rider.`) **only when the host cannot stage**.
Staged mutations do not use that copy. Missing MCP: visible skip. Unauth: visible error, no silent retry.

### 19.7 Session-only
Pending MCP batch is session-only (reload clears, like changeset/board). File pending store unchanged. Reject / reload emit `mcp/actions-cleared`; files untouched.
