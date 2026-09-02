import { describe, expect, it } from 'vitest';
import { PatchParser, dropFileBodies, validateRelativePath } from '../src/app/patch-parser';

const root = '/tmp/bot-rider-ws';

describe('PatchParser', () => {
  const parser = new PatchParser();

  it('parses create/update/delete in memory', () => {
    const text = [
      'Here you go',
      '```json',
      JSON.stringify({
        files: [
          { path: 'src/new.ts', op: 'create', content: 'export {}' },
          { path: 'src/app.ts', op: 'update', content: 'export const n = 2;' },
          { path: 'src/gone.ts', op: 'delete' },
        ],
      }),
      '```',
    ].join('\n');
    const result = parser.parseImplementer(text, root);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files).toEqual([
        { path: 'src/new.ts', op: 'create', content: 'export {}' },
        { path: 'src/app.ts', op: 'update', content: 'export const n = 2;' },
        { path: 'src/gone.ts', op: 'delete' },
      ]);
    }
  });

  it('keeps catalog specIds and exact content tokens; drops unknown without failing parse', () => {
    const catalog = [
      { id: 'EX-1', body: 'export spec' },
      { id: 'BR-6', body: 'gated edit' },
    ];
    const text = [
      '```json',
      JSON.stringify({
        files: [
          {
            path: 'src/a.ts',
            op: 'create',
            content: 'cite BR-6 here, not BR-60',
            specIds: ['EX-1', 'NOPE', 'BR-6', 'EX-1'],
          },
          { path: 'src/gone.ts', op: 'delete', specIds: ['BR-6', 'F3-1'] },
        ],
      }),
      '```',
    ].join('\n');
    const result = parser.parseImplementer(text, root, catalog);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0]?.specIds).toEqual(['EX-1', 'BR-6']);
      expect(result.files[1]?.specIds).toEqual(['BR-6']);
    }
  });

  it('drops file bodies on debate text', () => {
    const raw = 'proposal:\n```ts\nfunction secret() { return 1 }\n```\ndone';
    expect(dropFileBodies(raw)).toBe('proposal:\n```ts\n```\ndone');
    expect(parser.sanitizeDebate(raw)).not.toContain('function secret');
  });

  it('rejects path traversal, absolute-outside, and .git paths', () => {
    expect(validateRelativePath('../secret', root).ok).toBe(false);
    expect(validateRelativePath('/etc/passwd', root).ok).toBe(false);
    expect(validateRelativePath('.git/config', root).ok).toBe(false);
    expect(validateRelativePath('src/.git/hooks', root).ok).toBe(false);
    expect(validateRelativePath('src/app.ts', root).ok).toBe(true);
    expect(validateRelativePath('.gitignore', root).ok).toBe(true);

    const traversal = parser.parseImplementer(
      '```json\n{"files":[{"path":"../x","op":"create","content":"z"}]}\n```',
      root,
    );
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) {
      expect(traversal.code).toBe('validate-failed');
    }
  });

  it('invalid op is validate-failed', () => {
    const result = parser.parseImplementer(
      '```json\n{"files":[{"path":"a.ts","op":"merge","content":"z"}]}\n```',
      root,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('validate-failed');
    }
  });

  it('missing files[] is parse-failed', () => {
    const result = parser.parseImplementer('```\n{"nope":true}\n```', root);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('parse-failed');
    }
  });
});
