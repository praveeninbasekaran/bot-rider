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

Shared types from architecture rev 7: `ErrorCode`, `CopilotStatus`, `TurnKind`, `RunStateDto.applyFailed`, `NEED_EDIT` last-line, `AGREE` \| `DISSENT`, fenced JSON `files[]`, Retry when `botrider.applyFailed`, Stop = `botrider.chat.stop`.
