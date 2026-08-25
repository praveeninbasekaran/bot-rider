# Delta for Persistence (BR-3)

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
