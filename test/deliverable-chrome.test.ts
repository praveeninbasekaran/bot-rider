import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COPY } from '../src/app/copy';
import { resolveProposedOpen } from '../src/app/deliverable-open';
import { inferChangeKind } from '../src/domain/changeset';
import { filesToPreview } from '../src/protocol/messages';
import {
  htmlPreviewDocument,
  officeInspectLine,
  proposedCreateDecoration,
  proposedDocumentText,
  proposedFileChrome,
  proposedFileLabel,
  proposedResourcePath,
} from '../src/adapters/review-chrome';

const root = join(__dirname, '..');
const review = readFileSync(join(root, 'src/adapters/review-tree.ts'), 'utf8');
const extension = readFileSync(join(root, 'src/extension.ts'), 'utf8');
const chatJs = readFileSync(join(root, 'media/chat.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  contributes: {
    commands: { command: string }[];
    views: Record<string, { id: string }[]>;
    menus: Record<string, { command: string; when?: string }[]>;
  };
};

const fileItemFn = review.slice(review.indexOf('function fileItem'), review.indexOf('function mcpItem'));
const openFn = review.slice(review.indexOf('export async function openProposedDiff'), review.indexOf('export async function openHtmlPreview'));
const htmlFn = review.slice(review.indexOf('export async function openHtmlPreview'), review.indexOf('export async function closeDeliverablePreviews'));

describe('§21 standard-deliverables Proposed Changes chrome', () => {
  it('lists workspace-relative paths with the real extension and Added on creates', () => {
    const samples = [
      { path: 'Q3-plan.docx', ext: '.docx' },
      { path: 'slides.pptx', ext: '.pptx' },
      { path: 'budget.xlsx', ext: '.xlsx' },
      { path: 'overview.html', ext: '.html' },
    ];
    for (const sample of samples) {
      const chrome = proposedFileChrome({ path: sample.path, op: 'create' });
      expect(chrome.label).toBe(sample.path);
      expect(chrome.label.endsWith(sample.ext)).toBe(true);
      expect(chrome.resourcePath.endsWith(sample.ext)).toBe(true);
      expect(proposedResourcePath(sample.path)).toBe(`/${sample.path}`);
      expect(chrome.description).toBe('Added');
      expect(chrome.contextValue).toBe('proposedFile');
      expect(chrome.command).toBe('botrider.review.openDiff');
      expect(chrome.decoration).toEqual({ badge: 'A', tooltip: 'Added' });
    }
    expect(proposedFileLabel('docs/Q3-plan.docx')).toBe('docs/Q3-plan.docx');
    expect(proposedFileChrome({ path: 'src/app.ts', op: 'update' }).decoration).toBeUndefined();
    expect(proposedFileChrome({ path: 'gone.ts', op: 'delete' }).description).toBe('Deleted');
  });

  it('uses resourceUri (not ThemeIcon) so the file-icon theme sees the extension', () => {
    expect(fileItemFn).toContain('proposedFileChrome(file)');
    expect(fileItemFn).toContain('proposedUri(chrome.resourcePath)');
    expect(fileItemFn).toContain('item.resourceUri');
    expect(fileItemFn).not.toContain('iconPath');
    expect(fileItemFn).not.toContain('ThemeIcon');
    expect(fileItemFn).not.toContain('Uri.parse(`file:');
    expect(review).toContain('uri.scheme !== PROPOSED_SCHEME');
    expect(review).toContain('proposedUri(chrome.resourcePath)');
    expect(extension).toContain('registerFileDecorationProvider(reviewTree.decorations)');
    expect(review).toContain('ProposedFileDecorationProvider');
    expect(review).toContain('new vscode.FileDecoration(dec.badge, dec.tooltip)');
    expect(proposedCreateDecoration()).toEqual({ badge: 'A', tooltip: 'Added' });
  });

  it('stays on the same Files section and BR-6 Approve/Reject — no extra deliverable gate', () => {
    expect(review).toContain("sectionItem('Files', 'filesSection', 'reviewFilesSection')");
    expect(fileItemFn).toContain("command: chrome.command");
    expect(pkg.contributes.commands.map((c) => c.command)).not.toEqual(
      expect.arrayContaining([
        'botrider.deliverable.approve',
        'botrider.changeset.approveDeliverable',
      ]),
    );
    expect(pkg.contributes.commands.some((c) => /deliverable/i.test(c.command))).toBe(false);
    expect(pkg.contributes.views.botrider.map((v) => v.id)).toEqual([
      'botrider.bots',
      'botrider.chat',
      'botrider.review',
    ]);
    const titles = pkg.contributes.menus['view/title'];
    expect(titles.some((m) => m.command === 'botrider.changeset.approve')).toBe(true);
    expect(titles.some((m) => m.command === 'botrider.changeset.reject')).toBe(true);
    expect(titles.filter((m) => m.command === 'botrider.changeset.approve')).toHaveLength(1);
  });

  it('default click on .html is a readonly preview titled {filename} (Proposed)', () => {
    const plan = resolveProposedOpen({
      path: 'overview.html',
      op: 'create',
      content: '<!DOCTYPE html><html><head></head><body><h1>Q3</h1></body></html>',
    });
    expect(plan.mode).toBe('html-preview');
    if (plan.mode === 'html-preview') {
      expect(plan.title).toBe(COPY.htmlPreviewTitle('overview.html'));
      expect(plan.title).toBe('overview.html (Proposed)');
      const doc = htmlPreviewDocument(plan.html);
      expect(doc).toContain('Content-Security-Policy');
      expect(doc).toContain('<h1>Q3</h1>');
    }
    expect(htmlFn).toContain("createWebviewPanel");
    expect(htmlFn).toContain("'botrider.deliverablePreview'");
    expect(htmlFn).toContain('enableScripts: false');
    expect(htmlFn).toContain('htmlPreviewDocument(html)');
    const previewReturn = openFn.indexOf("plan.mode === 'html-preview'");
    const firstDiff = openFn.indexOf("executeCommand('vscode.diff'");
    expect(previewReturn).toBeGreaterThan(-1);
    expect(openFn.slice(previewReturn, previewReturn + 180)).toContain('return;');
    expect(firstDiff).toBeGreaterThan(previewReturn);
  });

  it('Office open is the inspect line and never vscode.diff on zip/XML', () => {
    expect(officeInspectLine('Q3-plan.docx')).toBe('Q3-plan.docx · new Word file');
    expect(officeInspectLine('budget.xlsx')).toBe('budget.xlsx · new Excel file');
    expect(officeInspectLine('slides.pptx')).toBe('slides.pptx · new PowerPoint file');
    expect(COPY.officeInspect('Q3-plan.docx', 'Word')).toBe('Q3-plan.docx · new Word file');

    for (const path of ['Q3-plan.docx', 'budget.xlsx', 'slides.pptx']) {
      const plan = resolveProposedOpen({ path, op: 'create', kind: 'office-binary' });
      expect(plan.mode).toBe('office-inspect');
      if (plan.mode === 'office-inspect') {
        expect(plan.message).toBe(officeInspectLine(path));
      }
    }

    const inspectAt = openFn.indexOf("plan.mode === 'office-inspect'");
    const htmlAt = openFn.indexOf("plan.mode === 'html-preview'");
    const diffAt = openFn.indexOf("executeCommand('vscode.diff'");
    expect(inspectAt).toBeGreaterThan(-1);
    expect(inspectAt).toBeLessThan(htmlAt);
    expect(htmlAt).toBeLessThan(diffAt);
    expect(openFn.slice(inspectAt, htmlAt)).toContain('showInformationMessage(plan.message)');
    expect(openFn.slice(inspectAt, htmlAt)).toContain('return;');
    expect(openFn.slice(inspectAt, htmlAt)).not.toContain('vscode.diff');
    expect(proposedDocumentText('Q3-plan.docx', undefined)).toBe('Q3-plan.docx · new Word file');
    expect(proposedDocumentText('Q3-plan.docx', '', {})).toBe('Q3-plan.docx · new Word file');
    expect(proposedDocumentText('Q3-plan.docx', 'PK\u0003\u0004')).toBe('Q3-plan.docx · new Word file');
    expect(proposedDocumentText('Q3-plan.docx', undefined, { empty: true })).toBe('');
  });

  it('other text still uses native vscode.diff; missing format stays Swarm chat', () => {
    const text = resolveProposedOpen({ path: 'src/app.ts', op: 'update', content: 'x' });
    expect(text.mode).toBe('text-diff');
    expect(openFn).toContain("executeCommand('vscode.diff'");
    expect(review).not.toMatch(/showQuickPick|ui\/pick|format picker|formatPicker/i);
    expect(review).not.toMatch(/report\s*→\s*html|report.*\.html/);
    expect(review).not.toContain('lockComposer');
    expect(chatJs).not.toMatch(/Which format should I write/);
    expect(pkg.contributes.commands.some((c) => /pick.*format|format.*pick/i.test(c.command))).toBe(false);
  });

  it('keeps composer enabled on deliverableAsk; Split lock still wins', () => {
    expect(chatJs).toContain('const deliverableAsk = !!(state.run && state.run.deliverableAsk)');
    expect(chatJs).toContain('!!state.splitOpen || (!!state.debateRunning && !deliverableAsk)');
    const composerLocked = (s: {
      ready?: boolean;
      splitOpen?: boolean;
      debateRunning?: boolean;
      deliverableAsk?: boolean;
    }) => {
      const ready = s.ready !== false;
      const deliverableAsk = !!s.deliverableAsk;
      return !ready || !!s.splitOpen || (!!s.debateRunning && !deliverableAsk);
    };
    expect(composerLocked({ deliverableAsk: true })).toBe(false);
    expect(composerLocked({ deliverableAsk: true, debateRunning: true })).toBe(false);
    expect(composerLocked({ deliverableAsk: true, splitOpen: true })).toBe(true);
    expect(composerLocked({ splitOpen: true })).toBe(true);
    expect(composerLocked({ debateRunning: true })).toBe(true);
  });

  it('consumes optional changeset/preview kind and infers from the extension when omitted', () => {
    expect(inferChangeKind({ path: 'notes.txt', kind: 'html-preview' })).toBe('html-preview');
    expect(inferChangeKind({ path: 'notes.txt', kind: 'office-binary' })).toBe('office-binary');
    expect(resolveProposedOpen({ path: 'notes.txt', op: 'create', kind: 'html-preview', content: '<p>x</p>' }).mode).toBe(
      'html-preview',
    );
    expect(resolveProposedOpen({ path: 'mystery.bin', op: 'create', kind: 'office-binary' }).mode).toBe('office-inspect');
    expect(inferChangeKind({ path: 'overview.html' })).toBe('html-preview');
    expect(inferChangeKind({ path: 'Q3-plan.docx' })).toBe('office-binary');
    expect(inferChangeKind({ path: 'budget.xlsx' })).toBe('office-binary');
    expect(inferChangeKind({ path: 'slides.pptx' })).toBe('office-binary');
    expect(inferChangeKind({ path: 'src/app.ts' })).toBe('text');
    const preview = filesToPreview([
      { path: 'Q3-plan.docx', op: 'create' },
      { path: 'overview.html', op: 'create' },
      { path: 'src/app.ts', op: 'update' },
    ]);
    expect(preview.map((f) => `${f.path}:${f.kind}`)).toEqual([
      'Q3-plan.docx:office-binary',
      'overview.html:html-preview',
      'src/app.ts:text',
    ]);
    expect(preview.every((f) => /\.\w+$/.test(f.path))).toBe(true);
    expect(review).toContain("kind: 'kind' in file ? file.kind : undefined");
    expect(extension).toContain('kind?: ChangePreviewKind');
  });
});
