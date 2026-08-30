import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COPY } from '../src/app/copy';
import { mcpFailedViewMessage, reviewChromeMode } from '../src/adapters/review-chrome';

const root = join(__dirname, '..');
const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
const review = readFileSync(join(root, 'src/adapters/review-tree.ts'), 'utf8');
const extension = readFileSync(join(root, 'src/extension.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  contributes: {
    commands: { command: string; tooltip?: string }[];
    menus: Record<string, { command: string; when?: string; group?: string }[]>;
  };
};

describe('Staged MCP actions chrome (§19 Grain B)', () => {
  it('uses independent gates: one click cannot apply both', () => {
    expect(reviewChromeMode(2, 3)).toBe('both');
    expect(reviewChromeMode(1, 0)).toBe('files');
    expect(reviewChromeMode(0, 2)).toBe('mcp');
    expect(reviewChromeMode(0, 0)).toBe('empty');

    const titles = pkg.contributes.menus['view/title'];
    const fileTitle = titles.find((m) => m.command === 'botrider.changeset.approve');
    const mcpTitle = titles.find((m) => m.command === 'botrider.mcp.approve');
    expect(fileTitle?.when).toContain('!botrider.hasPendingMcp');
    expect(mcpTitle?.when).toContain('!botrider.hasPendingChanges');

    const itemCtx = pkg.contributes.menus['view/item/context'];
    expect(itemCtx.some((m) => m.command === 'botrider.changeset.approve' && m.when?.includes('reviewFilesSection'))).toBe(
      true,
    );
    expect(itemCtx.some((m) => m.command === 'botrider.mcp.approve' && m.when?.includes('reviewMcpSection'))).toBe(true);

    expect(extension).toMatch(/botrider\.changeset\.approve',\s*\(\) => approveChanges\(\)/);
    expect(extension).toMatch(/botrider\.mcp\.approve',\s*\(\) => app\.approveMcp\(\)/);
    expect(extension).not.toMatch(/approveChanges\([^)]*\)[\s\S]{0,40}approveMcp/);
    expect(extension).not.toMatch(/approveMcp\([^)]*\)[\s\S]{0,40}approveChanges/);
    expect(chatJs).not.toContain("type: 'mcp/actions-approve'");
    expect(chatJs).not.toContain("type: 'changeset/approve'");
  });

  it('pins MCP Approve/Reject on the MCP section header when both gates are pending', () => {
    expect(review).toContain("mode === 'both'");
    expect(review).toContain("sectionItem('Files', 'filesSection', 'reviewFilesSection')");
    expect(review).toContain("sectionItem('MCP actions', 'mcpSection', 'reviewMcpSection')");
    const mcpApprove = pkg.contributes.commands.find((c) => c.command === 'botrider.mcp.approve');
    const fileApprove = pkg.contributes.commands.find((c) => c.command === 'botrider.changeset.approve');
    expect(fileApprove?.tooltip).toBe('Apply file changes');
    expect(mcpApprove?.tooltip).toBe('Run MCP actions');
  });

  it('paints exact §19.4 fail copy with no blank line between the two lines', () => {
    const lines = COPY.mcpActionsFailed.split('\n');
    expect(lines).toEqual([
      'MCP actions failed',
      'Some remote side effects (Figma, Azure Boards, or other servers) may already have happened and may not roll back.',
    ]);
    expect(COPY.mcpActionsFailed).not.toContain('\n\n');
    const message = mcpFailedViewMessage();
    expect(message.startsWith(COPY.mcpActionsFailed)).toBe(true);
    expect(message.slice(0, COPY.mcpActionsFailed.length)).not.toContain('\n\n');
    expect(message).toContain('[ Retry ](command:botrider.mcp.approve)');
    expect(message).toContain('[ Reject ](command:botrider.mcp.reject)');
    expect(review).toContain('mcpFailedViewMessage()');
    expect(review).not.toMatch(/Applied MCP|MCP actions applied|success/i);
  });

  it('Swarm card is MCP actions · n plus Review only and hides when empty', () => {
    expect(chatJs).toContain("'MCP actions · ' + list.length");
    expect(chatJs).toContain("link.textContent = 'Review'");
    expect(chatJs).toContain("type: 'ui/focus-review-mcp'");
    expect(chatJs).toContain('function hideMcpActions');
    expect(chatJs).toContain("msg.type === 'mcp/actions-cleared'");
    expect(chatJs).toContain('hideMcpActions()');
    const cardFn = chatJs.slice(chatJs.indexOf('function showMcpActions'), chatJs.indexOf('window.addEventListener'));
    expect(cardFn).not.toMatch(/Approve/);
    expect(cardFn).not.toContain('mcp/actions-approve');
    expect(cardFn).toContain('if (!list.length)');
    expect(cardFn).not.toMatch(/for\s*\(.*actions/);
    expect(cardFn).not.toMatch(/actions\.map/);
    expect(chatJs).not.toMatch(/run-board[\s\S]{0,200}mcp\/actions/);
  });

  it('MCP rows are tools chrome, not file diffs', () => {
    expect(review).toContain('`${action.server} · ${action.tool}`');
    expect(review).toContain('ThemeIcon(\'tools\')');
    expect(review).toContain('action.argsLine');
    expect(review).toContain('@${action.handle}');
    const mcpItemFn = review.slice(review.indexOf('function mcpItem'));
    expect(mcpItemFn).not.toContain('resourceUri');
    expect(mcpItemFn).not.toContain('openDiff');
    expect(mcpItemFn).not.toContain('item.command');
  });
});
