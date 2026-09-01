# Bot Rider — UI/UX addendum: Per-bot Copilot model picker

Fold into `ui-ux-spec.md` as **§22**. New Bot / Edit Bot only. Do **not** reopen §20 Attach slots.

Architecture: [architecture-bot-model.md](./architecture-bot-model.md). Additive. **MS-1–3 locked.** Copilot vendor only via `vscode.lm`. Persist `LanguageModelChat.id` only (label never persisted). Empty = host default. Missing id = host default that turn + visible copy; do not block the turn.

## 22. Per-bot model picker (F5)

**Status:** Additive. **MS-1–3 locked.** Copilot vendor only. Persist `LanguageModelChat.id` only (label never persisted). Empty = host default. Missing id = host default that turn + visible copy; do not block the turn. Not a Swarm control. Not a fourth sidebar. Not token chrome. Not F7 parallel. Not leftovers 002/003/009/014.

### 22.1 Placement
On **New Bot** / **Edit Bot**, after **System instructions**, before the §20 attachment slots (and before **Active**).

| Field | Control | Required | Notes |
| --- | --- | --- | --- |
| **Model** | native `<select>` (dropdown) | no | Options from host Copilot discovery. First option is the default. |

### 22.2 Options and labels (MS-1)
Host discovers with `vscode.lm.selectChatModels({ vendor: 'copilot' })` only (form open is enough user gesture). Refresh on `vscode.lm.onDidChangeChatModels` while the form is open. **Copilot vendor only.** No other vendors.

**Select key = `LanguageModelChat.id`.** Persist `LanguageModelChat.id` only (label never persisted). `<option value>` is that id. Visible string is display only.

**First option (always):** empty/null → **Use extension default**
Then one option per discovered Copilot model. **No fake / hardcoded models.**

**Option label** (display only, first available):
1. `model.name` if present and non-empty
2. else `model.family` + ` · ` + short id tail if family alone is ambiguous
3. else `model.id`

### 22.3 Persist and runtime (MS-2, MS-3)
- Persist `LanguageModelChat.id` only (label never persisted). Save stores it as `modelId: string | null` (or omit) on the bot record.
- Empty = host default. Empty / unset = host default for that bot's turns (same as today).
- Set = host resolves that id when calling Copilot for this bot. **Copilot vendor only.**
- Missing id = host default that turn + visible copy; do not block the turn. If saved id is not in current Copilot discovery for a turn, host falls back to host default for that turn. Show visible copy. **Do not block the turn.** Form, when open, resets select to Use extension default with: `Saved model is unavailable. Using extension default.` Swarm may surface the same line once as a system notice; never a hard stop.

### 22.4 Where it shows
Edit form only (light). Bots tree row stays name / role / active — **no** model subtitle. No Swarm per-message model picker. No composer model chip.

### 22.5 Empty / loading / Copilot missing
| State | Control | Copy under control |
| --- | --- | --- |
| Loading discovery | disabled, value = Use extension default | `Getting Copilot models…` |
| Copilot signed out or no models | disabled, value = Use extension default | `Sign in to GitHub Copilot to pick a model.` |
| Models available | enabled | none |
| Saved id missing after refresh | enabled, selection reset to default | `Saved model is unavailable. Using extension default.` |

Use existing Recheck / sign-in (`botrider.copilot.recheck`). Do not invent models. Save still allowed while disabled (persists unset).

### 22.6 Host ↔ UI
- Host → UI on form open / model change: `bots/models { models: [{ id, label }], selectedId: string | null, status: 'loading' | 'ready' | 'unavailable' }`
- UI → Host on Save: create/update plus `modelId: string | null` (`LanguageModelChat.id` only; label never persisted)
- UI never calls `vscode.lm`. Select value = id; empty = host default.

### 22.7 Out
Swarm per-message model picker, non-Copilot vendors, persisting display label as key, blocking a turn when saved id missing, token/quota chrome, fourth sidebar, F7 parallel, leftovers 002/003/009/014, tree model subtitle, fake model list, reopening §20 Attach slots.
