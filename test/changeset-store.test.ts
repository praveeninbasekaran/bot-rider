import { describe, expect, it } from 'vitest';
import { ChangesetStore } from '../src/app/changeset-store';
import { APPLY_FAILED_MESSAGE } from '../src/domain/changeset';
import { MemoryFs } from './fakes';
import type { HostToUi } from '../src/protocol/messages';
import { sourceHash } from '../src/app/unified-hunk';

describe('ChangesetStore', () => {
  it('materializes selected unified hunks and blocks stale sources before apply', async () => {
    const fs = new MemoryFs();
    fs.files.set('src/app.ts', 'one\ntwo\n');
    const msgs: HostToUi[] = [];
    const store = new ChangesetStore(fs, fs, (message) => msgs.push(message));
    await store.setPendingPrepared([{
      path: 'src/app.ts',
      op: 'update',
      patch: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,2 +1,2 @@\n one\n-two\n+second',
      sourceHash: sourceHash('one\ntwo\n'),
    }]);
    expect(store.files?.[0]?.content).toBe('one\nsecond\n');

    fs.files.set('src/app.ts', 'externally changed\n');
    expect(await store.approve()).toBe(false);
    expect(fs.applyCalls).toBe(0);
    expect(msgs).toContainEqual(expect.objectContaining({ type: 'changeset/stale', paths: ['src/app.ts'] }));
  });

  it('omits unchecked files from preview and atomic apply', async () => {
    const fs = new MemoryFs();
    const msgs: HostToUi[] = [];
    const store = new ChangesetStore(fs, fs, (message) => msgs.push(message));
    store.setPending([
      { path: 'a.ts', op: 'create', content: 'a' },
      { path: 'b.ts', op: 'create', content: 'b' },
    ]);
    store.setIncluded('b.ts', false);
    const preview = [...msgs].reverse().find((message) => message.type === 'changeset/preview');
    expect(preview).toMatchObject({ type: 'changeset/preview', files: [{ path: 'a.ts' }] });
    expect(await store.approve()).toBe(true);
    expect(fs.files.get('a.ts')).toBe('a');
    expect(fs.files.has('b.ts')).toBe(false);
  });

  it('approve success clears the store', async () => {
    const fs = new MemoryFs();
    fs.files.set('src/app.ts', 'old');
    fs.files.set('src/gone.ts', 'bye');
    const msgs: HostToUi[] = [];
    const store = new ChangesetStore(fs, fs, (m) => msgs.push(m));
    store.setPending([
      { path: 'src/new.ts', op: 'create', content: 'n' },
      { path: 'src/app.ts', op: 'update', content: 'new' },
      { path: 'src/gone.ts', op: 'delete' },
    ]);
    expect(store.applyFailed).toBe(false);
    const ok = await store.approve('initial');
    expect(ok).toBe(true);
    expect(store.hasPending()).toBe(false);
    expect(store.applyFailed).toBe(false);
    expect(fs.files.get('src/new.ts')).toBe('n');
    expect(fs.files.get('src/app.ts')).toBe('new');
    expect(msgs.some((m) => m.type === 'changeset/cleared')).toBe(true);
  });

  it('applyFailed is false on clean pending and true after failed apply', async () => {
    const fs = new MemoryFs();
    const msgs: HostToUi[] = [];
    const store = new ChangesetStore(fs, fs, (m) => msgs.push(m));
    store.setPending([{ path: 'a.ts', op: 'create', content: 'x' }]);
    expect(store.applyFailed).toBe(false);
    fs.applyResult = false;
    const ok = await store.approve('initial');
    expect(ok).toBe(false);
    expect(store.applyFailed).toBe(true);
    expect(store.hasPending()).toBe(true);
    expect(msgs.some((m) => m.type === 'changeset/cleared')).toBe(false);
    const failed = msgs.find((m) => m.type === 'changeset/apply-failed');
    expect(failed).toMatchObject({ type: 'changeset/apply-failed', message: APPLY_FAILED_MESSAGE });
  });

  it('retry leftover create overwrite and already-gone delete skip', async () => {
    const fs = new MemoryFs();
    fs.files.set('leftover.ts', 'partial');
    const store = new ChangesetStore(fs, fs, () => undefined);
    store.setPending([
      { path: 'leftover.ts', op: 'create', content: 'final' },
      { path: 'already-gone.ts', op: 'delete' },
      { path: 'keep.ts', op: 'update', content: 'u' },
    ]);
    fs.applyResult = false;
    await store.approve('initial');
    expect(store.leftoverCreates).toEqual(['leftover.ts']);
    expect(store.leftoverDeletes).toEqual(['already-gone.ts']);
    const retry = store.buildEdit('retry');
    expect(retry).toEqual([
      { type: 'create', relativePath: 'leftover.ts', content: 'final', overwrite: true },
      { type: 'replace', relativePath: 'keep.ts', content: 'u' },
    ]);
    fs.applyResult = true;
    const ok = await store.approve('retry');
    expect(ok).toBe(true);
    expect(fs.files.get('leftover.ts')).toBe('final');
    expect(store.hasPending()).toBe(false);
  });

  it('office-binary create approve writes bytes and preview includes kind', async () => {
    const fs = new MemoryFs();
    const msgs: HostToUi[] = [];
    const store = new ChangesetStore(fs, fs, (m) => msgs.push(m));
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    store.setPending([{ path: 'plan.docx', op: 'create', binary: bytes, kind: 'office-binary' }]);
    const preview = msgs.find((m) => m.type === 'changeset/preview');
    expect(preview && preview.type === 'changeset/preview' && preview.files[0]?.kind).toBe('office-binary');
    const ok = await store.approve('initial');
    expect(ok).toBe(true);
    expect(fs.binaries.get('plan.docx')).toEqual(bytes);
    expect(store.hasPending()).toBe(false);
  });

  it('applyEdit false never claims success', async () => {
    const fs = new MemoryFs();
    const msgs: HostToUi[] = [];
    const store = new ChangesetStore(fs, fs, (m) => msgs.push(m));
    store.setPending([{ path: 'a.ts', op: 'create', content: 'x' }]);
    fs.applyResult = false;
    const ok = await store.approve('initial');
    expect(ok).toBe(false);
    expect(msgs.filter((m) => m.type === 'changeset/cleared')).toHaveLength(0);
  });

  it('holdApprove keeps files visible while hasPending is false', async () => {
    const fs = new MemoryFs();
    const msgs: HostToUi[] = [];
    const store = new ChangesetStore(fs, fs, (m) => msgs.push(m));
    store.setPending([{ path: 'src/keep.ts', op: 'create', content: 'k' }], { holdApprove: true });
    expect(store.hasPending()).toBe(false);
    expect(store.files?.map((f) => f.path)).toEqual(['src/keep.ts']);
    expect(await store.approve('initial')).toBe(false);
    expect(fs.applyCalls).toBe(0);
    store.setPending([{ path: 'src/keep.ts', op: 'create', content: 'k' }]);
    expect(store.hasPending()).toBe(true);
    expect(await store.approve('initial')).toBe(true);
    expect(fs.applyCalls).toBe(1);
  });
});
