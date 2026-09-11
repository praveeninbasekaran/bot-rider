# Delta for Persistence (BR-3)

> **Historical delta.** PU-7 supersedes transcript and pending-changeset memory-only rules. See [br-3-bot-toggle-delete-persist](../../specs/br-3-bot-toggle-delete-persist/spec.md) and [pu-1-product-usability](../../specs/pu-1-product-usability/spec.md#pu-7-reload-recovery).

## Purpose

Bots survive reloads locally. Chat and pending edits do not. Settings Sync stays off.

## ADDED Requirements

### Requirement: globalState bots, no Settings Sync
Bots MUST persist in `globalState` key `botrider.bots.v1`. The extension MUST NEVER call `setKeysForSync`. Transcript and pending changeset MUST be memory-only and session-only.

#### Scenario: Reload
- GIVEN saved bots and an in-progress Swarm thread with a pending changeset
- WHEN the user reloads the window
- THEN bots SHALL remain
- AND transcript and pending changeset SHALL be gone
