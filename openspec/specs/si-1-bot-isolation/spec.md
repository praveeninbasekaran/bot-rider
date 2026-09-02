# SI-1 F7 isolation (host-only)

## Purpose

Per-bot session store plus controlled verbatim handoff packets. Sequential only. Zero new UI. Canonical architecture: [docs/architecture-bot-isolation.md](../../../docs/architecture-bot-isolation.md).

## SHALL requirements

1. Each bot SHALL have its own in-memory `LanguageModelChatMessage[]` (system + its turns + controlled ingest). No global swarm transcript in every pack. Session-only. BR-3 unchanged.
2. Structured packets (`requirements`, `decisions`, `constraints`, `openQuestions`) SHALL be verbatim. Drop banter + failed drafts only. Never lossy-summarize acceptance criteria. Publish at end of each meaningful bot turn AND consensus/Pick.
3. Downstream: bots with a remaining turn in this sequential run (including prior speakers if they speak again) + implementer. Not inactive. Not fan-out to everyone.
4. Sequential orchestrator unchanged. No parallel Event Bus / concurrent `sendRequest`. Visible Swarm full HV prose.
5. TokenGovernor may trim extras silent. Required published packets MUST NOT be silently cut; minimum pack miss → QC-3 pack-overflow, no Copilot call. Required OpenSpec bodies (OS-4) join that required set when present.

## Acceptance

- GIVEN two bots, THEN each Copilot pack does not restuff the other’s full HV article as transcript.
- GIVEN an inactive bot, THEN it receives no inbox packet.
- GIVEN required packets that cannot fit, THEN pack-overflow and no `sendRequest`.
