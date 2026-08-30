# Bot Rider — UI/UX addendum: Swarm article prose

Fold into `ui-ux-spec.md` §18. Additive human-voice chrome. Not a fourth view. Not a voice toggle. Not a plain-vs-markdown toggle.

Architecture: [architecture-human-voice.md](./architecture-human-voice.md). Host is the source of truth for stripped article text. UI renders that article; it does not re-strip as source of truth.

## 18. Swarm article prose (additive chrome)

**Status:** Additive after §17. Human-voice chrome for visible Swarm articles. Host sends already-stripped text. UI must not restyle that article into headings/spec chrome.

**Out:** word-cap · length counter · mid-turn truncate · voice toggle · plain-vs-markdown toggle · UI re-strip as source of truth · README / document layout for speaking turns.

### 18.1 Surfaces
Visible Swarm articles: propose, critique, `@`-direct, Split positions. Same component in sidebar (`botRider.chat`) and Expand (`botRider.chatPanel`).
Render as **chat paragraphs**, not a README or document layout.

### 18.2 Host-stripped source of truth
Host sends already-stripped `chat/turn-end.text` and Split `positions[].text`.
UI paints that article. It does **not** re-strip as source of truth. It must **not** restyle leftover `##` / spec chrome back into headings.
Round headers, Split card chrome, and the Run board stay host-owned chrome, not article body.

### 18.3 Keep
Fenced code (triple-backtick) byte-for-byte, including list-looking lines inside the fence. Inline code spans stay.
`inChangeset` chips / Proposed Changes stay Surface C.

### 18.4 Do not
No word-cap. No length counter. No mid-turn UI truncate. No voice toggle. No plain-vs-markdown toggle. UI does not badge leftover protocol tokens.

### 18.5 Streaming
`chat/token` may briefly include protocol tokens or `##`. `chat/turn-end.text` is the stripped article and is what the bubble keeps. No mid-turn UI truncate.

### 18.6 Consume leftover hashes
Default: host already stripped heading lead-in. Consume leftover `##` as a README **only** if a later SHA still treats leftover hashes as document chrome. Do not invent heading scale.
