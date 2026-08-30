export type DeliverableFormat = 'docx' | 'xlsx' | 'pptx' | 'html';

export type DeliverableSpec = {
  format: DeliverableFormat;
  path: string;
  title: string;
  outline: string[];
  facts?: string[];
};

export type FormatSpec = {
  intent: boolean;
  formats: DeliverableFormat[];
  hasOutline: boolean;
  outline: string[];
  title: string;
};

export const OFFICE_FORMATS: readonly DeliverableFormat[] = ['docx', 'xlsx', 'pptx'];

export function extensionFor(format: DeliverableFormat): string {
  return format === 'html' ? '.html' : `.${format}`;
}

export function formatFromExtension(path: string): DeliverableFormat | undefined {
  const lower = path.replace(/\\/g, '/').toLowerCase();
  if (lower.endsWith('.docx')) {
    return 'docx';
  }
  if (lower.endsWith('.xlsx')) {
    return 'xlsx';
  }
  if (lower.endsWith('.pptx')) {
    return 'pptx';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'html';
  }
  return undefined;
}

export function officeLabel(format: DeliverableFormat): 'Word' | 'Excel' | 'PowerPoint' | undefined {
  if (format === 'docx') {
    return 'Word';
  }
  if (format === 'xlsx') {
    return 'Excel';
  }
  if (format === 'pptx') {
    return 'PowerPoint';
  }
  return undefined;
}
