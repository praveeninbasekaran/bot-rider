export const COPY = {
  unknownHandle: (handle: string) => `No bot named @${handle}.`,
  multipleMentions: 'Mention only one bot to lock a turn.',
  inactiveTurn: (name: string) => `${name} is inactive · answering this turn only.`,
  splitNoConsensus: 'No consensus',
  splitPaused: 'Debate paused',
  splitCapBody: 'The swarm did not agree after two rounds.',
  splitContinueBody: 'Still no consensus after the extra round.',
  splitInterruptBody: 'Debate paused. Positions so far:',
  stoppedNoImpl: 'Stopped without implementation.',
  pickDirection: (name: string) => `${name}'s position selected as the direction.`,
  composerPlaceholder: 'Message the swarm. Use @handle to lock a bot.',
  resolveSplit: 'Resolve the split to send a new prompt.',
  hung: 'GitHub Copilot did not respond within 60 seconds. Stop is still available.',
  zeroActive: 'Turn on at least one bot, or @mention a bot to lock the turn.',
  noWorkspace: 'Open a workspace folder to run the swarm.',
  parseFailed: 'The implementer reply did not contain a JSON changeset with files[].',
  validateFailed: 'The proposed changeset failed validation.',
  missingCopilot: 'GitHub Copilot is not available. Sign in to GitHub Copilot, then retry Send.',
  noPermissions: 'Bot Rider does not have permission to use GitHub Copilot yet.',
  composerLocked: 'Resolve the split to send a new prompt.',
  proposedChanges: (n: number) => `Proposed changes · ${n} files`,
  appliedToast: (n: number) => `Applied ${n} file changes.`,
  approvedChat: (n: number) => `Approved · ${n} files applied.`,
  rejectedChat: 'Rejected · proposed edits discarded.',
};

export const BOTS_STATE_KEY = 'botrider.bots.v1';
export const HANG_TIMEOUT_MS = 60_000;
export const TOKEN_FLUSH_MS = 24;
export const COPILOT_JUSTIFICATION = 'Bot Rider debate';
