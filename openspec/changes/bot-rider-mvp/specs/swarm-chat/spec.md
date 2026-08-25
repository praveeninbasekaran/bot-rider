# Delta for Swarm Chat (BR-4)

## Purpose

A Copilot-chat-density Swarm webview is the place to send a master prompt and read the debate.

## ADDED Requirements

### Requirement: Swarm surfaces
Activity bar `botrider` hosts webview `botrider.chat` (**Swarm**). Expand opens `botrider.chatPanel` titled **Swarm Chat**. `retainContextWhenHidden` MUST be true only on those two surfaces.

#### Scenario: @ picker
- GIVEN at least one bot
- WHEN the user picks a bot above the composer
- THEN the composer SHALL insert `@{handle}` plus a trailing space
- AND MUST NOT insert the display name

### Requirement: Webview contract
CSP MUST include `default-src 'none'`. `acquireVsCodeApi` once. Stream tokens 16–32ms. Sanitize HTML. `--vscode-*` tokens only. UI MUST NOT call `vscode.lm` or `applyEdit`. Composer placeholder: `Message the swarm. Use @handle to lock a bot.`
