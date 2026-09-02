# Bot Rider specs index

Architecture blueprint (revision 7): [architecture-mvp.md](./architecture-mvp.md) · also [docs/architecture-mvp.md](../docs/architecture-mvp.md)

UI/UX Specification: [ui-ux-spec.md](./ui-ux-spec.md) · also [docs/ui-ux-spec.md](../docs/ui-ux-spec.md)

| Id | Capability | Spec |
| --- | --- | --- |
| BR-1 | Copilot gateway (`vscode.lm`, vendor `copilot` only) | [specs/br-1-copilot-gateway/spec.md](./specs/br-1-copilot-gateway/spec.md) |
| BR-2 | Bot create / edit | [specs/br-2-bot-create-edit/spec.md](./specs/br-2-bot-create-edit/spec.md) |
| BR-3 | Toggle, delete, persist | [specs/br-3-bot-toggle-delete-persist/spec.md](./specs/br-3-bot-toggle-delete-persist/spec.md) |
| BR-4 | Debate & Decide | [specs/br-4-debate-and-decide/spec.md](./specs/br-4-debate-and-decide/spec.md) |
| BR-5 | Mentions, split, implementer | [specs/br-5-mention-split-implementer/spec.md](./specs/br-5-mention-split-implementer/spec.md) |
| BR-6 | Gated workspace edit | [specs/br-6-gated-workspace-edit/spec.md](./specs/br-6-gated-workspace-edit/spec.md) |
| WM-1 | Workspace MCP (read-only) | [specs/wm-1-workspace-mcp/spec.md](./specs/wm-1-workspace-mcp/spec.md) |
| MA-1 | Staged MCP actions (Grain B) | [specs/ma-1-staged-mcp-actions/spec.md](./specs/ma-1-staged-mcp-actions/spec.md) |
| QC-1 | Token-save (run board + compact pack) | [specs/qc-1-token-save/spec.md](./specs/qc-1-token-save/spec.md) |
| HV-1 | Human voice | [specs/hv-1-human-voice/spec.md](./specs/hv-1-human-voice/spec.md) |
| IE-1 | Bot form import | [specs/ie-1-bot-form-import/spec.md](./specs/ie-1-bot-form-import/spec.md) |
| TA-1 | Typed bot attachments | [specs/ta-1-typed-attachments/spec.md](./specs/ta-1-typed-attachments/spec.md) |
| SD-1 | Standard deliverables | [specs/sd-1-standard-deliverables/spec.md](./specs/sd-1-standard-deliverables/spec.md) |
| MS-1 | Per-bot Copilot model selection | [specs/ms-1-bot-model/spec.md](./specs/ms-1-bot-model/spec.md) |
| SI-1 | F7 isolation (host-only) | [specs/si-1-bot-isolation/spec.md](./specs/si-1-bot-isolation/spec.md) |
| EX-1 | Bot export / import | [specs/ex-1-bot-export-import/spec.md](./specs/ex-1-bot-export-import/spec.md) |

Shared types from architecture rev 7: `ErrorCode`, `CopilotStatus`, `TurnKind`, `RunStateDto.applyFailed`, `NEED_EDIT` last-line, `AGREE` \| `DISSENT`, fenced JSON `files[]`, Retry when `botrider.applyFailed`, Stop = `botrider.chat.stop`.

Later-slice rows are additive catalog ids as stored (`WM-1` … `EX-1`). Do not rewrite BR-1–6 spec files. Host catalog: [docs/architecture-openspec-trace.md](../docs/architecture-openspec-trace.md) (OS-1–4). Missing `openspec/` at runtime = empty catalog, no error.
