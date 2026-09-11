import { describe, expect, it } from 'vitest';
import { HostEventBus, type SchedulerEventEnvelope } from '../src/app/event-bus';
import { BotSessionStore, buildIsolationPacket } from '../src/app/bot-session-store';
import { RunBoardStore, emptyBoard } from '../src/app/run-board';

describe('P1 shared state and typed events', () => {
  it('publishes typed events in host sequence and notifies only matching subscribers', () => {
    const bus = new HostEventBus();
    const seen: string[] = [];
    bus.subscribe('TASK_READY', (event) => seen.push(`${event.sequence}:${event.taskId}`));
    const spec = bus.publishEvent({ type: 'SPEC_PUBLISHED', runId: 'run-1', artifact: 'spec' });
    const ready = bus.publishEvent({
      type: 'TASK_READY',
      runId: 'run-1',
      taskId: 'build',
      botId: 'coder',
    });
    expect([spec.sequence, ready.sequence]).toEqual([1, 2]);
    expect(seen).toEqual(['2:build']);
    expect(bus.listEvents().map((event) => event.type)).toEqual(['SPEC_PUBLISHED', 'TASK_READY']);
  });

  it('rejects duplicate and stale envelopes and protects stored payloads from mutation', () => {
    const bus = new HostEventBus();
    const completed = bus.publishEvent({
      type: 'TASK_COMPLETED',
      runId: 'run-1',
      taskId: 'build',
      botId: 'coder',
      artifacts: ['implementation'],
    });
    completed.artifacts.push('mutated');
    expect(bus.listEvents()[0]).toMatchObject({ artifacts: ['implementation'] });
    expect(bus.consumeEvent(completed)).toBe(false);
    const stale: SchedulerEventEnvelope = {
      type: 'TASK_FAILED',
      id: 'stale',
      runId: 'run-1',
      sequence: 1,
      timestamp: Date.now(),
      taskId: 'build',
      botId: 'coder',
      reason: 'late',
    };
    expect(bus.consumeEvent(stale)).toBe(false);
    expect(bus.listEvents()).toHaveLength(1);
  });

  it('merges concurrent board facts commutatively with monotonic todo status', () => {
    const left = new RunBoardStore();
    left.mergeParseableTodos('- [ ] Zebra\n- [x] Alpha');
    left.mergeParseableTodos('- [>] alpha\n- [ ] Zebra');
    left.addDecision('Use API');
    left.addDecision('use api');
    left.addDecision('USE API');
    left.addDecision('Add tests');

    const right = new RunBoardStore();
    right.addDecision('Add tests');
    right.addDecision('USE API');
    right.addDecision('Use API');
    right.addDecision('use api');
    right.mergeParseableTodos('- [ ] Zebra\n- [ ] Alpha');
    right.mergeParseableTodos('- [x] alpha');

    expect(left.snapshot().todos).toEqual(right.snapshot().todos);
    expect(left.snapshot().decisions).toEqual(right.snapshot().decisions);
    expect(left.snapshot().todos.map((todo) => todo.status)).toEqual(['done', 'pending']);
    expect(left.snapshot().decisions.map((decision) => decision.toLowerCase())).toEqual(['add tests', 'use api']);
    expect(right.snapshot().decisions.map((decision) => decision.toLowerCase())).toEqual(['add tests', 'use api']);
  });

  it('keeps bot histories private and publishes copied structured packets only', () => {
    const sessions = new BotSessionStore();
    sessions.append('a', [{ role: 'user', content: 'private-a' }]);
    sessions.append('b', [{ role: 'user', content: 'private-b' }]);
    const packet = buildIsolationPacket({ at: 'turn-end', fromBotId: 'a', board: emptyBoard() });
    sessions.recordPublished(packet);
    sessions.enqueue('b', packet);
    const inbox = sessions.takeInbox('b');
    inbox[0]!.requirements.push('mutation');

    expect(sessions.messagesOf('a')).toEqual([{ role: 'user', content: 'private-a' }]);
    expect(sessions.messagesOf('b')).toEqual([{ role: 'user', content: 'private-b' }]);
    expect(sessions.listPublished()[0]?.requirements).toEqual([]);
    expect(JSON.stringify(sessions.listPublished())).not.toContain('private-a');
  });
});
