import { describe, expect, it } from 'vitest';
import { Application } from '../src/app/application';
import { McpGateway } from '../src/app/mcp-gateway';
import {
  RECOVERY_STATE_KEY,
  WorkspaceRecoveryStore,
  deserializeChangeFiles,
  migrateRecoverySnapshot,
  serializeChangeFiles,
} from '../src/app/recovery';
import type { HostToUi } from '../src/protocol/messages';
import { FakeGateway, FakeMcpPort, FixedWorkspace, MemoryFs, MemoryStore, defaultWorkspace } from './fakes';

function application(recovery: MemoryStore, fs: MemoryFs, messages: HostToUi[], port: FakeMcpPort) {
  const mcp = new McpGateway(port, (message) => messages.push(message), { settleMs: 0 });
  return new Application(
    new MemoryStore(),
    new FakeGateway(),
    fs,
    fs,
    new FixedWorkspace(defaultWorkspace),
    (message) => messages.push(message),
    undefined,
    undefined,
    mcp,
    undefined,
    undefined,
    recovery,
  );
}

describe('PU-7 workspace reload recovery', () => {
  it('round-trips binary-safe file metadata', () => {
    const encoded = serializeChangeFiles([
      { path: 'report.docx', op: 'create', binary: Uint8Array.from([1, 2, 3]), kind: 'office-binary' },
    ]);
    expect(deserializeChangeFiles(encoded)[0]?.binary).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('restores transcript, pending reviews, and MCP metadata without executing actions', async () => {
    const recovery = new MemoryStore();
    const fs = new MemoryFs();
    const firstMessages: HostToUi[] = [];
    const firstPort = new FakeMcpPort();
    const first = application(recovery, fs, firstMessages, firstPort);
    first.thread.appendUser('recover this');
    first.thread.recordHostMessage({
      type: 'chat/turn-start',
      botId: 'worker',
      handle: 'worker',
      name: 'Worker',
      colorIndex: 1,
      turn: 'work',
      round: 1,
    });
    first.changesets.setPending([{ path: 'pending.ts', op: 'create', content: 'pending' }]);
    first.mcp.actions.append({
      name: 'write',
      server: 'repo',
      tool: 'create_issue',
      args: { title: 'Pending' },
      argsLine: 'title=Pending',
      botId: 'worker',
      handle: 'worker',
    });
    await first.persistRecoveryNow();

    const restoredMessages: HostToUi[] = [];
    const restoredPort = new FakeMcpPort();
    const restored = application(recovery, fs, restoredMessages, restoredPort);
    restored.offerRecovery();
    expect(restoredMessages).toContainEqual({
      type: 'recovery/state',
      recovery: expect.objectContaining({ available: true, fileCount: 1, mcpCount: 1 }),
    });
    await restored.reviewRecovered();

    expect(restored.changesets.files?.[0]?.path).toBe('pending.ts');
    expect(restored.mcp.actions.snapshot()).toHaveLength(1);
    expect(restoredPort.invokeCalls).toHaveLength(0);
    const bot = restored.thread.snapshot().entries.find((entry) => entry.kind === 'bot');
    expect(bot).toMatchObject({ complete: true, interrupted: true });
  });

  it('rejects unsupported snapshots and discards offered recovery', async () => {
    const store = new MemoryStore();
    await store.update(RECOVERY_STATE_KEY, { version: 99 });
    expect(migrateRecoverySnapshot({ version: 99 })).toBeUndefined();
    const recovery = new WorkspaceRecoveryStore(store);
    expect(recovery.read()).toEqual({ ok: false, reason: 'unsupported' });
    await recovery.discard();
    expect(recovery.read()).toEqual({ ok: false, reason: 'missing' });
  });
});
