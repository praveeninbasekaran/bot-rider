# TA-1 Typed bot attachments

## Purpose

Six labeled slots on New/Edit Bot. Kind **is** the slot. Agent 0 or 1, not required. Replaces untyped Attach on IE/§20. Canonical architecture: [docs/architecture-bot-attachments.md](../../../docs/architecture-bot-attachments.md). Chrome: [docs/ui-ux-bot-attachments.md](../../../docs/ui-ux-bot-attachments.md) §20.

## SHALL requirements

1. Six slots: Agent (0 or 1, not required), Skills / Scripts / Instructions / Prompts / Hooks (0..n). No single undifferentiated Attach. Empty Agent save is valid. All six may be empty.
2. User picks the **slot**, then the file. Ports pass `slot`. Persisted `kind` equals the slot (`agent | skills | scripts | instructions | prompts | hooks`). Host SHALL NOT infer kind from filename.
3. Only the Agent slot maps name / handle / persona (empty fields only). Other slots never map, even if the basename is `AGENTS.md` / `SKILL.md` / `AGENT.md`.
4. Filters: Agent/Skills/Instructions/Prompts markdown/text. Scripts/Hooks markdown/text plus `.py .js .ts .sh .bash .zsh .ps1`.
5. IE-1–4 still hold: snapshot UTF-8, path is a label, 256 KiB skip `too large`, never execute, one bot per form save. Pack label includes kind.
6. Not a new §22. BR / QC / HV / MA / SD frozen otherwise.

## Acceptance

- GIVEN Save with empty Agent, THEN the bot is valid.
- GIVEN a file attached to Scripts, THEN `kind` is `scripts` even if the name is `AGENTS.md`, and name/handle/persona are not mapped.
- GIVEN `bots/attach-pick`, THEN the payload includes `slot`.
