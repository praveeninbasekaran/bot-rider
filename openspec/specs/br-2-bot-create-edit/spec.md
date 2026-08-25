# BR-2 Bot create / edit

## Purpose

Users SHALL create and edit persona bots (name, handle, persona, role, instructions) without Copilot. Empty swarm on first install. Acceptance follows architecture blueprint **revision 7**.

## SHALL requirements

1. Each bot SHALL be a `BotRecord`: `id`, `handle`, `name`, `persona`, `role`, `instructions`, `active`, `colorIndex`, `createdAt`, `updatedAt`.
2. Handle SHALL match `[a-z0-9][a-z0-9_-]{0,31}`, SHALL be unique case-insensitively, SHALL auto-derive from Name, then remain editable.
3. The Bots view (`botrider.bots`) SHALL offer **New Bot** (`botrider.bots.create`) and inline **Edit Bot** (`botrider.bots.edit`). Command palette SHALL hide edit (`when: false`).
4. The form panel `botrider.botForm` SHALL collect Name, Handle, Persona, Role, System instructions, Active.
5. First install SHALL show zero bots (no seed bots). There SHALL be no count cap.
6. Create and edit SHALL persist via BR-3 and SHALL NEVER call `vscode.lm`.
7. UI SHALL identify bots as `@{handle}`, never the display name, including the Swarm picker (insert `@{handle}` plus trailing space — BR-5 / UI spec).
8. Avatars SHALL be color + initials SVG only.
9. Welcome when `!botrider.hasBots` SHALL use the locked copy in the UI/UX spec.

## Acceptance (architecture rev 7)

- GIVEN a new install, THEN the Bots tree is empty and welcome copy includes New Bot.
- GIVEN Name `Alpha Bot`, THEN handle derives to a valid unique `@alpha-bot` (or suffixed on collision) and remains editable.
- GIVEN save on the form, THEN `bots/snapshot` updates and Copilot is not called.
- GIVEN two bots with handles differing only by case, THEN the second handle is rejected or uniqued; uniqueness is case-insensitive.
