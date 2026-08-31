import { describe, expect, it } from 'vitest';
import { DeliverableBuilder, looksLikeHtml, templateForBot } from '../src/app/deliverable-builder';
import type { BotRecord } from '../src/domain/bot';
import type { DeliverableSpec } from '../src/domain/deliverable';

function bot(attachments: BotRecord['attachments'] = []): BotRecord {
  return {
    id: '1',
    handle: 'alpha',
    name: 'Alpha',
    persona: 'p',
    role: 'r',
    instructions: 'i',
    active: true,
    colorIndex: 0,
    createdAt: 't',
    updatedAt: 't',
    attachments,
  };
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function asText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe('DeliverableBuilder', () => {
  it('builds OOXML zip for Word, not markdown, and never includes vbaProject.bin', () => {
    const spec: DeliverableSpec = {
      format: 'docx',
      path: 'q3-plan.docx',
      title: 'Q3 plan',
      outline: ['Goals', 'Risks', 'Next'],
      facts: ['Ship in September'],
    };
    const file = DeliverableBuilder.build(spec);
    expect(file.kind).toBe('office-binary');
    expect(file.binary).toBeInstanceOf(Uint8Array);
    expect(isZip(file.binary!)).toBe(true);
    const text = asText(file.binary!);
    expect(text).not.toMatch(/^# /);
    expect(text).not.toContain('vbaProject.bin');
    expect(text).toContain('word/document.xml');
    expect(text).toContain('Goals');
  });

  it('builds HTML5 text and merges an IE html snapshot only for html format', () => {
    const snapshot = '<!DOCTYPE html><html><body><p>IE-TEMPLATE</p></body></html>';
    const record = bot([{ path: 'tpl.html', name: 'tpl.html', snapshot }]);
    const html = DeliverableBuilder.build(
      { format: 'html', path: 'page.html', title: 'Q3', outline: ['One'], facts: ['Fact'] },
      templateForBot(record, 'html'),
    );
    expect(html.kind).toBe('html-preview');
    expect(html.content).toContain('IE-TEMPLATE');
    expect(html.content).toContain('Q3');
    expect(html.content).toMatch(/<!DOCTYPE html>/i);

    const office = DeliverableBuilder.build(
      { format: 'docx', path: 'plan.docx', title: 'Q3', outline: ['One'] },
      templateForBot(record, 'docx'),
    );
    expect(office.kind).toBe('office-binary');
    expect(asText(office.binary!)).not.toContain('IE-TEMPLATE');
  });

  it('ignores text snapshots as zip templates for Office', () => {
    expect(looksLikeHtml('# heading\nnot html')).toBe(false);
    expect(templateForBot(bot([{ path: 'a.md', name: 'a.md', snapshot: '# heading' }]), 'html')).toBeUndefined();
    expect(templateForBot(bot([{ path: 'a.html', name: 'a.html', snapshot: '<html></html>' }]), 'docx')).toBeUndefined();
  });
});
