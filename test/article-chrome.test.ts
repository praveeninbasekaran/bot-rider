import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
const chatCss = readFileSync(join(root, 'media/chat.css'), 'utf8');
const sidebar = readFileSync(join(root, 'src/adapters/chat-view.ts'), 'utf8');
const expand = readFileSync(join(root, 'src/adapters/chat-expand-panel.ts'), 'utf8');

const tokenHandler = chatJs.slice(chatJs.indexOf("msg.type === 'chat/token'"), chatJs.indexOf("msg.type === 'chat/mcp-read-start'"));
const turnEnd = chatJs.slice(chatJs.indexOf("msg.type === 'chat/turn-end'"), chatJs.indexOf("msg.type === 'chat/split'"));
const turnStart = chatJs.slice(chatJs.indexOf("msg.type === 'chat/turn-start'"), chatJs.indexOf("msg.type === 'chat/token'"));
const overflowFn = chatJs.slice(chatJs.indexOf('function paintPackOverflow'), chatJs.indexOf('function reduceMotion'));
const showSplitFn = chatJs.slice(chatJs.indexOf('function showSplit'), chatJs.indexOf('function hideSplit'));
const paintArticleFn = chatJs.slice(chatJs.indexOf('function paintArticle'), chatJs.indexOf('function avatarSvg'));

describe('Swarm article chrome (HV-1 AC8 §18)', () => {
  it('shares media/chat.js + chat.css on sidebar and Expand', () => {
    expect(sidebar).toContain("scriptFile: 'chat.js'");
    expect(sidebar).toContain("styleFile: 'chat.css'");
    expect(expand).toContain("scriptFile: 'chat.js'");
    expect(expand).toContain("styleFile: 'chat.css'");
    expect(expand).toContain("viewType = 'botrider.chatPanel'");
  });

  it('replaces pre.body dumps with 13px chat paragraphs', () => {
    expect(chatJs).not.toContain('<pre class="body">');
    expect(chatJs).not.toContain("querySelector('pre.body')");
    expect(chatJs).toContain('<p class="article-p article-stream">');
    expect(chatJs).toContain('class="body article-body"');
    expect(chatJs).toContain('function paintArticle');
    expect(chatCss).toMatch(/\.article-p\s*,[\s\S]*?font-size:\s*13px/);
    expect(chatCss).toMatch(/\.article-p\s*,[\s\S]*?font-family:\s*var\(--vscode-font-family\)/);
    expect(chatCss).toMatch(/\.article-p\s*,[\s\S]*?font-weight:\s*400/);
    expect(chatCss).toMatch(/\.article-p\s*,[\s\S]*?color:\s*var\(--vscode-foreground\)/);
    expect(chatCss).toMatch(/\.article-p\s*,[\s\S]*?line-height:\s*1\.45/);
    expect(chatCss).toMatch(/\.article-p\s*,[\s\S]*?margin:\s*0 0 8px/);
    expect(chatCss).toMatch(/\.article-p\s*,[\s\S]*?text-indent:\s*0/);
    expect(chatCss).toMatch(/\.article-body\s*\{[\s\S]*?font-size:\s*13px/);
    expect(chatCss).not.toMatch(/\.article-p[\s\S]{0,200}text-indent:\s*[1-9]/);
  });

  it('streams tokens into the paragraph and paints host-stripped text only at turn-end', () => {
    expect(tokenHandler).toContain('const current = flightFor(msg.botId)');
    expect(tokenHandler).toContain("current.stream.appendChild(document.createTextNode(msg.delta || ''))");
    expect(tokenHandler).not.toContain('paintArticle');
    expect(tokenHandler).not.toContain('splitArticleBlocks');
    expect(tokenHandler).not.toContain('innerHTML');
    expect(turnEnd).toContain('const current = flightFor(msg.botId)');
    expect(turnEnd).toContain('paintArticle(current.body, msg.text)');
    expect(turnEnd).toContain('msg.text !== undefined');
    expect(chatJs).not.toMatch(/mid-turn|truncate|ellipsis|word-cap|length counter/i);
  });

  it('demotes leftover # / ## / ### to a semibold 13px sentence with no heading scale', () => {
    expect(chatJs).toContain('/^#{1,3}(?!#)\\s*(.*)$/');
    expect(paintArticleFn).toContain("p.className = 'article-heading'");
    expect(paintArticleFn).not.toContain("createElement('h1')");
    expect(paintArticleFn).not.toContain("createElement('h2')");
    expect(paintArticleFn).not.toContain("createElement('h3')");
    expect(chatCss).toMatch(/\.article-heading\s*\{[^}]*font-weight:\s*600/s);
    expect(chatCss).toMatch(/\.article-heading\s*\{[^}]*margin-top:\s*0/s);
    expect(chatCss).toMatch(/\.article-p\s*,[\s\S]*?\.article-heading[\s\S]*?font-size:\s*13px/);
    expect(chatCss).not.toMatch(/\.article-heading[^{]*\{[^}]*font-size:\s*(1[4-9]|[2-9]\d)px/);
    expect(chatCss).not.toMatch(/\.article-body\s+h[1-6]/);
    expect(chatJs).not.toContain('stripArticleChrome');
    expect(chatJs).not.toContain('stripHeadingLeadIn');
    expect(chatJs).not.toContain('removeParseableTodoLines');
  });

  it('flattens nested lists to a single bullet level', () => {
    expect(chatJs).toContain('/^\\s*(?:[-*+]|\\d+[.)])\\s+/');
    expect(paintArticleFn).toContain("ul.className = 'article-list'");
    expect(paintArticleFn).not.toContain("createElement('ol')");
    expect(chatCss).toMatch(/\.article-list\s*\{[^}]*list-style:\s*disc/s);
    expect(chatCss).toMatch(/\.article-list ul\s*,[\s\S]*?display:\s*none/);
    expect(chatCss).toMatch(/\.article-list li\s*\{[^}]*font-size:\s*13px/s);
  });

  it('keeps fenced code and inline code without README chrome', () => {
    expect(paintArticleFn).toContain("pre.className = 'article-fence'");
    expect(paintArticleFn).toContain('pre.textContent = block.body');
    expect(chatJs).toContain("code.className = 'article-inline'");
    expect(chatCss).toMatch(/\.article-fence\s*\{[^}]*font-family:\s*var\(--vscode-editor-font-family\)/s);
    expect(chatCss).toMatch(/\.article-fence\s*\{[^}]*font-size:\s*12px/s);
    expect(chatCss).toMatch(/\.article-fence\s*\{[^}]*background:\s*var\(--vscode-editor-background\)/s);
    expect(chatCss).toMatch(/\.article-inline\s*\{[^}]*font-family:\s*var\(--vscode-editor-font-family\)/s);
    expect(chatCss).toMatch(/\.article-inline\s*\{[^}]*color:\s*var\(--vscode-textPreformat-foreground\)/s);
    expect(chatCss).toMatch(/\.article-inline\s*\{[^}]*font-size:\s*inherit/s);
    expect(chatJs).not.toMatch(/mermaid/i);
    expect(paintArticleFn).not.toContain("createElement('img')");
    expect(paintArticleFn).not.toContain('innerHTML');
    expect(chatJs).not.toMatch(/navigator\.clipboard|copy-btn|article-copy/);
  });

  it('renders leftover AGREE/DISSENT as ordinary text, not badges', () => {
    expect(chatJs).not.toMatch(/agree-badge|dissent-badge|vote-badge|protocol-badge/i);
    expect(paintArticleFn).not.toMatch(/\bAGREE\b/);
    expect(paintArticleFn).not.toMatch(/\bDISSENT\b/);
    expect(chatCss).not.toMatch(/\.agree|\.dissent|badge.*AGREE/i);
  });

  it('paints user bubbles and Split positions as 13px article prose', () => {
    expect(chatJs).toContain('function appendUser');
    expect(chatJs).toContain("body.className = 'body article-body'");
    expect(chatJs).toContain('paintArticle(body, text)');
    expect(showSplitFn).toContain("article.className = 'article-body'");
    expect(showSplitFn).toContain("paintArticle(article, p.text || '')");
    expect(showSplitFn).toContain('<h3>');
    expect(showSplitFn).toContain("class=\"split-positions\"");
    expect(showSplitFn).toContain('split-continue');
    expect(showSplitFn).toContain('split-pick');
    expect(showSplitFn).toContain('split-stop');
    expect(chatCss).toMatch(/\.split-card h3\s*\{[^}]*font-size:\s*13px/s);
  });

  it('leaves Run board, round headers, implementer skip, and pack-overflow composer alone', () => {
    expect(chatJs).toContain('id="run-board"');
    expect(chatJs).toContain("className = 'round-header'");
    expect(chatJs).toContain("msg.turn === 'implement' || msg.turn === 'consensus'");
    expect(turnStart).toContain('return;');
    expect(overflowFn).not.toContain('lockComposer()');
    expect(overflowFn).not.toContain('input.disabled');
    expect(chatJs).not.toMatch(/voice toggle|plain-vs-markdown|Graphify|token meter|speaker cap|lockComposer on overflow/i);
    expect(chatJs).not.toMatch(/pre-Send|lengthCounter|voiceToggle|markdownToggle/i);
    expect(chatCss).toMatch(/\.run-board\s*\{[^}]*flex-shrink:\s*0/s);
    expect(chatCss).toMatch(/\.round-header\s*\{[^}]*font-size:\s*11px/s);
  });
});
