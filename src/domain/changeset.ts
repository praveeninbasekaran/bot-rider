export type FileOp = 'create' | 'update' | 'delete';

export type ChangePreviewKind = 'html-preview' | 'office-binary' | 'text';

export interface ChangeFile {
  path: string;
  op: FileOp;
  content?: string;
  binary?: Uint8Array;
  kind?: ChangePreviewKind;
  /** Surviving catalog ids (OS-2). Omit when empty. */
  specIds?: string[];
}

export interface Changeset {
  files: ChangeFile[];
}

export type ApplyMode = 'initial' | 'retry';

export type FileEditOp =
  | { type: 'create'; relativePath: string; content: string; overwrite: boolean; binary?: Uint8Array }
  | { type: 'replace'; relativePath: string; content: string }
  | { type: 'delete'; relativePath: string; ignoreIfNotExists: boolean };

export function inferChangeKind(file: Pick<ChangeFile, 'path' | 'kind'>): ChangePreviewKind {
  if (file.kind) {
    return file.kind;
  }
  const lower = file.path.replace(/\\/g, '/').toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'html-preview';
  }
  if (lower.endsWith('.docx') || lower.endsWith('.xlsx') || lower.endsWith('.pptx')) {
    return 'office-binary';
  }
  return 'text';
}

export const APPLY_FAILED_MESSAGE =
  'Apply did not complete. New files created before the failure may already exist on disk, and deleted files may already be gone. Bot Rider cannot roll those back. Retry to finish the rest, or Reject to drop remaining edits (leftover new files stay; already-deleted files stay deleted).';

export interface ProposedFileDto {
  path: string;
  op: FileOp;
  kind?: ChangePreviewKind;
  /** Catalog ids as stored, surviving OS-2. Omit when empty. */
  specIds?: string[];
}
