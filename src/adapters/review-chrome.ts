import { COPY } from '../app/copy';
import type { ChangeFile } from '../domain/changeset';
import { inferChangeKind } from '../domain/changeset';
import { formatFromExtension, officeLabel } from '../domain/deliverable';

export type ReviewChromeMode = 'empty' | 'files' | 'mcp' | 'both';

export function reviewChromeMode(fileCount: number, mcpCount: number): ReviewChromeMode {
  if (fileCount > 0 && mcpCount > 0) {
    return 'both';
  }
  if (fileCount > 0) {
    return 'files';
  }
  if (mcpCount > 0) {
    return 'mcp';
  }
  return 'empty';
}

/** Exact §19.4 two lines, no blank line between them. Retry/Reject are MCP-gate only. */
export function mcpFailedViewMessage(): string {
  return `${COPY.mcpActionsFailed}\n[ Retry ](command:botrider.mcp.approve) [ Reject ](command:botrider.mcp.reject)`;
}

/** Workspace-relative path; never strip the real extension. */
export function proposedFileLabel(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

export type ProposedFileChrome = {
  label: string;
  description: 'Added' | 'Deleted' | 'Modified';
  contextValue: 'proposedFile';
  command: 'botrider.review.openDiff';
  resourcePath: string;
  decoration?: { badge: 'A'; tooltip: 'Added' };
};

export function proposedFileChrome(file: Pick<ChangeFile, 'path' | 'op'>): ProposedFileChrome {
  const label = proposedFileLabel(file.path);
  const description = file.op === 'create' ? 'Added' : file.op === 'delete' ? 'Deleted' : 'Modified';
  return {
    label,
    description,
    contextValue: 'proposedFile',
    command: 'botrider.review.openDiff',
    resourcePath: label,
    decoration: file.op === 'create' ? proposedCreateDecoration() : undefined,
  };
}

export function proposedCreateDecoration(): { badge: 'A'; tooltip: 'Added' } {
  return { badge: 'A', tooltip: 'Added' };
}

export function proposedResourcePath(path: string): string {
  return '/' + proposedFileLabel(path);
}

/** Office proposed text is the inspect line — never zip/XML. */
export function proposedDocumentText(
  path: string,
  stored: string | undefined,
  opts?: { empty?: boolean },
): string {
  if (opts?.empty) {
    return '';
  }
  if (inferChangeKind({ path: proposedFileLabel(path) }) === 'office-binary') {
    return officeInspectLine(path);
  }
  return stored ?? '';
}

export function officeInspectLine(path: string): string {
  const basename = proposedFileLabel(path).split('/').pop() ?? path;
  const format = formatFromExtension(path);
  const label = (format && officeLabel(format)) ?? 'Word';
  return COPY.officeInspect(basename, label);
}

export function htmlPreviewDocument(html: string): string {
  const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'`;
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1><meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    }
    return html.replace(/<html([^>]*)>/i, `<html$1><head><meta http-equiv="Content-Security-Policy" content="${csp}" /></head>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="${csp}" /><title>Proposed</title></head><body>${html}</body></html>`;
}
