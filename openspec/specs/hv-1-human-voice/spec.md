# HV-1 Human voice

## Purpose

Visible Swarm articles are conversational prose. Host voice overlay + strip leftover markdown chrome. Length is prompt guidance only. Canonical architecture: [docs/architecture-human-voice.md](../../../docs/architecture-human-voice.md). Chrome: [docs/ui-ux-chat-prose.md](../../../docs/ui-ux-chat-prose.md) §18.

## SHALL requirements

1. Propose / critique / `@`-direct / Split positions SHALL be chat paragraphs, not a README. Host sends already-stripped text. UI SHALL NOT restyle that article into headings/spec chrome.
2. Host voice SHALL overlay on this turn’s instruction. Stored persona / instructions SHALL NOT be rewritten.
3. After protocol parse, the host SHALL strip leftover `##` / `###` lead-in and unsolicited bullet-walls. Keep code fences. Keep a list if this Send asked for a list.
4. No host word-cap. No mid-turn truncate. No length counter. Length, if any, is prompt guidance only.
5. User-asked `.md` / `.html` (or any file) SHALL be produced only by the implementer JSON changeset + BR-6 Approve. Debate/`@` SHALL NOT paste that file as the speaking article.
6. QC packs and WM unchanged. Implementer still JSON.

## Acceptance

- GIVEN a speaking turn, THEN `chat/turn-end.text` is host-stripped prose and the UI does not promote leftover `##` to headings.
- GIVEN the user asks for an `.html` file, THEN debate/`@` does not paste that file as the article; the implementer + Approve path does.
- GIVEN vote or implementer, THEN tools stay none (WM unchanged).
