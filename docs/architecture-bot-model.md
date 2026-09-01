# Bot Rider — Per-bot Copilot model selection (additive slice)

Status: **ready for implementation.** Design only until a developer lands it. Not a host rewrite of BR, QC, HV, MA, SD, or TA. **Not** F7 parallel / Event Bus.
Stories: **MS-1–3 is the full story set.** **MS-1** discover `vscode.lm.selectChatModels({ vendor: 'copilot' })` on New/Edit; select key = `LanguageModelChat.id`; labels are display only. **MS-2** persist that id as `modelId` on `BotRecord`; empty / unset = host default (today’s path). **MS-3** that bot’s propose / critique / `@` / implementer uses the pick; missing id → host default that turn + visible copy; **do not** block the turn. No other vendor. No API keys.
UI chrome contract: `ui-ux-spec.md` §22 (addendum `ui-ux-bot-model.md`).
Date: 2026-09-01.
Parent: `architecture-mvp.md`. Copilot stays `vscode.lm`. ₹0 extra keys. No second runtime.

Split (when PO allocates; **do not allocate in this docs PR**): **Developer 1** host (discover, `BotRecord.modelId`, resolve per turn, `bots/models` emit, fallback notice). **Developer 2** §22 chrome (dropdown after System instructions, before §20 slots). QA after both, on a **new product PR**, not stacked on this docs PR.

---

## 0. Non-negotiables (PO + MS-1–3 + §22)

- Discover only `{ vendor: 'copilot' }` via existing LmPort / `selectChatModels`. Filter non-copilot if any leak.
- Persist `modelId?: string | null` on `BotRecord`. Do **not** bump `BotStoreFile.version`. Missing `modelId` = host default.
- Settings Sync stays off for bot keys (`setKeysForSync` stays off).
- Resolve model **per that bot** on propose / critique / direct (`@`) / implement turns only.
- Empty `modelId` → today’s host default selection path (`CopilotGateway`: `selectChatModels({ vendor: 'copilot' })`, then `models[0]` after vendor filter).
- Saved id not in current Copilot discovery → host default **that turn** + visible notice; **do not** fail the turn.
- Mid-run Edit that changes `modelId`: **next turn / next run only** (do not hot-swap mid-stream).
- UI never calls `vscode.lm`. Form open is enough user gesture for **discovery** (`selectChatModels` only; never `sendRequest` from CRUD / the form). No API keys. No non-copilot. No Swarm per-turn picker. No F7.
- BR / QC / HV / MA / SD / TA frozen. §20 Attach unchanged. Leftovers 002/003/009/014 out. Graphify out.

---

## 1. Component

```
New Bot / Edit Bot open
    host selectChatModels({ vendor: 'copilot' })   // form open = user gesture; discovery only
    filter vendor === 'copilot'
    emit bots/models { models: [{ id, label }], selectedId, status }
    while form open: onDidChangeChatModels → refresh emit

Save  bots/create | bots/update
    modelId: LanguageModelChat.id | null     // label never persisted

Send (this bot, propose | critique | direct | implement)
    1. modelId empty → today’s CopilotGateway default pick
    2. else find copilot model where id === bot.modelId
    3. if not found → default pick this turn
         + visible notice once
         + continue the turn (do not fail)

Vote / Split / Stop: no per-bot model resolve (not in MS-3 turn list)
Mid-run Edit modelId: next turn / next run only; do not hot-swap mid-stream
UI never calls vscode.lm. No sendRequest from the form.
```

---

## 2. BotRecord (additive)

Do **not** bump `BotStoreFile.version`. Missing `modelId` still reads as host default (same as `null` / empty).

```ts
interface BotRecord {
  // existing fields unchanged
  /** LanguageModelChat.id for vendor copilot. Omit/null = host default. */
  modelId?: string | null;
}
```

- Label is **never** the persisted value. Persist **id only**.
- Empty string, omit, and `null` are the same: host default for that bot’s turns.
- CRUD still `await globalState.update`. Last write wins across windows.
- Delete bot drops `modelId` with the record.
- `bots/create` `draft` and `bots/update` `patch` gain optional `modelId?: string | null`. Host stores the id key only.

---

## 3. Discovery and labels (MS-1)

Host-owned. Existing LmPort / `selectChatModels({ vendor: 'copilot' })` only. Filter `vendor === 'copilot'` if any leak. **No other vendors.** No fake / hardcoded models.

Form open is enough user gesture for this `selectChatModels` call. Refresh on `vscode.lm.onDidChangeChatModels` **while the form is open**. Do not `sendRequest` from the form. Recheck / sign-in stays `botrider.copilot.recheck`.

LmPort must surface enough of `LanguageModelChat` for matching and labels (`id` required; `name` / `family` for display). Do not add a second discovery path. UI never imports `vscode.lm`.

**Select key = `LanguageModelChat.id`.** Option `value` is that id. Visible string is display only (never persisted).

Host builds `{ id, label }[]`:

1. `id` = `LanguageModelChat.id`
2. `label` (first available, §22.2):
   1. `model.name` if present and non-empty
   2. else `model.family` + ` · ` + short id tail if family alone is ambiguous
   3. else `model.id`

Short id tail is the last `/`-segment of `id`, or `id` if it has no slash.

Emit `bots/models` on form open and on `onDidChangeChatModels` while the form is open.

| `status` | When | `selectedId` |
| --- | --- | --- |
| `'loading'` | discovery in flight | `null` |
| `'ready'` | one or more copilot models | saved `modelId` if it is in `models`, else `null` |
| `'unavailable'` | Copilot signed out or zero models after filter | `null` |

When the bot’s persisted `modelId` is non-empty and not in the current `models` list, emit `status: 'ready'` (if models exist) with `selectedId: null`. Form copy is `Saved model is unavailable. Using extension default.` (see §22.5). Do **not** invent a blocking error type.

---

## 4. Runtime resolve (MS-2, MS-3)

When sending a bot turn (**propose / critique / direct / implement** only):

1. If `bot.modelId` is empty / omit / `null` → `selectChatModels({ vendor: 'copilot' })` and use today’s default pick (`CopilotGateway`, `models[0]` after vendor filter).
2. Else find the model where `id === bot.modelId` among copilot models (same vendor filter).
3. If not found → default pick **this turn** + emit visible notice **once**:

   `Saved model is unavailable. Using extension default.`

   Use existing `chat/notice` (or equivalent). Do **not** invent a blocking `error`. **Continue the turn.** Composer stays enabled. Do not fail `sendRequest` solely because the saved id is missing.

Vote / consensus, Split chrome, and Stop do **not** take a per-bot model. Continue extra debate rounds are propose / critique and **do** resolve per that bot.

**Mid-run Edit:** a `modelId` change on a bot that is already in a run applies to the **next** turn / **next** run. Do not swap the `LanguageModelChat` under an in-flight stream.

TokenGovernor / QC packs **unchanged**. No token / quota chrome. `countTokens` / `maxInputTokens` for that `sendRequest` come from the resolved model for that turn; that is not a pack redesign.

---

## 5. Protocol (additive)

Do **not** remove other `bots/*`. Do **not** change `bots/attach-*` ports.

```ts
type HostToUi = /* existing */
  | {
      type: 'bots/models';
      models: { id: string; label: string }[];
      selectedId: string | null;
      status: 'loading' | 'ready' | 'unavailable';
    };
// bots/create draft and bots/update patch gain optional modelId?: string | null
```

No new UiToHost beyond create/update carrying `modelId`. Select value = id; empty = host default.

UI **never** calls `vscode.lm`. Host discovers, labels, and resolves.

Fallback notice (turn): existing `chat/notice` with the exact missing-id copy. Not a new protocol member. Not `error`.

---

## 6. Copy

| Situation | Copy |
| --- | --- |
| Loading discovery (under the control) | `Getting Copilot models…` |
| Copilot signed out or no models (under the control) | `Sign in to GitHub Copilot to pick a model.` |
| Saved id missing (form, under the control; Swarm may surface once as a system notice) | `Saved model is unavailable. Using extension default.` |

First option label (always): **Use extension default**. Recheck command title unchanged: **Sign in to GitHub Copilot**.

---

## 7. Out of this slice

Swarm per-message model picker, non-Copilot vendors, persisting display label as key, blocking a turn when saved id missing, token/quota chrome, fourth sidebar, F7 parallel / Event Bus, leftovers 002/003/009/014, tree model subtitle, fake / hardcoded model list, reopening §20 Attach slots, API keys, UI calling `vscode.lm`, Graphify, BR / QC / HV / MA / SD / TA product changes.

---

## 8. Tests (docs only — list them, do not write vitest)

Merge bar after PO allocates, on a **new product PR**:

- Empty `modelId` uses host default.
- Saved id present → that model for that bot’s propose / critique / direct / implement.
- Saved id missing → default that turn + notice; turn not blocked.
- Non-copilot never listed.
- UI never imports `vscode.lm`.
- Tree has no model subtitle.
- §20 attach ports unchanged.
- Settings Sync still off.
- Vote / consensus does not require per-bot resolve.
- Mid-run Edit of `modelId` does not hot-swap the in-flight stream.
- `BotStoreFile.version` unchanged; missing `modelId` on old records = host default.
- WM / QC / HV / MA / SD / TA tests conceptually still pass (this slice does not change them).
