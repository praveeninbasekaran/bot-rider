import * as vscode from 'vscode';

export const CONTEXT_KEYS = [
  'botrider.hasBots',
  'botrider.hasActiveBots',
  'botrider.hasPendingChanges',
  'botrider.hasPendingMcp',
  'botrider.debateRunning',
  'botrider.splitOpen',
  'botrider.copilotReady',
  'botrider.chatExpanded',
  'botrider.applyFailed',
] as const;

export type ContextKey = (typeof CONTEXT_KEYS)[number];

export class ContextKeys {
  private readonly values = new Map<ContextKey, boolean>();

  async set(key: ContextKey, value: boolean): Promise<void> {
    if (this.values.get(key) === value) {
      return;
    }
    this.values.set(key, value);
    await vscode.commands.executeCommand('setContext', key, value);
  }

  async sync(state: {
    hasBots: boolean;
    hasActiveBots: boolean;
    hasPendingChanges: boolean;
    hasPendingMcp?: boolean;
    debateRunning: boolean;
    splitOpen: boolean;
    copilotReady: boolean;
    chatExpanded: boolean;
    applyFailed: boolean;
  }): Promise<void> {
    await this.set('botrider.hasBots', state.hasBots);
    await this.set('botrider.hasActiveBots', state.hasActiveBots);
    await this.set('botrider.hasPendingChanges', state.hasPendingChanges);
    await this.set('botrider.hasPendingMcp', state.hasPendingMcp ?? false);
    await this.set('botrider.debateRunning', state.debateRunning);
    await this.set('botrider.splitOpen', state.splitOpen);
    await this.set('botrider.copilotReady', state.copilotReady);
    await this.set('botrider.chatExpanded', state.chatExpanded);
    await this.set('botrider.applyFailed', state.applyFailed);
  }
}
