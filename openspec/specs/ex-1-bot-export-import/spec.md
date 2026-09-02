# EX-1 Bot export / import

## Purpose

F6 export/import of BR-3 bots as JSON or YAML. Never overwrite. Never execute. No Copilot on export/import. Canonical architecture: [docs/architecture-bot-export-import.md](../../../docs/architecture-bot-export-import.md). Chrome: [docs/ui-ux-bot-export-import.md](../../../docs/ui-ux-bot-export-import.md) §23.

## SHALL requirements

1. Export single / multi / Export All as JSON or YAML. Payload: `name`, `handle`, `persona`, `role`, `instructions`, `active`, `modelId`, typed attachments (`kind` + path label + text snapshot). **Not** SI session / transcript / MCP pending / `id` / `createdAt` / `updatedAt`. Writer always emits `{ format: 'botrider.bots.v1', bots: [...] }`.
2. Import via file picker; create local BR-3 bots (new id, new timestamps) via the existing create path. File = envelope, bare object, or list. Multi-import: per-bot continue.
3. Handle/name collision: Skip or Rename. Never overwrite. Never auto-suffix silently. Cancel rename = Skip. Copy exact: `Skipped @{handle} · already taken.` Name-only: `Skipped "{name}" · a bot with that name already exists.` Prefer the handle line when both collide.
4. Never execute scripts/hooks. No API keys. No Marketplace. No hosted sync. F7 parallel Event Bus **out**. No Copilot on export/import.

## Acceptance

- GIVEN export, THEN the file omits `id` / timestamps / SI session / MCP pending and uses `format: 'botrider.bots.v1'`.
- GIVEN a colliding handle, THEN Skip or Rename is offered and the existing bot is not overwritten.
- GIVEN import of scripts/hooks snapshots, THEN they are not executed and Copilot is not called.
