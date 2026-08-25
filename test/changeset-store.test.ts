import { describe, expect, it } from 'vitest';
import { ChangesetStore } from '../src/app/changeset-store';
import { APPLY_FAILED_MESSAGE } from '../src/domain/changeset';
import { MemoryFs } from './fakes';
import type { HostToUi } from '../src/protocol/messages';

describe('ChangesetStore', () => {
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
});
