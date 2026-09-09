import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import {
  ONBOARDING_SAMPLE_TASK,
  OnboardingStore,
  WORKER_BOT_TEMPLATES,
} from '../src/app/onboarding';
import type { HostToUi } from '../src/protocol/messages';
import { FakeGateway, FixedWorkspace, MemoryFs, MemoryStore, defaultWorkspace } from './fakes';

describe('P0 first-run experience', () => {
  it('persists completion and permits reopening without resetting it', async () => {
    const store = new MemoryStore();
    const onboarding = new OnboardingStore(store);
    expect(onboarding.snapshot()).toEqual({ open: true, complete: false });
    await onboarding.markComplete();
    expect(new OnboardingStore(store).snapshot()).toEqual({ open: false, complete: true });
    expect(onboarding.reopen()).toEqual({ open: true, complete: true });
    expect(onboarding.dismiss()).toEqual({ open: false, complete: true });
  });

  it('creates worker templates and completes after a successful file review', async () => {
    const store = new MemoryStore();
    const fs = new MemoryFs();
    const messages: HostToUi[] = [];
    const app = new Application(
      store,
      new FakeGateway(),
      fs,
      fs,
      new FixedWorkspace(defaultWorkspace),
      (message) => messages.push(message),
    );
    app.snapshotOnboarding();
    expect(messages.at(-1)).toEqual({
      type: 'onboarding/state',
      open: true,
      complete: false,
      sampleTask: ONBOARDING_SAMPLE_TASK,
    });
    await app.handleUi({ type: 'onboarding/template', template: 'coder' });
    expect(app.registry.getByHandle('coder')).toMatchObject(WORKER_BOT_TEMPLATES.coder);

    app.changesets.setPending([{ path: 'safe.txt', op: 'create', content: 'done' }]);
    expect(await app.approve()).toBe(true);
    expect(new OnboardingStore(store).snapshot()).toEqual({ open: false, complete: true });
    app.reopenOnboarding();
    expect(messages.at(-1)).toMatchObject({ type: 'onboarding/state', open: true, complete: true });
  });

  it('renders all guidance and contributes a reopen command', () => {
    const root = join(__dirname, '..');
    const chat = readFileSync(join(root, 'media/chat.js'), 'utf8');
    const hub = readFileSync(join(root, 'src/adapters/chat-view.ts'), 'utf8');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      contributes: { commands: { command: string }[] };
    };
    for (const text of [
      'GitHub Copilot',
      '<strong>Spec</strong>',
      '<strong>Dispatcher</strong>',
      '<strong>Debate</strong>',
      '<strong>Work</strong>',
      'Use sample task',
      'Proposed Changes',
      'Review Files as diffs/previews',
      'approve MCP actions separately',
    ]) {
      expect(chat).toContain(text);
    }
    expect(chat).toContain("type: 'onboarding/template'");
    expect(chat).toContain("type: 'ui/focus-review-files'");
    expect(chat).toContain("type: 'ui/focus-review-mcp'");
    expect(hub).toContain("msg.type === 'onboarding/state'");
    expect(pkg.contributes.commands.some((command) => command.command === 'botrider.onboarding.reopen')).toBe(true);
  });
});
