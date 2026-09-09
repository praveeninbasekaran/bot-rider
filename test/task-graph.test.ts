import { describe, expect, it } from 'vitest';
import {
  parseTaskGraph,
  TaskGraphScheduler,
  validateTaskGraph,
  type TaskNodeInput,
} from '../src/app/task-graph';

const workers = [
  { id: 'architect-id', handle: 'architect', active: true },
  { id: 'coder-id', handle: 'coder', active: true },
  { id: 'qa-id', handle: 'qa', active: true },
];

const validTasks: TaskNodeInput[] = [
  {
    id: 'architecture',
    owner: 'architect',
    kind: 'architecture',
    dependsOn: [],
    requiredArtifacts: ['spec'],
    producesArtifacts: ['architecture'],
    paths: ['docs/architecture.md'],
    maxRetries: 0,
  },
  {
    id: 'implementation',
    owner: 'coder',
    kind: 'implementation',
    dependsOn: ['architecture'],
    requiredArtifacts: ['spec', 'architecture'],
    producesArtifacts: ['implementation'],
    paths: ['src/feature.ts'],
    maxRetries: 1,
  },
  {
    id: 'qa',
    owner: 'qa',
    kind: 'qa',
    dependsOn: ['implementation'],
    requiredArtifacts: ['implementation'],
    producesArtifacts: ['qa-report'],
    paths: ['test/feature.test.ts'],
    maxRetries: 0,
  },
];

function validate(tasks: TaskNodeInput[]) {
  return validateTaskGraph({
    tasks,
    workers,
    workspaceRoot: 'D:\\workspace',
    availableArtifacts: ['spec'],
  });
}

describe('PU-4 typed task dependency graph', () => {
  it('parses the typed Dispatcher contract', () => {
    const parsed = parseTaskGraph(`\`\`\`json\n${JSON.stringify({ tasks: validTasks })}\n\`\`\``);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tasks[0]).toMatchObject({ id: 'architecture', owner: 'architect' });
  });

  it('rejects unknown owners, cycles, missing artifacts, and unsafe phases', () => {
    expect(validate([{ ...validTasks[0]!, owner: 'missing' }])).toMatchObject({
      ok: false,
      reason: 'unknown handle',
    });
    expect(validate([
      { ...validTasks[0]!, dependsOn: ['implementation'] },
      { ...validTasks[1]!, dependsOn: ['architecture'] },
    ])).toMatchObject({ ok: false, reason: 'dependency cycle' });
    expect(validate([{ ...validTasks[1]!, dependsOn: [], requiredArtifacts: ['spec', 'missing'] }]))
      .toMatchObject({ ok: false, reason: 'missing required artifact missing' });
    expect(validate([{ ...validTasks[1]!, dependsOn: [], requiredArtifacts: [] }]))
      .toMatchObject({ ok: false, reason: 'implementation requires spec' });
  });

  it('rejects unordered overlapping claims but permits dependency-ordered reuse', () => {
    const sibling = {
      ...validTasks[1]!,
      id: 'implementation-b',
      owner: 'architect',
      dependsOn: [],
      requiredArtifacts: ['spec'],
    };
    expect(validate([{ ...validTasks[1]!, dependsOn: [], requiredArtifacts: ['spec'] }, sibling]))
      .toMatchObject({ ok: false, reason: 'parallel path overlap' });
    expect(validate([
      { ...validTasks[1]!, dependsOn: [], requiredArtifacts: ['spec'] },
      { ...sibling, dependsOn: ['implementation'] },
    ])).toMatchObject({ ok: true });
  });

  it('runs only ready work and advances architecture, implementation, then QA', () => {
    const validated = validate(validTasks);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const scheduler = new TaskGraphScheduler(validated.tasks, ['spec']);
    expect(scheduler.nextWave().map((task) => task.id)).toEqual(['architecture']);
    scheduler.start(['architecture']);
    scheduler.complete('architecture');
    expect(scheduler.nextWave().map((task) => task.id)).toEqual(['implementation']);
    scheduler.start(['implementation']);
    scheduler.complete('implementation');
    expect(scheduler.nextWave().map((task) => task.id)).toEqual(['qa']);
  });

  it('forms safe parallel waves, exposes blockers, retries once, and settles dependents', () => {
    const parallel = [
      { ...validTasks[1]!, id: 'a', dependsOn: [], requiredArtifacts: ['spec'], maxRetries: 1 },
      {
        ...validTasks[1]!,
        id: 'b',
        owner: 'architect',
        paths: ['src/b.ts'],
        dependsOn: [],
        requiredArtifacts: ['spec'],
      },
    ];
    const validated = validate(parallel);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const scheduler = new TaskGraphScheduler(validated.tasks, ['spec']);
    expect(scheduler.nextWave().map((task) => task.id)).toEqual(['a', 'b']);
    scheduler.start(['a', 'b']);
    scheduler.fail('a', 'rate limited');
    scheduler.complete('b');
    expect(scheduler.snapshot().find((task) => task.id === 'a')).toMatchObject({
      readiness: 'ready',
      retry: { attempt: 1, max: 1 },
      outcome: null,
    });
    scheduler.start(['a']);
    scheduler.fail('a', 'invalid output');
    expect(scheduler.snapshot().find((task) => task.id === 'a')).toMatchObject({
      readiness: 'settled',
      outcome: 'failed',
      blockedBy: ['invalid output'],
    });
  });
});
