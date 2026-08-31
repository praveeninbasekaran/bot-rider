import type { ChangeFile, ChangePreviewKind, FileOp } from '../domain/changeset';
import { inferChangeKind } from '../domain/changeset';
import { formatFromExtension, officeLabel } from '../domain/deliverable';
import { COPY } from './copy';

export type ProposedOpenPlan =
  | { mode: 'text-diff'; path: string; op: FileOp }
  | { mode: 'html-preview'; title: string; html: string }
  | { mode: 'office-inspect'; message: string };

export function resolveProposedOpen(file: ChangeFile): ProposedOpenPlan {
  const kind = inferChangeKind(file);
  const basename = file.path.replace(/\\/g, '/').split('/').pop() ?? file.path;
  if (kind === 'html-preview') {
    return {
      mode: 'html-preview',
      title: COPY.htmlPreviewTitle(basename),
      html: file.content ?? '',
    };
  }
  if (kind === 'office-binary') {
    const format = formatFromExtension(file.path);
    const label = (format && officeLabel(format)) ?? 'Word';
    return {
      mode: 'office-inspect',
      message: COPY.officeInspect(basename, label),
    };
  }
  return { mode: 'text-diff', path: file.path, op: file.op };
}

export function previewKindFor(file: ChangeFile): ChangePreviewKind {
  return inferChangeKind(file);
}
