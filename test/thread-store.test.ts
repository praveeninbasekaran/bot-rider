import { describe, expect, it } from 'vitest';
import { ThreadStore } from '../src/app/thread-store';

describe('ThreadStore transcript snapshots', () => {
  it('replays exactly one current synthesis and terminal decision', () => {
    const store = new ThreadStore();
    store.recordHostMessage({
      type: 'chat/synthesis',
      synthesis: { round: 1, botId: 'd', handle: 'dispatcher', text: 'First recommendation' },
    });
    store.recordHostMessage({
      type: 'chat/synthesis',
      synthesis: { round: 2, botId: 'd', handle: 'dispatcher', text: 'Settled recommendation' },
    });
    store.recordHostMessage({
      type: 'chat/decision',
      decision: {
        status: 'accepted',
        recommendation: 'Settled recommendation',
        highRisk: false,
        agreeVotes: 2,
        validVotes: 3,
        quorumRequired: 2,
      },
    });

    expect(store.snapshot()).toMatchObject({
      synthesis: { round: 2, text: 'Settled recommendation' },
      decision: { status: 'accepted', recommendation: 'Settled recommendation' },
    });
  });

  it('preserves start order while parallel bot turns finish out of order', () => {
    const store = new ThreadStore();
    store.appendUser('Plan this change');
    store.recordHostMessage({
      type: 'chat/turn-start',
      botId: 'a',
      handle: 'architect',
      name: 'Architect',
      colorIndex: 1,
      turn: 'propose',
      round: 1,
    });
    store.recordHostMessage({
      type: 'chat/turn-start',
      botId: 'b',
      handle: 'backend',
      name: 'Backend',
      colorIndex: 2,
      turn: 'propose',
      round: 1,
    });
    store.recordHostMessage({ type: 'chat/token', botId: 'b', delta: 'Backend draft' });
    store.recordHostMessage({ type: 'chat/turn-end', botId: 'b', turn: 'propose', text: 'Backend answer' });
    store.recordHostMessage({ type: 'chat/token', botId: 'a', delta: 'Architecture draft' });
    store.recordHostMessage({ type: 'chat/turn-end', botId: 'a', turn: 'propose', text: 'Architecture answer' });

    const snapshot = store.snapshot();
    expect(snapshot.version).toBe(1);
    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(['user', 'bot', 'bot']);
    expect(snapshot.entries.map((entry) => entry.kind === 'bot' ? entry.botId : 'user')).toEqual(['user', 'a', 'b']);
    expect(snapshot.entries.filter((entry) => entry.kind === 'bot').map((entry) => entry.text)).toEqual([
      'Architecture answer',
      'Backend answer',
    ]);
    expect(snapshot.entries.filter((entry) => entry.kind === 'bot').every((entry) => entry.complete)).toBe(true);
  });

  it('snapshots an incomplete visible turn for webview recreation', () => {
    const store = new ThreadStore();
    store.recordHostMessage({
      type: 'chat/turn-start',
      botId: 'a',
      handle: 'architect',
      name: 'Architect',
      colorIndex: 1,
      turn: 'critique',
      round: 2,
      solo: true,
    });
    store.recordHostMessage({ type: 'chat/token', botId: 'a', delta: 'Partial response' });

    expect(store.snapshot().entries).toMatchObject([
      {
        kind: 'bot',
        botId: 'a',
        text: 'Partial response',
        complete: false,
        turn: 'critique',
        round: 2,
      },
    ]);
  });

  it('marks unfinished articles interrupted when the run stops', () => {
    const store = new ThreadStore();
    store.recordHostMessage({
      type: 'chat/turn-start',
      botId: 'a',
      handle: 'architect',
      name: 'Architect',
      colorIndex: 1,
      turn: 'propose',
      round: 1,
    });
    store.recordHostMessage({ type: 'chat/token', botId: 'a', delta: 'Partial response' });
    store.recordHostMessage({ type: 'chat/notice', text: 'Interrupted' });

    expect(store.snapshot().entries).toMatchObject([
      {
        kind: 'bot',
        text: 'Partial response',
        complete: true,
        interrupted: true,
      },
    ]);
  });

  it('captures run, board, Split, review state, notices, and errors', () => {
    const store = new ThreadStore();
    store.recordHostMessage({
      type: 'run/state',
      state: {
        phase: 'split',
        round: 2,
        splitOpen: true,
        debateRunning: false,
        applyFailed: false,
        frozenBotIds: ['a', 'b'],
      },
    });
    store.recordHostMessage({
      type: 'chat/board',
      board: {
        goal: 'Ship',
        todos: [{ id: 'one', text: 'Plan', status: 'done' }],
        decisions: ['Use snapshots'],
        dissents: [],
        files: [{ path: 'src/a.ts', inChangeset: true }],
      },
    });
    store.recordHostMessage({
      type: 'chat/split',
      title: 'No consensus',
      reason: 'Different approaches',
      positions: [{ botId: 'a', handle: 'architect', text: 'Option A' }],
    });
    store.recordHostMessage({
      type: 'changeset/preview',
      files: [{ path: 'src/a.ts', op: 'update', specIds: ['PU-2'] }],
    });
    store.recordHostMessage({
      type: 'mcp/actions-preview',
      actions: [{ id: 'm1', server: 'git', tool: 'commit', argsLine: '{}', botId: 'a', handle: 'architect' }],
    });
    store.recordHostMessage({ type: 'chat/notice', text: 'Review ready' });
    store.recordHostMessage({ type: 'error', code: 'copilot', message: 'Copilot failed' });

    const snapshot = store.snapshot();
    expect(snapshot.run?.phase).toBe('split');
    expect(snapshot.board?.goal).toBe('Ship');
    expect(snapshot.split?.positions[0]?.handle).toBe('architect');
    expect(snapshot.pendingFiles[0]?.specIds).toEqual(['PU-2']);
    expect(snapshot.pendingMcpActions[0]?.id).toBe('m1');
    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(['notice', 'error']);

    snapshot.pendingFiles[0]!.specIds!.push('changed');
    expect(store.snapshot().pendingFiles[0]?.specIds).toEqual(['PU-2']);
  });

  it('clears resolved Split and review gates', () => {
    const store = new ThreadStore();
    store.recordHostMessage({
      type: 'chat/split',
      title: 'No consensus',
      reason: 'Different approaches',
      positions: [],
    });
    store.recordHostMessage({ type: 'changeset/preview', files: [{ path: 'a.ts', op: 'create' }] });
    store.recordHostMessage({
      type: 'mcp/actions-preview',
      actions: [{ id: 'm1', server: 'git', tool: 'commit', argsLine: '{}', botId: 'a', handle: 'architect' }],
    });
    store.recordHostMessage({
      type: 'run/state',
      state: {
        phase: 'idle',
        round: 0,
        splitOpen: false,
        debateRunning: false,
        applyFailed: false,
        frozenBotIds: [],
      },
    });
    store.recordHostMessage({ type: 'changeset/cleared' });
    store.recordHostMessage({ type: 'mcp/actions-cleared' });

    expect(store.snapshot()).toMatchObject({
      split: undefined,
      pendingFiles: [],
      pendingMcpActions: [],
    });
  });
});
