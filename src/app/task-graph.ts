import type { BotRecord } from '../domain/bot';
import { validateRelativePath } from './patch-parser';
import type { SchedulerEventEnvelope } from './event-bus';

export type TaskKind = 'architecture' | 'implementation' | 'qa' | 'documentation';
export type TaskReadiness = 'blocked' | 'ready' | 'running' | 'settled';
export type TaskOutcome = 'completed' | 'failed' | 'cancelled' | 'skipped';

export interface TaskNodeInput {
  id: string;
  owner: string;
  kind: TaskKind;
  dependsOn: string[];
  requiredArtifacts: string[];
  producesArtifacts: string[];
  paths: string[];
  maxRetries?: number;
}

export interface TaskNode extends TaskNodeInput {
  ownerId: string;
  readiness: TaskReadiness;
  retry: { attempt: number; max: number };
  outcome: TaskOutcome | null;
  blockedBy: string[];
}

export type TaskGraphParse =
  | { ok: true; tasks: TaskNodeInput[] }
  | { ok: false; reason: string };

export type TaskGraphValidate =
  | { ok: true; tasks: TaskNode[] }
  | { ok: false; reason: string };

const TASK_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const TASK_KINDS = new Set<TaskKind>(['architecture', 'implementation', 'qa', 'documentation']);

export function parseTaskGraph(text: string): TaskGraphParse {
  const candidates = [...text.matchAll(/```(?:json)?\s*\r?\n([\s\S]*?)```/gi)].map((match) => match[1] ?? '');
  candidates.push(text);
  for (const candidate of candidates) {
    try {
      const raw = JSON.parse(candidate.trim()) as { tasks?: unknown };
      if (!Array.isArray(raw?.tasks)) {
        continue;
      }
      const tasks: TaskNodeInput[] = [];
      for (const item of raw.tasks) {
        if (!item || typeof item !== 'object') {
          return { ok: false, reason: 'invalid task' };
        }
        const task = item as Record<string, unknown>;
        const dependsOn = strings(task.dependsOn);
        const requiredArtifacts = strings(task.requiredArtifacts);
        const producesArtifacts = strings(task.producesArtifacts);
        const paths = strings(task.paths);
        if (
          typeof task.id !== 'string' ||
          typeof task.owner !== 'string' ||
          typeof task.kind !== 'string' ||
          !TASK_KINDS.has(task.kind as TaskKind) ||
          !dependsOn ||
          !requiredArtifacts ||
          !producesArtifacts ||
          !paths
        ) {
          return { ok: false, reason: 'invalid task' };
        }
        tasks.push({
          id: task.id.trim(),
          owner: task.owner.replace(/^@/, '').trim(),
          kind: task.kind as TaskKind,
          dependsOn,
          requiredArtifacts,
          producesArtifacts,
          paths,
          maxRetries:
            typeof task.maxRetries === 'number' && Number.isInteger(task.maxRetries)
              ? task.maxRetries
              : 0,
        });
      }
      return tasks.length ? { ok: true, tasks } : { ok: false, reason: 'empty task graph' };
    } catch {
      // Try the next fenced candidate.
    }
  }
  return { ok: false, reason: 'no task graph json' };
}

export function validateTaskGraph(args: {
  tasks: readonly TaskNodeInput[];
  workers: readonly Pick<BotRecord, 'id' | 'handle' | 'active'>[];
  workspaceRoot: string;
  availableArtifacts?: readonly string[];
}): TaskGraphValidate {
  const workers = new Map(
    args.workers.filter((bot) => bot.active).map((bot) => [bot.handle.toLowerCase(), bot]),
  );
  const ids = new Set<string>();
  for (const task of args.tasks) {
    if (!TASK_ID.test(task.id) || ids.has(task.id)) {
      return { ok: false, reason: ids.has(task.id) ? 'duplicate task id' : 'invalid task id' };
    }
    ids.add(task.id);
  }
  const byId = new Map(args.tasks.map((task) => [task.id, task]));
  for (const task of args.tasks) {
    if (!workers.has(task.owner.toLowerCase())) {
      return { ok: false, reason: 'unknown handle' };
    }
    if (task.dependsOn.some((id) => !byId.has(id))) {
      return { ok: false, reason: 'unknown dependency' };
    }
  }
  if (hasCycle(args.tasks)) {
    return { ok: false, reason: 'dependency cycle' };
  }

  const normalizedPaths = new Map<string, string[]>();
  for (const task of args.tasks) {
    const paths: string[] = [];
    for (const raw of task.paths) {
      const checked = validateRelativePath(raw, args.workspaceRoot);
      if (!checked.ok) {
        return { ok: false, reason: checked.reason };
      }
      paths.push(checked.relative);
    }
    normalizedPaths.set(task.id, paths);
  }

  const available = new Set(args.availableArtifacts ?? []);
  const producers = new Map<string, TaskNodeInput[]>();
  for (const task of args.tasks) {
    for (const artifact of task.producesArtifacts) {
      const list = producers.get(artifact) ?? [];
      list.push(task);
      producers.set(artifact, list);
    }
  }
  for (const task of args.tasks) {
    if (task.kind === 'implementation' && !task.requiredArtifacts.includes('spec')) {
      return { ok: false, reason: 'implementation requires spec' };
    }
    if (task.kind === 'qa') {
      const implementationArtifact = task.requiredArtifacts.some((artifact) =>
        (producers.get(artifact) ?? []).some((producer) => producer.kind === 'implementation'),
      );
      if (!implementationArtifact) {
        return { ok: false, reason: 'qa requires implementation artifact' };
      }
    }
    const ancestors = dependencyAncestors(task.id, byId);
    for (const artifact of task.requiredArtifacts) {
      if (available.has(artifact)) {
        continue;
      }
      const validProducer = (producers.get(artifact) ?? []).some((producer) => ancestors.has(producer.id));
      if (!validProducer) {
        return { ok: false, reason: `missing required artifact ${artifact}` };
      }
    }
  }

  for (let left = 0; left < args.tasks.length; left++) {
    for (let right = left + 1; right < args.tasks.length; right++) {
      const a = args.tasks[left]!;
      const b = args.tasks[right]!;
      const ordered =
        dependencyAncestors(a.id, byId).has(b.id) || dependencyAncestors(b.id, byId).has(a.id);
      if (!ordered && normalizedPaths.get(a.id)!.some((path) => normalizedPaths.get(b.id)!.includes(path))) {
        return { ok: false, reason: 'parallel path overlap' };
      }
    }
  }

  const tasks = args.tasks.map((task) => {
    const worker = workers.get(task.owner.toLowerCase())!;
    return {
      ...task,
      owner: worker.handle,
      ownerId: worker.id,
      paths: normalizedPaths.get(task.id)!,
      readiness: 'blocked' as const,
      retry: { attempt: 0, max: Math.max(0, Math.min(3, task.maxRetries ?? 0)) },
      outcome: null,
      blockedBy: [],
    };
  });
  const scheduler = new TaskGraphScheduler(tasks, args.availableArtifacts);
  return { ok: true, tasks: scheduler.snapshot() };
}

export class TaskGraphScheduler {
  private readonly tasks: TaskNode[];
  private readonly artifacts: Set<string>;

  constructor(tasks: readonly TaskNode[], availableArtifacts: readonly string[] = []) {
    this.tasks = tasks.map((task) => ({
      ...task,
      dependsOn: [...task.dependsOn],
      requiredArtifacts: [...task.requiredArtifacts],
      producesArtifacts: [...task.producesArtifacts],
      paths: [...task.paths],
      retry: { ...task.retry },
      blockedBy: [...task.blockedBy],
    }));
    this.artifacts = new Set(availableArtifacts);
    this.refresh();
  }

  snapshot(): TaskNode[] {
    return this.tasks.map((task) => ({
      ...task,
      dependsOn: [...task.dependsOn],
      requiredArtifacts: [...task.requiredArtifacts],
      producesArtifacts: [...task.producesArtifacts],
      paths: [...task.paths],
      retry: { ...task.retry },
      blockedBy: [...task.blockedBy],
    }));
  }

  nextWave(): TaskNode[] {
    const ready = this.tasks
      .filter((task) => task.readiness === 'ready')
      .sort((a, b) => a.id.localeCompare(b.id));
    const wave: TaskNode[] = [];
    const owners = new Set<string>();
    const paths = new Set<string>();
    for (const task of ready) {
      if (owners.has(task.ownerId) || task.paths.some((path) => paths.has(path))) {
        continue;
      }
      wave.push(task);
      owners.add(task.ownerId);
      task.paths.forEach((path) => paths.add(path));
    }
    return wave.map((task) => ({ ...task, retry: { ...task.retry }, blockedBy: [...task.blockedBy] }));
  }

  start(ids: readonly string[]): void {
    for (const task of this.tasks) {
      if (ids.includes(task.id) && task.readiness === 'ready') {
        task.readiness = 'running';
        task.blockedBy = [];
      }
    }
  }

  complete(id: string): void {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) return;
    task.readiness = 'settled';
    task.outcome = 'completed';
    task.producesArtifacts.forEach((artifact) => this.artifacts.add(artifact));
    this.refresh();
  }

  consume(event: SchedulerEventEnvelope): void {
    if (event.type === 'SPEC_PUBLISHED') {
      this.artifacts.add(event.artifact);
      this.refresh();
      return;
    }
    if (event.type === 'ARCHITECTURE_READY') {
      event.artifacts.forEach((artifact) => this.artifacts.add(artifact));
      this.refresh();
      return;
    }
    if (event.type === 'TASK_COMPLETED') {
      const task = this.tasks.find((item) => item.id === event.taskId);
      if (!task) return;
      event.artifacts.forEach((artifact) => this.artifacts.add(artifact));
      task.readiness = 'settled';
      task.outcome = 'completed';
      task.blockedBy = [];
      this.refresh();
      return;
    }
    if (event.type === 'TASK_FAILED') {
      this.fail(event.taskId, event.reason);
    }
  }

  fail(id: string, reason: string): void {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) return;
    task.retry.attempt += 1;
    if (task.retry.attempt <= task.retry.max) {
      task.readiness = 'blocked';
      task.blockedBy = [`retry ${task.retry.attempt}/${task.retry.max}: ${reason}`];
      this.refresh();
      return;
    }
    task.readiness = 'settled';
    task.outcome = 'failed';
    task.blockedBy = [reason];
    this.refresh();
  }

  cancelRemaining(): void {
    for (const task of this.tasks) {
      if (task.readiness !== 'settled') {
        task.readiness = 'settled';
        task.outcome = 'cancelled';
        task.blockedBy = ['run cancelled'];
      }
    }
  }

  isSettled(): boolean {
    return this.tasks.every((task) => task.readiness === 'settled');
  }

  private refresh(): void {
    const byId = new Map(this.tasks.map((task) => [task.id, task]));
    for (const task of this.tasks) {
      if (task.readiness === 'running' || task.readiness === 'settled') {
        continue;
      }
      const blockers: string[] = [];
      let terminalDependency = false;
      for (const dependency of task.dependsOn) {
        const dep = byId.get(dependency);
        if (dep?.outcome === 'failed' || dep?.outcome === 'cancelled' || dep?.outcome === 'skipped') {
          blockers.push(`${dependency} did not complete`);
          terminalDependency = true;
        } else if (dep?.outcome !== 'completed') {
          blockers.push(`waiting for ${dependency}`);
        }
      }
      if (terminalDependency) {
        task.readiness = 'settled';
        task.outcome = 'skipped';
        task.blockedBy = blockers;
        continue;
      }
      for (const artifact of task.requiredArtifacts) {
        if (!this.artifacts.has(artifact)) {
          blockers.push(`waiting for artifact ${artifact}`);
        }
      }
      task.blockedBy = blockers;
      task.readiness = blockers.length ? 'blocked' : 'ready';
    }
  }
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    return undefined;
  }
  return value.map((item) => String(item).trim());
}

function hasCycle(tasks: readonly TaskNodeInput[]): boolean {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return tasks.some((task) => visit(task.id));
}

function dependencyAncestors(id: string, byId: ReadonlyMap<string, TaskNodeInput>): Set<string> {
  const out = new Set<string>();
  const visit = (taskId: string): void => {
    for (const dependency of byId.get(taskId)?.dependsOn ?? []) {
      if (!out.has(dependency)) {
        out.add(dependency);
        visit(dependency);
      }
    }
  };
  visit(id);
  return out;
}
