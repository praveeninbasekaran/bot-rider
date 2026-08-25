import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Application } from '../src/app/application';
import { COPY } from '../src/app/copy';
import { mapIncomingToken, asCreateDraft } from '../src/adapters/ui-protocol';
import { defaultWorkspace, FakeGateway, FixedWorkspace, MemoryFs, MemoryStore } from './fakes';

const root = join(__dirname, '..');

describe('rev 8 §5 protocol', () => {
  const protocol = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');
  const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
  const formJs = readFileSync(join(root, 'media/form.js'), 'utf8');
  const chatCss = readFileSync(join(root, 'media/chat.css'), 'utf8');
  const formCss = readFileSync(join(root, 'media/form.css'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    contributes: { menus: Record<string, { command: string; when?: string }[]> };
  };

  it('HostToUi / UiToHost match architecture rev 8', () => {
    expect(protocol).toMatch(/export type SplitCause = 'cap' \| 'continue' \| 'interrupt'/);
    expect(protocol).toMatch(/type: 'chat\/turn-start'; botId: string; handle: string; turn: TurnKind/);
    expect(protocol).toMatch(/type: 'chat\/token'; botId: string; delta: string/);
    expect(protocol).toMatch(/type: 'chat\/turn-end'; botId: string; turn: TurnKind/);
    expect(protocol).toMatch(/type: 'chat\/split'; cause: SplitCause; positions: SplitPosition\[\]/);
    expect(protocol).toMatch(/type: 'changeset\/cleared'; reason: 'approve' \| 'reject'; fileCount: number/);
    expect(protocol).toMatch(/type: 'bots\/create'; draft: BotDraft/);
    expect(protocol).toMatch(/type: 'split\/pick'; botId: string/);
    expect(protocol).not.toMatch(/inactiveNotice/);
    expect(protocol).not.toMatch(/paused\?:/);
    expect(protocol).not.toMatch(/type: 'chat\/token'; text:/);
    expect(protocol).not.toMatch(/type: 'chat\/split'; title:/);
    expect(protocol).not.toMatch(/type: 'changeset\/cleared' }/);
  });

  it('maps incoming text→delta in the adapter only', () => {
    expect(mapIncomingToken({ type: 'chat/token', botId: 'b1', text: 'hi' })).toEqual({
      type: 'chat/token',
      botId: 'b1',
      delta: 'hi',
    });
    expect(mapIncomingToken({ type: 'chat/token', botId: 'b1', delta: 'ok' })).toEqual({
      type: 'chat/token',
      botId: 'b1',
      delta: 'ok',
    });
    expect(asCreateDraft({ name: 'N', persona: 'p', role: 'r', instructions: 'i' })).toEqual({
      name: 'N',
      handle: undefined,
      persona: 'p',
      role: 'r',
      instructions: 'i',
      active: undefined,
    });
    expect(asCreateDraft({ draft: { name: 'D', persona: 'p', role: 'r', instructions: 'i' } }).name).toBe('D');
  });

  it('chat.js picker, split, composer lock, tokens, and locked copy', () => {
    expect(chatJs).toContain("const insert = '@' + handle + ' '");
    expect(chatJs).not.toMatch(/insertHandle\(bot\.name\)/);
    expect(chatJs).toContain("vscode.postMessage({ type: 'split/pick', botId: botId })");
    expect(chatJs).toContain("vscode.postMessage({ type: 'chat/stop' })");
    expect(chatJs).not.toContain('split/stop');
    expect(chatJs).toContain('Resolve the split to send a new prompt.');
    expect(chatJs).toContain('msg.delta');
    expect(chatJs).toContain('ROUND ');
    expect(chatJs).toContain('PROPOSE / CRITIQUE');
    expect(chatJs).toContain('SOLO · @');
    expect(chatJs).toContain('The swarm did not agree after two rounds.');
    expect(chatJs).toContain('Still no consensus after the extra round.');
    expect(chatJs).toContain('Debate paused. Positions so far:');
    expect(chatJs).toContain('Proposed changes · ');
    expect(chatJs).toContain('Approved · ');
    expect(chatJs).toContain('Rejected · proposed edits discarded.');
    expect(chatJs).toContain('Stopped without implementation.');
    expect(chatJs).toContain("'s position selected as the direction.");
    expect(chatJs).toContain('is inactive · answering this turn only.');
    expect(chatJs).not.toMatch(/turn === 'consensus'[\s\S]{0,80}ROUND/);
    expect(formJs).toContain('Name');
    expect(formJs).toContain('Handle');
    expect(formJs).toContain('Persona');
    expect(formJs).toContain('Role');
    expect(formJs).toContain('System instructions');
    expect(formJs).toContain('Active');
    expect(formJs).toContain("type: 'bots/create', draft: draft");
  });

  it('title-bar when-clauses and vscode tokens', () => {
    const titles = pkg.contributes.menus['view/title'];
    expect(titles.find((m) => m.command === 'botrider.changeset.retry')?.when).toBe(
      'view == botrider.review && botrider.applyFailed',
    );
    expect(titles.find((m) => m.command === 'botrider.chat.stop')?.when).toBe(
      'view == botrider.chat && (botrider.debateRunning || botrider.splitOpen)',
    );
    expect(chatCss).toContain('body.vscode-light');
    expect(chatCss).toContain('body.vscode-dark');
    expect(chatCss).toContain('body.vscode-high-contrast');
    expect(chatCss).toContain('font-size: 13px');
    expect(formCss).toContain('body.vscode-light');
    expect(formCss).toMatch(/var\(--vscode-/);
    expect(chatCss).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(formCss).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('create { draft } and split/pick without botId does not call Copilot', async () => {
    const gw = new FakeGateway();
    const msgs: { type: string; code?: string }[] = [];
    const app = new Application(
      new MemoryStore(),
      gw,
      new MemoryFs(),
      new MemoryFs(),
      new FixedWorkspace(defaultWorkspace),
      (m) => msgs.push(m),
    );
    await app.handleUi({
      type: 'bots/create',
      draft: { name: 'Zed', persona: 'p', role: 'r', instructions: 'i' },
    });
    expect(app.registry.list().some((b) => b.name === 'Zed')).toBe(true);
    expect(gw.ensureCalls).toBe(0);
    await app.handleUi({ type: 'split/pick', botId: '' });
    expect(gw.ensureCalls).toBe(0);
    expect(gw.requestCount).toBe(0);
    expect(msgs.some((m) => m.type === 'error' && m.code === 'unknown-handle')).toBe(true);
    expect(COPY.splitCapBody).toBe('The swarm did not agree after two rounds.');
  });
});
