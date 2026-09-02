# SD-1 Standard deliverables

## Purpose

Swarm ask when format or outline is missing. One primary real Office/HTML file after BR-6 Approve. Host-built from board + MCP + decisions. Canonical architecture: [docs/architecture-standard-deliverables.md](../../../docs/architecture-standard-deliverables.md). Chrome pointer: `ui-ux-spec.md` §21.

## SHALL requirements

1. Missing format OR only “report”: Swarm HV question naming Word / Excel / PowerPoint / HTML. Composer enabled. Not during Split; Split still locks send if open. Missing outline: ask; do not invent sections. Format + outline MAY share one turn.
2. Keyword inference only when a format is named: `deck` → pptx; `spreadsheet` → xlsx; `word doc` / `word document` → docx; `html` → html. Bare “report” still asks. Never map `report` → html.
3. Format AND content already named: no questions; create in existing Files section (BR-6) with a real extension. One primary file unless this Send asked for more formats.
4. Real `.docx` / `.xlsx` / `.pptx` / `.html` after Approve. Not markdown renamed. No macros. No stock template pack. No email. Do NOT auto-open Word / Excel / PowerPoint / browser after Approve.
5. Curate from Run board + current-turn MCP + host decisions, not the Swarm transcript. Same BR-6 Approve gate. MCP stays Grain B.

## Acceptance

- GIVEN bare “report”, THEN the host asks and does not stage html.
- GIVEN “deck of the Q3 plan with three sections”, THEN one `.pptx` create in Files and Approve writes real bytes.
- GIVEN Split open, THEN no deliverable ask and composer stays locked.
