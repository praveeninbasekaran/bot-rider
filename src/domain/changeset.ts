export type FileOp = 'create' | 'update' | 'delete';

export interface ChangeFile {
  path: string;
  op: FileOp;
  content?: string;
}

export interface Changeset {
  files: ChangeFile[];
}

export type ApplyMode = 'initial' | 'retry';

export type FileEditOp =
  | { type: 'create'; relativePath: string; content: string; overwrite: boolean }
  | { type: 'replace'; relativePath: string; content: string }
  | { type: 'delete'; relativePath: string; ignoreIfNotExists: boolean };

export const APPLY_FAILED_MESSAGE =
  'Apply did not complete. New files created before the failure may already exist on disk, and deleted files may already be gone. Bot Rider cannot roll those back. Retry to finish the rest, or Reject to drop remaining edits (leftover new files stay; already-deleted files stay deleted).';

export interface ProposedFileDto {
  path: string;
  op: FileOp;
}
