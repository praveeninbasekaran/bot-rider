import { describe, expect, it } from 'vitest';
import { RepositoryContextService, type RepositoryContextPort } from '../src/app/repository-context';

class FixtureRepository implements RepositoryContextPort {
  constructor(private readonly files: Record<string, string>) {}
  async listFiles(): Promise<string[]> {
    return Object.keys(this.files);
  }
  async readText(path: string): Promise<string | undefined> {
    return this.files[path];
  }
}

describe('CTX-1–3 local repository context', () => {
  it('indexes files, symbols, imports, calls, Markdown, and requirement links', async () => {
    const service = new RepositoryContextService(new FixtureRepository({
      'src/a.ts': "import { work } from './b';\nexport function start() { return work(); }",
      'src/b.ts': 'export function work() { return 1; }',
      'docs/requirements.md': '# Worker behavior\nPU-4 requires dependency-ready work.',
      'node_modules/ignored.ts': 'export const ignored = true;',
    }));
    await service.rebuild();
    const graph = service.snapshot();
    expect(graph.nodes.some((node) => node.id === 'file:src/a.ts')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'symbol:src/b.ts:work')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'requirement:PU-4')).toBe(true);
    expect(graph.edges).toContainEqual({ from: 'file:src/a.ts', to: 'file:src/b.ts', kind: 'imports' });
    expect(graph.edges).toContainEqual({ from: 'file:src/a.ts', to: 'symbol:src/b.ts:work', kind: 'calls' });
    expect(graph.nodes.some((node) => node.path.includes('node_modules'))).toBe(false);
  });

  it('retrieves task-relevant local passages under a deterministic budget', async () => {
    const service = new RepositoryContextService(new FixtureRepository({
      'src/task.ts': 'export function dependencyScheduler() {}',
      'docs/task.md': '# Scheduling\nDependency-ready tasks wait for required artifacts. '.repeat(8),
    }));
    await service.rebuild();
    const context = service.buildContext({
      query: 'dependency scheduler required artifacts',
      paths: ['src/task.ts'],
      maxChars: 180,
    });
    expect(context.text).toContain('Repository context (local index):');
    expect(context.nodeIds).toContain('file:src/task.ts');
    expect(context.includedChars).toBeLessThanOrEqual(180);
    expect(context.dropped.length).toBeGreaterThan(0);
  });

  it('links task and proposed files to code nodes', async () => {
    const service = new RepositoryContextService(new FixtureRepository({ 'src/a.ts': 'export const a = 1;' }));
    await service.rebuild();
    expect(service.linksFor({
      taskId: 'implement-a',
      taskPaths: ['src/a.ts'],
      proposedPaths: ['src/a.ts'],
    })).toEqual(expect.arrayContaining([
      { from: 'task:implement-a', to: 'file:src/a.ts', kind: 'task' },
      { from: 'proposal:src/a.ts', to: 'file:src/a.ts', kind: 'proposes' },
    ]));
  });
});
