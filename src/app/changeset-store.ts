import {
  APPLY_FAILED_MESSAGE,
  type ApplyMode,
  type ChangeFile,
  type FileEditOp,
} from '../domain/changeset';
import type { HostToUi } from '../protocol/messages';
import { filesToPreview } from '../protocol/messages';
import type { ApplyEditPort, DiffCloser, FileSystemPort, ProposedDocHost } from './ports';

export class ChangesetStore {
  private pending: ChangeFile[] | undefined;
  leftoverCreates: string[] = [];
  leftoverDeletes: string[] = [];
  applyFailed = false;

  constructor(
    private readonly applyPort: ApplyEditPort,
    private readonly fs: FileSystemPort,
    private readonly emit: (msg: HostToUi) => void,
    private readonly docs?: ProposedDocHost,
    private readonly diffs?: DiffCloser,
  ) {}

  get files(): ChangeFile[] | undefined {
    return this.pending ? this.pending.map((f) => ({ ...f })) : undefined;
  }

  hasPending(): boolean {
    return !!this.pending;
  }

  setPending(files: ChangeFile[]): void {
    this.pending = files.map((f) => ({ ...f }));
    this.applyFailed = false;
    this.leftoverCreates = [];
    this.leftoverDeletes = [];
    this.docs?.clearProposed();
    for (const f of this.pending) {
      this.docs?.setProposed(f.path, f.op === 'delete' ? '' : (f.content ?? ''));
    }
    this.emit({ type: 'changeset/preview', files: filesToPreview(this.pending) });
  }

  /**
   * Architecture table:
   * | op     | initial                         | retry                                      |
   * | create | createFile, overwrite false     | createFile overwrite true (replace leftover)|
   * | update | replace full document           | replace full document                      |
   * | delete | deleteFile                      | skip if already gone; else ignoreIfNotExists|
   */
  buildEdit(mode: ApplyMode): FileEditOp[] {
    if (!this.pending) {
      return [];
    }
    const ops: FileEditOp[] = [];
    for (const file of this.pending) {
      if (file.op === 'create') {
        ops.push({
          type: 'create',
          relativePath: file.path,
          content: file.content ?? '',
          overwrite: mode === 'retry',
        });
      } else if (file.op === 'update') {
        ops.push({
          type: 'replace',
          relativePath: file.path,
          content: file.content ?? '',
        });
      } else if (file.op === 'delete') {
        if (mode === 'retry' && this.leftoverDeletes.includes(file.path)) {
          continue;
        }
        ops.push({
          type: 'delete',
          relativePath: file.path,
          ignoreIfNotExists: mode === 'retry',
        });
      }
    }
    return ops;
  }

  async approve(mode: ApplyMode = 'initial'): Promise<boolean> {
    if (!this.pending) {
      return false;
    }
    const ops = this.buildEdit(mode);
    const ok = await this.applyPort.applyEdit(ops);
    if (ok) {
      await this.clearSucceeded();
      return true;
    }
    this.applyFailed = true;
    await this.refreshLeftovers();
    this.emit({
      type: 'changeset/apply-failed',
      leftoverCreates: [...this.leftoverCreates],
      leftoverDeletes: [...this.leftoverDeletes],
      message: APPLY_FAILED_MESSAGE,
    });
    return false;
  }

  async reject(): Promise<void> {
    this.pending = undefined;
    this.applyFailed = false;
    this.leftoverCreates = [];
    this.leftoverDeletes = [];
    this.docs?.clearProposed();
    await this.diffs?.closeProposedDiffs();
    this.emit({ type: 'changeset/cleared' });
  }

  private async clearSucceeded(): Promise<void> {
    this.pending = undefined;
    this.applyFailed = false;
    this.leftoverCreates = [];
    this.leftoverDeletes = [];
    this.docs?.clearProposed();
    await this.diffs?.closeProposedDiffs();
    this.emit({ type: 'changeset/cleared' });
  }

  private async refreshLeftovers(): Promise<void> {
    this.leftoverCreates = [];
    this.leftoverDeletes = [];
    if (!this.pending) {
      return;
    }
    for (const file of this.pending) {
      const exists = await this.fs.exists(file.path);
      if (file.op === 'create' && exists) {
        this.leftoverCreates.push(file.path);
      }
      if (file.op === 'delete' && !exists) {
        this.leftoverDeletes.push(file.path);
      }
    }
  }
}
