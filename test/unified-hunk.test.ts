import { describe, expect, it } from 'vitest';
import { applyUnifiedPatch, parseUnifiedPatch, sourceHash } from '../src/app/unified-hunk';

const patch = [
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,3 +1,4 @@',
  ' one',
  '-two',
  '+second',
  '+two-and-half',
  ' three',
].join('\n');

describe('EDIT-1 unified hunk parsing', () => {
  it('parses and applies exact multi-line hunks', () => {
    expect(parseUnifiedPatch(patch)).toMatchObject({
      ok: true,
      oldPath: 'src/app.ts',
      newPath: 'src/app.ts',
    });
    expect(applyUnifiedPatch('one\ntwo\nthree\n', patch)).toEqual({
      ok: true,
      text: 'one\nsecond\ntwo-and-half\nthree\n',
    });
  });

  it('rejects malformed counts and mismatched context', () => {
    expect(parseUnifiedPatch(patch.replace('@@ -1,3 +1,4 @@', '@@ -1,2 +1,4 @@')).ok).toBe(false);
    expect(applyUnifiedPatch('one\nchanged\nthree\n', patch)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('mismatch'),
    });
  });

  it('normalizes newlines before hashing', () => {
    expect(sourceHash('one\r\ntwo\r\n')).toBe(sourceHash('one\ntwo\n'));
  });
});
