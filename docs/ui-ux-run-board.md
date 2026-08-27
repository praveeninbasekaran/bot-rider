# Bot Rider — UI/UX addendum: Run board

Fold into `ui-ux-spec.md` §17. Additive Swarm chrome. Not a fourth view.

**Superseded:** vote does NOT update Dissents. `dissents[]` is Split-only (architecture-token-save.md QC-1 AC2).

## 17. Run board (additive Swarm chrome)

**Status:** Additive after §16. Not a fourth view. Not a bot. The **host** restates this board; bots do not change speech style to fill it. User still reads full debate prose in the thread as today.

**Out:** call-count modal before Send · Graphify UI · token-cop bot chrome · user-editable todos · Approve-from-the-board · MCP rows on the board (those stay in the bot article).

### 17.1 Placement
Lives **inside** `botRider.chat` (sidebar webview) and the Expand `botRider.chatPanel`. Same component, same data.
Sticky **above** the transcript, below the view title, above the first `You` block. Composer stays at the bottom. Split card stays in the thread, not on the board.
Default **expanded** while `debateRunning` or `pendingReview` or `splitOpen`. User may collapse to a single 22 px bar: `Goal · {done}/{total} todos`. Session-only collapse. Do not persist across reload.
Sidebar ~320 px: one column, 8 px pad, 4 px gaps, 12 px type. Expand: same anatomy. Do **not** move the board into a left rail.

### 17.2 Anatomy
No avatar. No bot color. Label **Run** in 11 px uppercase `--vscode-descriptionForeground`.
Regions: Goal (one line), Todos (host-owned steps), Decisions (one-liners), Dissents (`@{handle} — {reason}` from Split-card positions only when Split opens; not vote remainder), Files in play (paths only).
Omit empty regions. If only Goal, show Goal alone or hide whole board (§17.4).
Max todos 7 then `+{n} more`. Dissents max 4 + more. Files max 6 chips then `+{n}`.

### 17.3 Todos tick
pending ○ descriptionForeground; current ● progressBar-background; done $(check) testing-iconPassed.
Clicking a todo is a no-op. Not checkboxes. No Approve/Reject on the board. Chronological host order. Do not sort done-to-bottom.

### 17.4 Empty
Idle no thread: Hidden. Solo @ with no host todos: Hidden unless Goal or Files. Host todos [] and everything empty: hide. After Reject/Approve clears run: hide. Reload: hidden. Board does not mention MCP.

### 17.5 Files vs Proposed Changes
inChangeset → review/open-diff tooltip `Open diff`. Else no-op tooltip `Not proposed yet`. Never write from the board.

### 17.6 Sidebar vs Expand
Same DOM. No Graphify canvas. No call-count or token meter.

### 17.7 Host ↔ UI
chat/board + RunBoardDto as in architecture. UI → Host: none for board edits. inChangeset file chip may reuse review/open-diff.

### 17.8 Accessibility
region aria-label="Run". Collapse: `Run, {done} of {total} todos, expanded|collapsed`. Todo items role=listitem not checkbox. Glyph aria-hidden. Status in text. Live-update Goal only if it changes, polite. Dissents include @handle.

### 17.9 Happy path
Send → optional Goal. After propose/critique restatements, chat/board ticks todos. Split opens → Dissents from Split-card positions (vote does NOT update Dissents). Implementer → inChangeset. Approve/Reject stay Surface C.

### 17.10 Copy exact
Region `Run`. Collapsed `{goalEllipsis} · {done}/{total}` (omit count if total=0). Dissent `@{handle} — {reason}`. File tooltips `Not proposed yet` / `Open diff`. `+{n} more`.

### 17.11 Pack overflow
Exact copy:
Prompt doesn't fit Copilot
The minimum context for this turn is larger than Copilot's window.
Shorten the prompt or shrink the active editor. Required context was not dropped.
error code pack-overflow. Thread error block. No pre-Send modal. No silent skip.
