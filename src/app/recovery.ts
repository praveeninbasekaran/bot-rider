import type { ChangeFile } from '../domain/changeset';
import type { RunStateDto } from '../domain/run-state';
import type { ThreadSnapshot } from './thread-store';
import type { TaskNode } from './task-graph';
import type { McpStagedAction } from './mcp-action-store';
import type { StateStore } from './ports';

export const RECOVERY_STATE_KEY = 'botrider.workspaceRecovery.v1';
export const RECOVERY_VERSION = 1;

interface StoredChangeFile extends Omit<ChangeFile, 'binary'> {
  binary?: number[];
}

export interface WorkspaceRecoverySnapshot {
  version: 1;
  savedAt: string;
  runId?: string;
  userText?: string;
  run: RunStateDto;
  thread: ThreadSnapshot;
  tasks: TaskNode[];
  pendingFiles: StoredChangeFile[];
  pendingMcpActions: McpStagedAction[];
}

export type RecoveryRead =
  | { ok: true; snapshot: WorkspaceRecoverySnapshot }
  | { ok: false; reason: 'missing' | 'unsupported' };

export class WorkspaceRecoveryStore {
  private pending: WorkspaceRecoverySnapshot | undefined;

  constructor(private readonly store: StateStore) {
    const read = this.read();
    this.pending = read.ok ? read.snapshot : undefined;
  }

  read(): RecoveryRead {
    const raw = this.store.get<unknown>(RECOVERY_STATE_KEY);
    if (!raw) {
      return { ok: false, reason: 'missing' };
    }
    const migrated = migrateRecoverySnapshot(raw);
    return migrated ? { ok: true, snapshot: migrated } : { ok: false, reason: 'unsupported' };
  }

  offered(): WorkspaceRecoverySnapshot | undefined {
    return this.pending ? cloneSnapshot(this.pending) : undefined;
  }

  async save(snapshot: WorkspaceRecoverySnapshot): Promise<void> {
    if (this.pending) {
      return;
    }
    await this.store.update(RECOVERY_STATE_KEY, cloneSnapshot(snapshot));
  }

  async resolve(): Promise<void> {
    this.pending = undefined;
    await this.store.update(RECOVERY_STATE_KEY, undefined);
  }

  async discard(): Promise<void> {
    await this.resolve();
  }
}

export function serializeChangeFiles(files: readonly ChangeFile[]): StoredChangeFile[] {
  return files.map((file) => ({
    ...file,
    specIds: file.specIds?.slice(),
    binary: file.binary ? [...file.binary] : undefined,
  }));
}

export function deserializeChangeFiles(files: readonly StoredChangeFile[]): ChangeFile[] {
  return files.map((file) => ({
    ...file,
    specIds: file.specIds?.slice(),
    binary: file.binary ? Uint8Array.from(file.binary) : undefined,
  }));
}

export function migrateRecoverySnapshot(raw: unknown): WorkspaceRecoverySnapshot | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const value = raw as Partial<WorkspaceRecoverySnapshot> & { version?: number };
  if (value.version !== RECOVERY_VERSION || !value.run || !value.thread) {
    return undefined;
  }
  return cloneSnapshot({
    version: 1,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : new Date(0).toISOString(),
    runId: value.runId,
    userText: value.userText,
    run: value.run,
    thread: value.thread,
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    pendingFiles: Array.isArray(value.pendingFiles) ? value.pendingFiles : [],
    pendingMcpActions: Array.isArray(value.pendingMcpActions) ? value.pendingMcpActions : [],
  });
}

function cloneSnapshot(snapshot: WorkspaceRecoverySnapshot): WorkspaceRecoverySnapshot {
  return structuredClone(snapshot);
}
