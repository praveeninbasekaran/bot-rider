import type { RunBoardDto } from '../protocol/messages';
import type { DeliverableFormat, FormatSpec } from '../domain/deliverable';

/** Host string-match only. Never calls Copilot just to guess format. */
const FORMAT_RULES: { re: RegExp; format: DeliverableFormat }[] = [
  { re: /\bword\s+documents?\b/gi, format: 'docx' },
  { re: /\bword\s+docs?\b/gi, format: 'docx' },
  { re: /\bword\b/gi, format: 'docx' },
  { re: /\.docx\b/gi, format: 'docx' },
  { re: /\bdocx\b/gi, format: 'docx' },
  { re: /\bspreadsheets?\b/gi, format: 'xlsx' },
  { re: /\bexcel\b/gi, format: 'xlsx' },
  { re: /\.xlsx\b/gi, format: 'xlsx' },
  { re: /\bxlsx\b/gi, format: 'xlsx' },
  { re: /\bpowerpoint\b/gi, format: 'pptx' },
  { re: /\bdecks?\b/gi, format: 'pptx' },
  { re: /\.pptx\b/gi, format: 'pptx' },
  { re: /\bpptx\b/gi, format: 'pptx' },
  { re: /\bppt\b/gi, format: 'pptx' },
  { re: /\bwebpages?\b/gi, format: 'html' },
  { re: /\.html?\b/gi, format: 'html' },
  { re: /\bhtml\b/gi, format: 'html' },
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function detectFormat(goal: string, board?: RunBoardDto): FormatSpec {
  const userText = [goal, board?.goal].filter((part): part is string => !!part && !!part.trim()).join('\n');
  const formatCorpus = [
    userText,
    ...(board?.todos ?? []).map((t) => t.text),
    ...(board?.decisions ?? []),
  ]
    .filter((part) => part && part.trim())
    .join('\n');

  const formats = collectFormats(formatCorpus);
  const outline = extractOutline(userText);
  const hasOutline = outline.length > 0 || hasOutlineCue(userText);
  const intent = formats.length > 0 || hasDeliverableIntent(userText) || hasDeliverableIntent(formatCorpus);
  const title = inferTitle(userText, formats);

  return { intent, formats, hasOutline, outline, title };
}

export function collectFormats(text: string): DeliverableFormat[] {
  const hits: { index: number; format: DeliverableFormat }[] = [];
  for (const rule of FORMAT_RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      hits.push({ index: match.index, format: rule.format });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const formats: DeliverableFormat[] = [];
  const seen = new Set<DeliverableFormat>();
  for (const hit of hits) {
    if (seen.has(hit.format)) {
      continue;
    }
    seen.add(hit.format);
    formats.push(hit.format);
  }
  return formats;
}

export function hasDeliverableIntent(text: string): boolean {
  const src = text.toLowerCase();
  if (/\breports?\b/.test(src)) {
    return true;
  }
  if (/\bdocuments?\b/.test(src) && !/\bdocumentation\b/.test(src)) {
    return true;
  }
  if (/\bslides?\b/.test(src)) {
    return true;
  }
  if (/\bsummar(?:y|ies)\b/.test(src)) {
    return true;
  }
  if (/\b(write|create|make|draft|prepare|generate)\b[\s\S]{0,48}\bplans?\b/.test(src)) {
    return true;
  }
  if (/^\s*(?:a|the)?\s*plans?\s*[.?!]?\s*$/.test(src)) {
    return true;
  }
  return collectFormats(text).length > 0;
}

export function extractOutline(text: string): string[] {
  const include = text.match(/\b(?:include|including)\s+([^.;\n]+)/i);
  if (include?.[1]) {
    const items = splitList(include[1]);
    if (items.length) {
      return items;
    }
  }
  const numbered = [...text.matchAll(/^\s*(?:\d+[\).]|[-*])\s+(.+)$/gm)]
    .map((m) => (m[1] ?? '').trim())
    .filter(Boolean);
  if (numbered.length >= 2) {
    return numbered;
  }
  const countMatch = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+sections?\b/i);
  if (countMatch?.[1]) {
    const n = parseCount(countMatch[1]);
    if (n > 0) {
      return Array.from({ length: n }, (_, i) => `Section ${i + 1}`);
    }
  }
  const ofThe = text.match(/\bof the\s+(.+?)(?:\s+with\b|[.?!]|$)/i);
  if (ofThe?.[1]) {
    const item = cleanPhrase(ofThe[1]);
    if (item) {
      return [item];
    }
  }
  return [];
}

export function inferTitle(text: string, formats: DeliverableFormat[]): string {
  const ofThe = text.match(/\bof the\s+(.+?)(?:\s+with\b|[.?!]|$)/i);
  if (ofThe?.[1]) {
    const title = cleanPhrase(ofThe[1]);
    if (title) {
      return title;
    }
  }
  let stripped = text.replace(/\s+/g, ' ').trim();
  stripped = stripped.replace(
    /\b(write|create|make|draft|prepare|generate|build)\b/gi,
    '',
  );
  stripped = stripped.replace(
    /\b(word\s+documents?|word\s+docs?|word|docx|spreadsheets?|excel|xlsx|powerpoint|pptx|ppt|decks?|webpages?|html|files?)\b/gi,
    '',
  );
  stripped = stripped.replace(/\.(docx|xlsx|pptx|html?)\b/gi, '');
  stripped = stripped.replace(/\b(a|an|the|and|of|with)\b/gi, ' ');
  stripped = stripped.replace(/\s+/g, ' ').trim();
  if (stripped) {
    return stripped.length > 80 ? stripped.slice(0, 80).trim() : stripped;
  }
  if (formats[0] === 'xlsx') {
    return 'Spreadsheet';
  }
  if (formats[0] === 'pptx') {
    return 'Deck';
  }
  if (formats[0] === 'html') {
    return 'Page';
  }
  return 'Document';
}

export function slugPath(title: string, format: DeliverableFormat): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'deliverable';
  return `${slug}.${format === 'html' ? 'html' : format}`;
}

function hasOutlineCue(text: string): boolean {
  return (
    /\b(sections?|sheets?|include|including|outline|chapters?)\b/i.test(text) ||
    /\bof the\b/i.test(text) ||
    /\bmust\s+(include|contain|have)\b/i.test(text)
  );
}

function parseCount(raw: string): number {
  const lower = raw.toLowerCase();
  if (NUMBER_WORDS[lower] !== undefined) {
    return NUMBER_WORDS[lower]!;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 0;
}

function splitList(raw: string): string[] {
  return raw
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((item) => cleanPhrase(item))
    .filter(Boolean);
}

function cleanPhrase(raw: string): string {
  return raw
    .replace(/\b(same|following)\b/gi, ' ')
    .replace(/["""']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
