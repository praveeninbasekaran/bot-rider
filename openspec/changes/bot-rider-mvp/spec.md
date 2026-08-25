# Bot Rider MVP Specification

Behavior contract for the greenfield VS Code extension. Requirements map to **BR-1** through **BR-6**. Contribution-point ids, commands, and protocol names are part of the product contract.

RFC 2119: MUST / SHALL = absolute; SHOULD = recommended.

Related: [proposal.md](./proposal.md), [tasks.md](./tasks.md), [design.md](./design.md), [docs/architecture-mvp.md](../../../docs/architecture-mvp.md), [docs/ui-ux-spec.md](../../../docs/ui-ux-spec.md).

## Purpose

Bot Rider runs a swarm of user-defined persona bots through GitHub Copilot. Default turns are a capped Debate & Decide loop. File edits exist only after a separate implementer pass, and only land on disk after the user Approves a whole changeset.

---

## BR-1 Copilot-only `vscode.lm`

### Requirement: Copilot vendor filter

The extension MUST obtain chat models exclusively via `vscode.lm.selectChatModels({ vendor: 'copilot' })`, then take `models[0]` after filtering `vendor === 'copilot'`. It MUST NOT hardcode model `family` or `id`. It MUST NOT call any other language-model vendor. It MUST NOT collect or store API keys.

#### Scenario: Recheck is a user gesture
- GIVEN the user clicks **Sign in to GitHub Copilot** (`botrider.copilot.recheck`)
- WHEN that command runs
- THEN the host SHALL call `selectChatModels({ vendor: 'copilot' })` from that click

#### Scenario: Send and @bot are user gestures
- GIVEN the user sends a swarm prompt or an `@handle` lock
- WHEN the orchestrator needs a model
- THEN it SHALL call `selectChatModels({ vendor: 'copilot' })` as part of that gesture
- AND it MUST NOT have called `selectChatModels` from bot CRUD

### Requirement: Request contract

Language-model requests MUST use User and Assistant roles only (no system role). They MUST stream `.text`. They MUST pass `justification: 'Bot Rider debate'` and MUST omit `options.tools`. Before send, the host MUST honor `languageModelAccessInformation.canSendRequest`. Prompt assembly MUST drop oldest history turns first to fit `countTokens` vs `maxInputTokens`, and MUST never drop the persona message.

#### Scenario: Startup empty list is not missing
- GIVEN activation with an empty Copilot model list
- WHEN `onDidChangeChatModels` and `languageModelAccessInformation.onDidChange` have not both settled
- THEN the host MUST NOT report Copilot status `missing`
- AND after both events settle with no selected Copilot model, status MAY be `missing`

### Requirement: Status vs thread error

Copilot auth, quota, and hang MUST be posted on `copilot/status` (`ready` | `missing` | `noPermissions` | `notFound` | `blocked` | `quota` | `hung` | `streamFailed` | `offTopic`). `error` with code `copilot` is the thread catch-all only.

#### Scenario: 60s hang
- GIVEN an in-flight stream that yields no text for 60 seconds
- THEN the host MUST show a visible hung error
- AND MUST NOT silently retry
- AND Stop MUST remain available

---

## BR-2 Custom bots

### Requirement: Bot record

Each bot MUST have `id`, `handle`, `name`, `persona`, `role`, `instructions`, `active`, `colorIndex`, `createdAt`, `updatedAt`. Handle MUST match `[a-z0-9][a-z0-9_-]{0,31}`, MUST be unique case-insensitively, and SHOULD be auto-derived from Name then remain editable. There MUST be no seed bots on first install and no count cap.

#### Scenario: Create from the Bots view
- GIVEN an empty swarm (`!botrider.hasBots`)
- WHEN the user runs **New Bot**
- THEN a form SHALL collect Name, Handle, Persona, Role, System instructions, and Active
- AND saving MUST persist a bot without calling Copilot

### Requirement: Active vs delete

Toggle Active MUST be the tree checkbox (`manageCheckboxStateManually`), separate from Delete. `snapshotActive` MUST return active bots in stable list order. `getByHandle` MUST resolve case-insensitively. Edits during a run MUST mutate persistence only (freeze membership MUST NOT change).

#### Scenario: Inactive @ mention
- GIVEN bot Alpha is inactive
- WHEN the user sends `@alpha …`
- THEN Alpha SHALL answer that turn only
- AND the checkbox MUST stay unchecked
- AND the thread SHOULD show `{Name} is inactive · answering this turn only.`

---

## BR-3 Local persistence, Settings Sync off

### Requirement: What is stored

Bots MUST persist in `globalState` under key `botrider.bots.v1`. The extension MUST NEVER call `setKeysForSync`. The chat transcript MUST be memory-only and session-only. The pending changeset MUST be memory-only.

#### Scenario: Reload window
- GIVEN the user created bots then reloaded the window
- THEN bots SHALL still appear
- AND the Swarm transcript and any un-approved changeset SHALL be gone

---

## BR-4 Swarm chat

### Requirement: Swarm surface

The activity bar container `botrider` MUST host webview view `botrider.chat` named **Swarm**. Expand MUST open panel `botrider.chatPanel` titled **Swarm Chat**. `retainContextWhenHidden` MUST be true only on the Swarm sidebar and the expand panel.

#### Scenario: Composer
- GIVEN Swarm is idle
- THEN the composer placeholder MUST be `Message the swarm. Use @handle to lock a bot.`
- AND the @ picker above the composer MUST insert `@{handle}` plus a trailing space
- AND the picker MUST never insert the display name

### Requirement: Webview safety and density

Swarm MUST use `--vscode-*` tokens only, CSP `default-src 'none'`, a single `acquireVsCodeApi()` call, sanitized HTML, and token `postMessage` batched at 16–32ms. UI MUST never call `vscode.lm` or `applyEdit`.

---

## BR-5 Debate & Decide

### Requirement: Default freeze and two-round cap

On Send without a single `@` lock, the host MUST freeze the current active bots in stable list order at RunStarted and keep that freeze on split and Continue. Each of rounds 1–2 MUST be sequential propose (each bot) then critique (each bot) then vote. Vote: first token `AGREE` or `DISSENT` (case-insensitive); unparseable MUST count as `DISSENT`. If all AGREE, the implementer MUST be the first frozen bot. Otherwise after round 2 the host MUST open a split. There MUST be no auto round 3.

#### Scenario: Continue same freeze
- GIVEN a split after two rounds of dissent
- WHEN the user chooses Continue
- THEN the host SHALL run one more propose/critique/vote round on the **same** freeze
- AND Send MUST be ignored while `splitOpen`

### Requirement: Split composer lock

While split is open the composer MUST be locked. The only actions SHALL be **Continue**, **Pick a Bot to Decide**, and **Stop** (`botrider.chat.stop` only — no `split.stop`). Helper copy: `Resolve the split to send a new prompt.` Split titles: `No consensus` (votes failed) / `Debate paused` (Stop during stream). Stop during a stream MUST cancel, snapshot into Split, and MUST NEVER implement. Split Stop MUST end the run and unlock the composer (`Stopped without implementation.`). Pick MUST implement that bot's direction (`{Name}'s position selected as the direction.`).

### Requirement: @ and debate are language-only

`@` and debate turns MUST be natural language. The host MUST drop file bodies from debate/@ output. Unknown handle: `No bot named @{handle}.` Multiple mentions: `Mention only one bot to lock a turn.` Unknown, multiple, zero-active default, or invalid handle MUST error without calling Copilot. After a solo `@` turn, the last non-empty line MUST be `NEED_EDIT` or `NO_EDIT` (optional trailing period stripped); missing token = `NO_EDIT`; the trailer MUST be stripped from the visible body. Only `NEED_EDIT` MAY start the implementer for that bot.

### Requirement: Separate implementer pass

The implementer MUST run only from: unanimous AGREE, split/pick, or solo `NEED_EDIT`. It MUST emit JSON `{ files: [{ path, op, content? }] }` in the first fenced block that parses with `files[]` (`json` tag optional). Each `op` MUST be `update` | `create` | `delete` (delete has no content). Extra prose is dropped. Invalid op or path (traversal, absolute outside workspace, `.git/` segment) MUST be `validate-failed`. Missing JSON MUST be `parse-failed`. Workspace context MUST include the full active editor + selection and paths only of other tabs. Prompt order: (1) persona+role+instructions (2) workspace (3) history Assistant(text, handle) (4) turn instruction.

---

## BR-6 Whole-changeset Approve

### Requirement: Approve applies the batch

Approve (`botrider.changeset.approve`) MUST apply the whole pending changeset, including create, update, and delete, via `workspace.applyEdit` only from `ChangesetStore.approve()`. Retry (`botrider.changeset.retry`) MUST use the same caller with `buildEdit('retry')`. The host MUST NEVER apply via `workspace.fs.writeFile`, Node `fs`, `TextEditor.edit`, or `needsConfirmation`.

#### Scenario: Success
- GIVEN a pending changeset
- WHEN apply returns `ok === true`
- THEN the store MUST clear, proposed docs MUST dispose, diffs MUST close, `changeset/cleared` MUST post, and `applyFailed` MUST be false

### Requirement: Failed apply never claims success

When `applyEdit` returns `ok === false`, the host MUST NOT claim success. The store MUST stay, Review MUST stay, and `applyFailed` MUST be true. Copy MUST be:

> Apply did not complete. New files created before the failure may already exist on disk, and deleted files may already be gone. Bot Rider cannot roll those back. Retry to finish the rest, or Reject to drop remaining edits (leftover new files stay; already-deleted files stay deleted).

Retry MUST be idempotent: leftover creates overwrite/replace; already-gone deletes skip. Reject MUST NOT auto-delete leftover creates or restore deletes. `applyFailed` MUST be true only after `ok === false`, never on clean pending review. Retry MUST appear in the Review title bar only when `botrider.applyFailed`.
