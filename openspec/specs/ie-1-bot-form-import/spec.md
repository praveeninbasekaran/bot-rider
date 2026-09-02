# IE-1 Bot form import

## Purpose

Snapshot workspace files onto a bot record. Path is a label. Empty-only map. Skip huge/unreadable/binary. Never execute. Canonical architecture: [docs/architecture-bot-attachments.md](../../../docs/architecture-bot-attachments.md) (IE-1–4 still hold; TA revises untyped Attach). Chrome: [docs/ui-ux-bot-attachments.md](../../../docs/ui-ux-bot-attachments.md) §20.

## SHALL requirements

1. Workspace file picker on create and edit. Snapshot readable UTF-8 text into the bot record. Original path is a **label only**. Do not re-read the path at Send.
2. Persist is BR-3 `globalState` key `botrider.bots.v1`. Settings Sync off. One bot per form save. No global skill install.
3. Map name / handle / persona into **empty** fields only. Never overwrite filled fields. Do not map `role` or `instructions`.
4. Attachments are TokenGovernor extras on **that bot’s** propose / critique / direct / implement turns only. Other bots do not receive them. Trim extras silent (no skip banner).
5. Per-file cap 256 KiB. Skip unreadable / binary / too large / outside workspace, visible, continue. Huge copy is exactly `too large`. No Copilot on skip.
6. Never execute. No spawn, shell, tasks, eval, or hooks-runner. Copilot stays `vscode.lm`.

## Acceptance

- GIVEN an attached file, THEN Send uses the snapshot text and does not re-read the path.
- GIVEN a filled persona, THEN attach map does not overwrite it.
- GIVEN a file over 256 KiB, THEN skip copy is `too large`, the rest of the pick continues, and Copilot is not called.
