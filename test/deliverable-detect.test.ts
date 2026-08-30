import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectFormats, detectFormat, hasDeliverableIntent } from '../src/app/deliverable-detect';

const detectSrc = readFileSync(join(__dirname, '../src/app/deliverable-detect.ts'), 'utf8');

describe('deliverable detect (host string match)', () => {
  it('has no sendRequest and no Copilot', () => {
    expect(detectSrc).not.toMatch(/\.sendRequest\s*\(/);
    expect(detectSrc).not.toMatch(/vscode\.lm/);
    expect(detectSrc).not.toMatch(/gateway/);
    expect(detectSrc).not.toMatch(/ICopilotGateway/);
  });

  it('infers format only from named keywords', () => {
    expect(collectFormats('please make a deck')).toEqual(['pptx']);
    expect(collectFormats('a spreadsheet of costs')).toEqual(['xlsx']);
    expect(collectFormats('word doc please')).toEqual(['docx']);
    expect(collectFormats('word document please')).toEqual(['docx']);
    expect(collectFormats('a Word file')).toEqual(['docx']);
    expect(collectFormats('save as .docx')).toEqual(['docx']);
    expect(collectFormats('xlsx export')).toEqual(['xlsx']);
    expect(collectFormats('excel sheet')).toEqual(['xlsx']);
    expect(collectFormats('.xlsx please')).toEqual(['xlsx']);
    expect(collectFormats('pptx deck')).toEqual(['pptx']);
    expect(collectFormats('PowerPoint')).toEqual(['pptx']);
    expect(collectFormats('a ppt')).toEqual(['pptx']);
    expect(collectFormats('.pptx')).toEqual(['pptx']);
    expect(collectFormats('html page')).toEqual(['html']);
    expect(collectFormats('a webpage')).toEqual(['html']);
    expect(collectFormats('index.html')).toEqual(['html']);
  });

  it('does not treat report, document, slides, plan, or summary as a format', () => {
    expect(collectFormats('write a report')).toEqual([]);
    expect(collectFormats('write a document')).toEqual([]);
    expect(collectFormats('slides')).toEqual([]);
    expect(collectFormats('a plan')).toEqual([]);
    expect(collectFormats('summary')).toEqual([]);
    expect(detectFormat('write a report').formats).toEqual([]);
    expect(detectFormat('write a report').intent).toBe(true);
    expect(detectFormat('write a document').intent).toBe(true);
    expect(detectFormat('slides').intent).toBe(true);
    expect(detectFormat('write a plan').intent).toBe(true);
    expect(detectFormat('plan it').intent).toBe(false);
    expect(detectFormat('summary').intent).toBe(true);
  });

  it('never maps report to html', () => {
    const spec = detectFormat('write a report');
    expect(spec.formats).not.toContain('html');
    expect(spec.hasOutline).toBe(false);
  });

  it('names format and outline for a Word file with three sections', () => {
    const spec = detectFormat('Word file of the Q3 plan with three sections');
    expect(spec.intent).toBe(true);
    expect(spec.formats).toEqual(['docx']);
    expect(spec.hasOutline).toBe(true);
    expect(spec.outline).toEqual(['Section 1', 'Section 2', 'Section 3']);
    expect(spec.title.toLowerCase()).toContain('q3');
  });

  it('collects Excel and PowerPoint as two named formats', () => {
    const spec = detectFormat('Excel and PowerPoint of the same plan');
    expect(spec.formats).toEqual(['xlsx', 'pptx']);
    expect(spec.hasOutline).toBe(true);
  });

  it('does not mark ordinary code work as a deliverable', () => {
    expect(hasDeliverableIntent('build the feature')).toBe(false);
    expect(detectFormat('fix the bug').intent).toBe(false);
    expect(detectFormat('debate this').intent).toBe(false);
  });
});
