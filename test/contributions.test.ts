import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

// Node 20-safe walk of src .ts files. fs.globSync is Node 22+.
function listSrcTs(dir: string, prefix = 'src'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...listSrcTs(join(dir, entry.name), rel));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(rel);
    }
  }
  return out;
}

describe('contribution points', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    publisher: string;
    name: string;
    displayName: string;
    engines: { vscode: string };
    activationEvents: unknown[];
    extensionDependencies?: unknown;
    contributes: {
      commands: { command: string; title: string; tooltip?: string; category: string; enablement?: string }[];
      menus: Record<string, { command: string; when?: string; group?: string }[]>;
      viewsContainers: { activitybar: { id: string }[] };
      views: Record<string, { id: string; visibility?: string; type?: string }[]>;
      viewsWelcome: { view: string; when: string; contents: string }[];
      chatParticipants?: unknown;
    };
  };

  it('matches publisher, engines, empty activation, and host ids', () => {
    expect(pkg.publisher).toBe('botrider');
    expect(pkg.name).toBe('bot-rider');
    expect(pkg.displayName).toBe('Bot Rider');
    expect(pkg.engines.vscode).toBe('^1.99.0');
    expect(pkg.activationEvents).toEqual([]);
    expect(pkg.extensionDependencies).toBeUndefined();
    expect(pkg.contributes.chatParticipants).toBeUndefined();
    expect(pkg.contributes.viewsContainers.activitybar.map((v) => v.id)).toEqual(['botrider']);
    expect(pkg.contributes.views.botrider.map((v) => v.id)).toEqual([
      'botrider.bots',
      'botrider.chat',
      'botrider.review',
    ]);
    expect(pkg.contributes.views.botrider.find((v) => v.id === 'botrider.review')?.visibility).toBe('collapsed');
    expect(pkg.contributes.views.botrider.find((v) => v.id === 'botrider.chat')?.type).toBe('webview');
  });

  it('registers the required commands and hide/when rules', () => {
    const commands = pkg.contributes.commands.map((c) => c.command);
    expect(commands).toEqual(
      expect.arrayContaining([
        'botrider.bots.create',
        'botrider.bots.edit',
        'botrider.bots.delete',
        'botrider.bots.toggle',
        'botrider.chat.expand',
        'botrider.chat.stop',
        'botrider.changeset.approve',
        'botrider.changeset.reject',
        'botrider.changeset.retry',
        'botrider.review.openDiff',
        'botrider.split.continue',
        'botrider.split.pick',
        'botrider.copilot.recheck',
      ]),
    );
    expect(commands).not.toContain('botrider.split.stop');
    expect(pkg.contributes.commands.every((c) => c.category === 'Bot Rider')).toBe(true);
    expect(pkg.contributes.commands.find((c) => c.command === 'botrider.copilot.recheck')?.title).toBe(
      'Sign in to GitHub Copilot',
    );
    expect(pkg.contributes.commands.find((c) => c.command === 'botrider.changeset.retry')?.title).toBe('Retry');
    expect(pkg.contributes.commands.find((c) => c.command === 'botrider.changeset.retry')?.enablement).toBe(
      'botrider.applyFailed',
    );

    const palette = pkg.contributes.menus.commandPalette;
    expect(palette.find((m) => m.command === 'botrider.bots.edit')?.when).toBe('false');
    expect(palette.find((m) => m.command === 'botrider.bots.delete')?.when).toBe('false');
    expect(palette.find((m) => m.command === 'botrider.bots.toggle')?.when).toBe('false');
    expect(palette.find((m) => m.command === 'botrider.review.openDiff')?.when).toBe('false');
    expect(palette.find((m) => m.command === 'botrider.split.continue')?.when).toBe('botrider.splitOpen');
    expect(palette.find((m) => m.command === 'botrider.split.pick')?.when).toBe('botrider.splitOpen');
    expect(palette.find((m) => m.command === 'botrider.chat.stop')?.when).toBe(
      'botrider.debateRunning || botrider.splitOpen',
    );
    expect(palette.find((m) => m.command === 'botrider.changeset.retry')?.when).toBe('botrider.applyFailed');
    expect(palette.find((m) => m.command === 'botrider.changeset.retry')?.when).not.toContain('hasPendingChanges');

    const titles = pkg.contributes.menus['view/title'];
    expect(titles.find((m) => m.command === 'botrider.changeset.retry')?.when).toBe(
      'view == botrider.review && botrider.applyFailed',
    );
    expect(titles.find((m) => m.command === 'botrider.chat.expand')?.when).toContain('!botrider.chatExpanded');
    expect(titles.find((m) => m.command === 'botrider.chat.stop')?.when).toBe(
      'view == botrider.chat && (botrider.debateRunning || botrider.splitOpen)',
    );

    const approve = pkg.contributes.commands.find((c) => c.command === 'botrider.changeset.approve');
    const reject = pkg.contributes.commands.find((c) => c.command === 'botrider.changeset.reject');
    expect(approve?.title).toBe('Approve');
    expect(reject?.title).toBe('Reject');
    expect(approve?.tooltip).toBe('Approve and apply all proposed edits');
    expect(reject?.tooltip).toBe('Reject and discard all proposed edits');

    const itemCtx = pkg.contributes.menus['view/item/context'];
    expect(itemCtx.find((m) => m.command === 'botrider.bots.edit')?.group).toBe('inline@1');
    expect(itemCtx.find((m) => m.command === 'botrider.bots.delete')?.group).toBe('1_modification');
    expect(itemCtx.find((m) => m.command === 'botrider.bots.delete')?.group).not.toMatch(/^inline/);
  });

  it('Proposed Changes is a flat localeCompare file list', () => {
    const src = readFileSync(join(root, 'src/adapters/review-tree.ts'), 'utf8');
    expect(src).toContain('localeCompare');
    expect(src).not.toMatch(/kind: 'group'/);
    expect(src).not.toMatch(/proposedGroup/);
    expect(src).not.toMatch(/function group\(/);
    expect(src).toMatch(/description = 'Added'/);
    expect(src).toMatch(/description = 'Deleted'/);
    expect(src).toMatch(/description = 'Modified'/);
    expect(src).toContain('files · pending review');
    expect(src).toContain('1 file · pending review');
  });

  it('Bots tree a11y label and Inactive description suffix', () => {
    const src = readFileSync(join(root, 'src/adapters/bots-tree.ts'), 'utf8');
    expect(src).toContain('accessibilityInformation');
    expect(src).toContain("${bot.name}, ${bot.role}, ${bot.active ? 'active' : 'inactive'}");
    expect(src).toContain('`${bot.role} · Inactive`');
    expect(src).not.toMatch(/this\.description = `@\$\{bot\.handle\}`/);
    expect(src).toMatch(/command:\s*'botrider\.bots\.edit'/);
  });

  it('welcome views match copy', () => {
    const bots = pkg.contributes.viewsWelcome.find((v) => v.view === 'botrider.bots');
    const review = pkg.contributes.viewsWelcome.find((v) => v.view === 'botrider.review');
    expect(bots?.when).toBe('!botrider.hasBots');
    expect(bots?.contents).toContain('No bots yet. Create a bot with a name, persona, and role');
    expect(bots?.contents).toContain('command:botrider.bots.create');
    expect(review?.when).toBe('!botrider.hasPendingChanges');
    expect(review?.contents).toContain('Approve applies the whole batch. Reject discards it.');
  });

  it('source hygiene: no Settings Sync, no Copilot auth session, no other vendors, no writeFile apply path', () => {
    const files = listSrcTs(join(root, 'src'));
    const blobs = files.map((f) => ({ f, t: readFileSync(join(root, f), 'utf8') }));
    for (const { f, t } of blobs) {
      expect(t, f).not.toMatch(/setKeysForSync/);
      expect(t, f).not.toMatch(/authentication\.getSession/);
      expect(t, f).not.toMatch(/createChatParticipant/);
      expect(t, f).not.toMatch(/createSourceControl/);
      expect(t, f).not.toMatch(/family:\s*['"]/);
      expect(t, f).not.toMatch(/vendor:\s*['"](?!copilot)/);
    }
    const applyFiles = blobs.filter((b) => b.f.includes('changeset-store') || b.f.includes('vscode-workspace'));
    expect(applyFiles.some((b) => b.t.includes('applyEdit'))).toBe(true);
    expect(applyFiles.every((b) => !b.t.includes('writeFile'))).toBe(true);
    expect(applyFiles.every((b) => !/\bfs\.(writeFile|promises)/.test(b.t))).toBe(true);
  });
});
