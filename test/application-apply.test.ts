import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import { COPY } from '../src/app/copy';
import { APPLY_FAILED_MESSAGE } from '../src/domain/changeset';
import type { HostToUi } from '../src/protocol/messages';
import { changesetFence, FakeGateway, FixedWorkspace, MemoryFs, MemoryStore, defaultWorkspace } from './fakes';

function harness(folderFsPath?: string) {
  const gw = new FakeGateway();
  const fs = new MemoryFs();
  const msgs: HostToUi[] = [];
  const app = new Application(
    new MemoryStore(),
    gw,
    fs,
    fs,
    new FixedWorkspace({ ...defaultWorkspace, folderFsPath }),
    (m) => msgs.push(m),
  );
  return { app, gw, fs, msgs };
}

describe('Application approve/reject/retry', () => {
  it('approve success emits chat notice and does not call Copilot', async () => {
    const { app, gw, fs, msgs } = harness('/tmp/bot-rider-ws');
    app.changesets.setPending([
      { path: 'a.ts', op: 'create', content: 'n' },
      { path: 'b.ts', op: 'create', content: 'm' },
    ]);
    const ok = await app.approve();
    expect(ok).toBe(true);
    expect(fs.files.get('a.ts')).toBe('n');
    expect(gw.requestCount).toBe(0);
    expect(gw.ensureCalls).toBe(0);
    expect(msgs.some((m) => m.type === 'chat/notice' && m.text === COPY.approvedNotice(2))).toBe(true);
    expect(app.changesets.hasPending()).toBe(false);
  });

  it('reject emits discarded notice and never applyEdits leftover', async () => {
    const { app, gw, fs, msgs } = harness('/tmp/bot-rider-ws');
    app.changesets.setPending([{ path: 'a.ts', op: 'create', content: 'n' }]);
    await app.reject();
    expect(fs.files.has('a.ts')).toBe(false);
    expect(gw.requestCount).toBe(0);
    expect(msgs.some((m) => m.type === 'chat/notice' && m.text === COPY.rejectedNotice)).toBe(true);
    expect(app.changesets.hasPending()).toBe(false);
  });

  it('no-folder approve errors, keeps the store, and does not apply', async () => {
    const { app, fs, msgs } = harness(undefined);
    app.changesets.setPending([{ path: 'a.ts', op: 'create', content: 'n' }]);
    const ok = await app.approve();
    expect(ok).toBe(false);
    expect(fs.files.has('a.ts')).toBe(false);
    expect(app.changesets.hasPending()).toBe(true);
    expect(app.changesets.applyFailed).toBe(false);
    expect(
      msgs.some((m) => m.type === 'error' && m.code === 'no-workspace' && m.message === COPY.applyNoFolder),
    ).toBe(true);
  });

  it('failed apply keeps honest leftover copy and applyFailed', async () => {
    const { app, fs, msgs } = harness('/tmp/bot-rider-ws');
    app.changesets.setPending([{ path: 'a.ts', op: 'create', content: 'x' }]);
    fs.applyResult = false;
    const ok = await app.approve();
    expect(ok).toBe(false);
    expect(app.changesets.applyFailed).toBe(true);
    expect(app.changesets.hasPending()).toBe(true);
    const failed = msgs.find((m) => m.type === 'changeset/apply-failed');
    expect(failed).toMatchObject({ type: 'changeset/apply-failed', message: APPLY_FAILED_MESSAGE });
    expect(msgs.some((m) => m.type === 'chat/notice')).toBe(false);
  });

  it('applyEdit is invoked only by Approve and Retry, not reject or implementer', async () => {
    const { app, gw, fs } = harness('/tmp/bot-rider-ws');
    await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
    gw.script = ({ turn }) => {
      if (turn === 'direct') {
        return 'need it\nNEED_EDIT';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'impl.ts', op: 'create', content: 'x' }]);
      }
      return 'x';
    };
    await app.send('@alpha edit please');
    expect(app.changesets.hasPending()).toBe(true);
    expect(fs.applyCalls).toBe(0);
    expect(fs.files.has('impl.ts')).toBe(false);

    await app.reject();
    expect(fs.applyCalls).toBe(0);
    expect(fs.files.has('impl.ts')).toBe(false);

    app.changesets.setPending([{ path: 'a.ts', op: 'create', content: 'n' }]);
    await app.approve();
    expect(fs.applyCalls).toBe(1);
    expect(fs.files.get('a.ts')).toBe('n');

    app.changesets.setPending([{ path: 'b.ts', op: 'create', content: 'm' }]);
    fs.applyResult = false;
    await app.approve();
    expect(fs.applyCalls).toBe(2);
    fs.applyResult = true;
    const ok = await app.retry();
    expect(ok).toBe(true);
    expect(fs.applyCalls).toBe(3);
    expect(fs.files.get('b.ts')).toBe('m');
  });

  it('retry uses the same approve() caller with buildEdit retry', async () => {
    const { app, fs } = harness('/tmp/bot-rider-ws');
    fs.files.set('leftover.ts', 'partial');
    app.changesets.setPending([
      { path: 'leftover.ts', op: 'create', content: 'final' },
      { path: 'keep.ts', op: 'update', content: 'u' },
    ]);
    fs.applyResult = false;
    await app.approve();
    expect(app.changesets.applyFailed).toBe(true);
    const retryOps = app.changesets.buildEdit('retry');
    expect(retryOps).toEqual([
      { type: 'create', relativePath: 'leftover.ts', content: 'final', overwrite: true },
      { type: 'replace', relativePath: 'keep.ts', content: 'u' },
    ]);
    fs.applyResult = true;
    const ok = await app.retry();
    expect(ok).toBe(true);
    expect(fs.files.get('leftover.ts')).toBe('final');
    expect(app.changesets.hasPending()).toBe(false);
  });

  it('Approve Retry Reject and CRUD never start MCP', async () => {
    const { app } = harness('/tmp/bot-rider-ws');
    await app.createBot({ name: 'Rho', persona: 'p', role: 'r', instructions: 'i' });
    app.changesets.setPending([{ path: 'a.ts', op: 'create', content: 'n' }]);
    await app.approve();
    expect(app.mcp.didStart).toBe(false);
    app.changesets.setPending([{ path: 'b.ts', op: 'create', content: 'm' }]);
    await app.reject();
    expect(app.mcp.didStart).toBe(false);
    app.changesets.setPending([{ path: 'c.ts', op: 'create', content: 'c' }]);
    await app.retry();
    expect(app.mcp.didStart).toBe(false);
  });
});
