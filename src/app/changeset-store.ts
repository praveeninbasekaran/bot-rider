import {
  APPLY_FAILED_MESSAGE,
  type ApplyMode,
  type ChangeFile,
  type FileEditOp,
} from '../domain/changeset';
import type { HostToUi } from '../protocol/messages';
import { filesToPreview } from '../protocol/messages';
import type { ApplyEditPort, DiffCloser, FileSystemPort, ProposedDocHost } from './ports';
import { applyUnifiedPatch, MISSING_SOURCE_HASH, sourceHash } from './unified-hunk';

export class ChangesetStore {
  private pending: ChangeFile[] | undefined;
  leftoverCreates: string[] = [];
  leftoverDeletes: string[] = [];
  applyFailed = false;
  /** Visible remainder during Argue; Approve stays off until collisions resolve. */
  private holdApprove = false;

  constructor(
    private readonly applyPort: ApplyEditPort,
    private readonly fs: FileSystemPort,
    private readonly emit: (msg: HostToUi) => void,
    private readonly docs?: ProposedDocHost,
    private readonly diffs?: DiffCloser,
  ) {}

  get files(): ChangeFile[] | undefined {
    return this.pending
      ? this.pending.map((f) => ({
          ...f,
          binary: f.binary ? new Uint8Array(f.binary) : undefined,
        }))
      : undefined;
  }

  hasPending(): boolean {
    return !!this.pending && this.pending.some((file) => file.included !== false) && !this.holdApprove;
  }

  setPending(files: ChangeFile[], opts?: { holdApprove?: boolean }): void {
    this.pending = files.map((file) => ({
      ...file,
      included: file.included !== false,
      binary: file.binary ? new Uint8Array(file.binary) : undefined,
      specIds: file.specIds?.slice(),
    }));
    this.resetPendingState(opts);
  }

  async setPendingPrepared(files: ChangeFile[], opts?: { holdApprove?: boolean }): Promise<void> {
    this.pending = await Promise.all(files.map((file) => this.prepareFile(file)));
    this.resetPendingState(opts);
  }

  private resetPendingState(opts?: { holdApprove?: boolean }): void {
    this.holdApprove = opts?.holdApprove === true;
    this.applyFailed = false;
    this.leftoverCreates = [];
    this.leftoverDeletes = [];
    this.refreshPreview();
  }

  setIncluded(path: string, included: boolean): void {
    const file = this.pending?.find((item) => item.path === path);
    if (!file) {
      return;
    }
    file.included = included;
    this.refreshPreview();
  }

  private async prepareFile(file: ChangeFile): Promise<ChangeFile> {
    const copy: ChangeFile = {
      ...file,
      included: file.included !== false,
      binary: file.binary ? new Uint8Array(file.binary) : undefined,
      specIds: file.specIds?.slice(),
    };
    const exists = await this.fs.exists(copy.path);
    const base = exists ? await this.fs.readText(copy.path) : undefined;
    const currentHash = exists ? sourceHash(base ?? '') : MISSING_SOURCE_HASH;
    if (copy.sourceHash && copy.sourceHash !== currentHash) {
      copy.stale = true;
    }
    copy.sourceHash = copy.sourceHash ?? currentHash;
    if (copy.op === 'update' && copy.patch && !copy.stale) {
      const applied = applyUnifiedPatch(base ?? '', copy.patch);
      if (applied.ok) {
        copy.content = applied.text;
      } else {
        copy.stale = true;
        copy.content = base ?? '';
      }
    }
    return copy;
  }

  private refreshPreview(): void {
    this.docs?.clearProposed();
    for (const file of this.pending ?? []) {
      if (file.included === false) {
        continue;
      }
      const proposed = file.op === 'delete' || file.binary ? '' : (file.content ?? '');
      this.docs?.setProposed(file.path, proposed);
    }
    this.emit({ type: 'changeset/preview', files: filesToPreview(this.pending ?? []) });
  }

  private async staleIncludedPaths(): Promise<string[]> {
    const stale: string[] = [];
    for (const file of this.pending ?? []) {
      if (file.included === false) {
        continue;
      }
      const exists = await this.fs.exists(file.path);
      const base = exists ? await this.fs.readText(file.path) : undefined;
      const currentHash = exists ? sourceHash(base ?? '') : MISSING_SOURCE_HASH;
      if (file.stale || (file.sourceHash && file.sourceHash !== currentHash)) {
        file.stale = true;
        stale.push(file.path);
      }
    }
    return stale;
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
      if (file.included === false || file.stale) {
        continue;
      }
      if (file.op === 'create') {
        ops.push({
          type: 'create',
          relativePath: file.path,
          content: file.content ?? '',
          overwrite: mode === 'retry',
          ...(file.binary ? { binary: file.binary } : {}),
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
    if (!this.hasPending()) {
      return false;
    }
    const stalePaths = await this.staleIncludedPaths();
    if (stalePaths.length > 0) {
      this.refreshPreview();
      this.emit({
        type: 'changeset/stale',
        paths: stalePaths,
        message: 'Workspace files changed after this patch was prepared. Regenerate the stale patches before applying.',
      });
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
    this.holdApprove = false;
    this.applyFailed = false;
    this.leftoverCreates = [];
    this.leftoverDeletes = [];
    this.docs?.clearProposed();
    await this.diffs?.closeProposedDiffs();
    this.emit({ type: 'changeset/cleared' });
  }

  private async clearSucceeded(): Promise<void> {
    this.pending = undefined;
    this.holdApprove = false;
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
