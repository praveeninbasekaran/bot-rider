import type { CopilotStatus } from '../protocol/messages';

export const COPY = {
  unknownHandle: (handle: string) => `No bot named @${handle}.`,
  multipleMentions: 'Mention only one bot to lock a turn.',
  inactiveTurn: (name: string) => `${name} is inactive · answering this turn only.`,
  splitNoConsensus: 'No consensus',
  splitPaused: 'Debate paused',
  splitPausedReason: 'Debate paused. Positions so far:',
  interrupted: 'Interrupted',
  stoppedNoImpl: 'Stopped without implementation.',
  pickDirection: (name: string) => `${name}'s position selected as the direction.`,
  pickTitle: 'Pick a bot to decide',
  composerPlaceholder: 'Message the swarm. Use @handle to lock a bot.',
  resolveSplit: 'Resolve the split to send a new prompt.',
  hung: 'GitHub Copilot did not respond within 60 seconds. Stop is still available.',
  zeroActive: 'Turn on at least one bot, or @mention a bot to lock the turn.',
  noWorkspace: 'Open a workspace folder to run the swarm.',
  applyNoFolder: 'Open a folder to apply proposed edits.',
  appliedToast: (n: number) => `Applied ${n} file changes.`,
  approvedNotice: (n: number) => `Approved · ${n} files applied.`,
  rejectedNotice: 'Rejected · proposed edits discarded.',
  parseFailed: 'The implementer reply did not contain a JSON changeset with files[].',
  validateFailed: 'The proposed changeset failed validation.',
  missingCopilot: 'GitHub Copilot is not available. Sign in to GitHub Copilot, then retry Send.',
  noPermissions: 'Bot Rider does not have permission to use GitHub Copilot yet.',
  composerLocked: 'Resolve the split to send a new prompt.',
  mcpSkipMissing: 'Not in this workspace.',
  mcpSkipUnauthenticated: 'Not signed in. Sign in from VS Code MCP settings.',
  mcpSkipToolMissing: 'Tool not available.',
  mcpSkipMutating: (server: string) => `Writes through ${server} aren't available in Bot Rider.`,
  mcpActionsFailed:
    'MCP actions failed\nSome remote side effects (Figma, Azure Boards, or other servers) may already have happened and may not roll back.',
  mcpStagedResult: 'Staged for user Approve. Not executed.',
  packOverflow:
    "Prompt doesn't fit Copilot\nThe minimum context for this turn is larger than Copilot's window.\nShorten the prompt or shrink the active editor. Required context was not dropped.",
  /** HV-1 overlay after the stored persona block, in this turn's instruction only. */
  voiceOverlay:
    'Visible reply is conversational chat, not a document or heading template, even if the persona asks for a document.',
  voiceKeepTight: 'Keep it tight.',
  defaultNewBotPersona: 'A thoughtful teammate who talks like a person.',
  defaultNewBotInstructions: 'Speak in short conversational paragraphs. Keep it tight.',
  attachNoFolder: 'Open a folder to attach files.',
  attachSkipOutside: (name: string) => `Skipped ${name} · Not in this workspace.`,
  attachSkipTooLarge: (name: string) => `Skipped ${name} · too large`,
  attachSkipBinary: (name: string) => `Skipped ${name} · Binary file.`,
  attachSkipUnreadable: (name: string) => `Skipped ${name} · Can't read this file.`,
  deliverableAskFormat: 'Which format should I write — Word, Excel, PowerPoint, or HTML?',
  deliverableAskOutline: 'What has to be in it?',
  deliverableAskBoth:
    'Which format should I write — Word, Excel, PowerPoint, or HTML — and what has to be in it?',
  officeInspect: (filename: string, kind: 'Word' | 'Excel' | 'PowerPoint') =>
    `${filename} · new ${kind} file`,
  htmlPreviewTitle: (filename: string) => `${filename} (Proposed)`,
  deliverableImplementerExtra:
    'This Send is a standard deliverable. Each files[] entry must include path with the real extension, op create, format (docx|xlsx|pptx|html), title, and outline (string[]). Optional facts are curated one-liners. Do not emit zip, XML, base64, or file bytes.',
  savedModelUnavailable: 'Saved model is unavailable. Using extension default.',
  gettingCopilotModels: 'Getting Copilot models…',
  signInToPickModel: 'Sign in to GitHub Copilot to pick a model.',
  useExtensionDefault: 'Use extension default',
  exported: (n: number) => `Exported ${n}.`,
  imported: (n: number, skipped = 0) =>
    skipped > 0 ? `Imported ${n} · skipped ${skipped}.` : `Imported ${n}.`,
  skipHandleTaken: (handle: string) => `Skipped @${handle} · already taken.`,
  skipNameTaken: (name: string) => `Skipped "${name}" · a bot with that name already exists.`,
  skipInvalidHandle: (handle: string) => `Skipped @${handle} · invalid handle.`,
  skipNameRequired: 'Skipped · name is required.',
  workNeedsRoles: 'Work needs one Dispatcher and one Spec.',
  workBatchRunning: 'Work batch still running.',
  skippedCollision: (path: string) => `Skipped ${path} · collision`,
  argueHeader: (path: string) => `ARGUE · ${path}`,
  argueRound: (round: 1 | 2) => `Argue round ${round}`,
  invalidSplit: 'Dispatcher split is not disjoint.',
  followOnSkipped: 'Follow-on work skipped.',
  unreadableBotFile: "Couldn't read this bot file.",
  dirtyExportPrompt: 'Save before export?',
  dirtyExportSave: 'Save',
  dirtyExportWithoutSaving: 'Export without saving',
  dirtyExportCancel: 'Cancel',
};

export function copilotStatusMessage(status: CopilotStatus): string | undefined {
  switch (status) {
    case 'missing':
      return COPY.missingCopilot;
    case 'noPermissions':
      return COPY.noPermissions;
    case 'hung':
      return COPY.hung;
    default:
      return undefined;
  }
}

export const BOTS_STATE_KEY = 'botrider.bots.v1';
export const HANG_TIMEOUT_MS = 60_000;
export const TOKEN_FLUSH_MS = 24;
export const COPILOT_JUSTIFICATION = 'Bot Rider debate';
