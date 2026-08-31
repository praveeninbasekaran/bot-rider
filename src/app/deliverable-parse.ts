import type { DeliverableFormat, DeliverableSpec, FormatSpec } from '../domain/deliverable';
import { formatFromExtension } from '../domain/deliverable';
import { extractChangesetJson, validateRelativePath } from './patch-parser';
import { slugPath } from './deliverable-detect';

const FORMATS = new Set<DeliverableFormat>(['docx', 'xlsx', 'pptx', 'html']);

export function extractDeliverableSpecs(text: string, workspaceRoot: string): DeliverableSpec[] {
  const json = extractChangesetJson(text);
  if (!json || typeof json !== 'object') {
    return [];
  }
  const filesRaw = (json as { files?: unknown }).files;
  if (!Array.isArray(filesRaw)) {
    return [];
  }
  const specs: DeliverableSpec[] = [];
  for (const item of filesRaw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as {
      path?: unknown;
      op?: unknown;
      format?: unknown;
      title?: unknown;
      outline?: unknown;
      facts?: unknown;
      content?: unknown;
    };
    if (typeof rec.path !== 'string') {
      continue;
    }
    if (rec.op && rec.op !== 'create') {
      continue;
    }
    const format =
      (typeof rec.format === 'string' && FORMATS.has(rec.format as DeliverableFormat)
        ? (rec.format as DeliverableFormat)
        : undefined) ?? formatFromExtension(rec.path);
    if (!format) {
      continue;
    }
    if (typeof rec.content === 'string' && looksLikeZipOrBase64(rec.content)) {
      // Implementer must not emit zip/base64; host builder owns bytes.
    }
    const pathCheck = validateRelativePath(ensureExtension(rec.path, format), workspaceRoot);
    if (!pathCheck.ok) {
      continue;
    }
    const outline = Array.isArray(rec.outline)
      ? rec.outline.filter((line): line is string => typeof line === 'string' && !!line.trim()).map((l) => l.trim())
      : [];
    const facts = Array.isArray(rec.facts)
      ? rec.facts.filter((line): line is string => typeof line === 'string' && !!line.trim()).map((l) => l.trim())
      : undefined;
    specs.push({
      format,
      path: pathCheck.relative,
      title: typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : pathCheck.relative,
      outline,
      facts,
    });
  }
  return specs;
}

export function selectPrimarySpecs(
  named: DeliverableFormat[],
  fromImpl: DeliverableSpec[],
  detected: FormatSpec,
): DeliverableSpec[] {
  const wanted = named.length ? named : detected.formats;
  const picked: DeliverableSpec[] = [];
  for (const format of wanted) {
    const match = fromImpl.find((spec) => spec.format === format && !picked.some((p) => p.path === spec.path));
    if (match) {
      picked.push({
        ...match,
        outline: match.outline.length ? match.outline : detected.outline,
        title: match.title || detected.title,
      });
      continue;
    }
    picked.push({
      format,
      path: slugPath(detected.title, format),
      title: detected.title,
      outline: detected.outline,
    });
  }
  return picked;
}

function ensureExtension(path: string, format: DeliverableFormat): string {
  const ext = format === 'html' ? '.html' : `.${format}`;
  const lower = path.toLowerCase();
  if (lower.endsWith(ext) || (format === 'html' && lower.endsWith('.htm'))) {
    return path;
  }
  return `${path}${ext}`;
}

function looksLikeZipOrBase64(content: string): boolean {
  if (content.startsWith('PK')) {
    return true;
  }
  if (/^UEsDB/i.test(content.trim())) {
    return true;
  }
  return false;
}
