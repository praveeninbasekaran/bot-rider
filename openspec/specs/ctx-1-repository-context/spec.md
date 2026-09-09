# CTX-1–CTX-3 Repository context

Status: **shipped**.

## Requirement

Bot Rider MUST build a local repository index of supported files, symbols, imports, available call
relationships, Markdown passages, and requirement IDs. Prompt assembly MUST retrieve bounded,
task-relevant neighborhoods and report optional context dropped by the budget.

## Acceptance

1. Generated, dependency, output, and development-graph directories are excluded.
2. Supported code files contribute file and symbol nodes.
3. Resolvable local imports and available calls contribute typed edges.
4. Markdown is chunked by heading and ranked locally without an external vector service.
5. Task IDs and proposed paths can link to indexed file nodes.
6. OpenSpec IDs can link to document/code neighborhoods.
7. Prompt context is deterministic and bounded.
8. The Swarm reports included context size and dropped optional entries.
9. Index or retrieval failure degrades to empty local context.

Verified by `test/repository-context.test.ts`, `test/prompt-builder.test.ts`, and existing Context
Map/OpenSpec regression suites.
