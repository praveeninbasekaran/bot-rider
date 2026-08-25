# Delta for Bots (BR-2)

## Purpose

Users define an uncapped swarm of persona bots. Active is a checkbox, not deletion.

## ADDED Requirements

### Requirement: Bot record and handle
Each bot MUST include name, handle, persona, role, instructions, and active. Handle MUST match `[a-z0-9][a-z0-9_-]{0,31}`, unique case-insensitively, auto-derived from Name then editable. No seed bots; no count cap.

#### Scenario: New Bot form
- GIVEN `!botrider.hasBots`
- WHEN the user opens **New Bot**
- THEN the form SHALL collect Name, Handle, Persona, Role, System instructions, Active
- AND save MUST persist without Copilot

### Requirement: Toggle vs freeze
Toggle Active MUST be `TreeItem.checkboxState` with `manageCheckboxStateManually`. `snapshotActive` is stable list order. In-run edits mutate persist only. `@handle` MUST resolve even if inactive, without flipping the checkbox.
