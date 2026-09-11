# Bot Rider specs index

Product roadmap: [docs/master_product_requirement_document.md](../docs/master_product_requirement_document.md)

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
| OS-1 | OpenSpec traceability (OS-1–OS-4) | [architecture-openspec-trace.md](../docs/architecture-openspec-trace.md) |
| CM-1 | Context Map (CM-1–CM-4) | [architecture-context-map.md](../docs/architecture-context-map.md) |
| EB-1 | Parallel Event Bus (EB-1–EB-4) | [architecture-event-bus.md](../docs/architecture-event-bus.md) |
| WK-1 | Work run (WK-1–WK-6) | [architecture-work-run.md](../docs/architecture-work-run.md#story-map-wk-16) |
| AG-1 | Sequential collision Argue (AG-1–AG-4) | [architecture-work-run.md](../docs/architecture-work-run.md#f8b-sequential-argue-ag-14) |
| FO-1 | Idle follow-on (FO-1–FO-4, planned) | [architecture-work-run.md](../docs/architecture-work-run.md#f8c-idle-follow-on-fo-14) |
| PU-1 | Protected core bots | [specs/pu-1-product-usability/spec.md](./specs/pu-1-product-usability/spec.md#pu-1-protected-core-bots) |
| PU-2 | Swarm transcript parity | [specs/pu-1-product-usability/spec.md](./specs/pu-1-product-usability/spec.md#pu-2-swarm-transcript-parity) |
| PU-3 | Bounded Copilot concurrency | [specs/pu-1-product-usability/spec.md](./specs/pu-1-product-usability/spec.md#pu-3-bounded-copilot-concurrency) |
| PU-4 | Dependency-aware execution | [specs/pu-1-product-usability/spec.md](./specs/pu-1-product-usability/spec.md#pu-4-dependency-aware-execution) |
| PU-5 | Synthesis-based Debate | [specs/pu-1-product-usability/spec.md](./specs/pu-1-product-usability/spec.md#pu-5-synthesis-based-debate) |
| PU-6 | Consolidated review | [specs/pu-1-product-usability/spec.md](./specs/pu-1-product-usability/spec.md#pu-6-consolidated-review) |
| PU-7 | Reload recovery | [specs/pu-1-product-usability/spec.md](./specs/pu-1-product-usability/spec.md#pu-7-reload-recovery) |
| PU-8 | Public installation | [specs/pu-1-product-usability/spec.md](./specs/pu-1-product-usability/spec.md#pu-8-public-installation) |
| CTX-1 | Local repository context (CTX-1–CTX-3) | [specs/ctx-1-repository-context/spec.md](./specs/ctx-1-repository-context/spec.md) |
| EDIT-1 | Selective unified-hunk patching | [specs/edit-1-selective-hunks/spec.md](./specs/edit-1-selective-hunks/spec.md) |

Shared types from architecture rev 7: `ErrorCode`, `CopilotStatus`, `TurnKind`, `RunStateDto.applyFailed`, `NEED_EDIT` last-line, `AGREE` \| `DISSENT`, fenced JSON `files[]`, Retry when `botrider.applyFailed`, Stop = `botrider.chat.stop`.

Later-slice rows are additive catalog ids as stored (`WM-1` … `PU-8`). Amendments to BR-1–BR-6 must describe shipped compatibility behavior or an explicit PU transition. PU requirements supersede conflicting MVP rules only after the corresponding PU capability is implemented. Missing `openspec/` at runtime = empty catalog, no error.
