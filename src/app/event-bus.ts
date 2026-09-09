import { copyPacket, type IsolationPacket } from './bot-session-store';

/** SI-2 packet on the host bus. Not a protocol member. */
export type EventBusPacket = IsolationPacket;

export type SchedulerEvent =
  | { type: 'SPEC_PUBLISHED'; artifact: 'spec'; botId?: string }
  | { type: 'ARCHITECTURE_READY'; taskId: string; artifacts: string[]; botId: string }
  | { type: 'TASK_READY'; taskId: string; botId: string }
  | { type: 'TASK_COMPLETED'; taskId: string; artifacts: string[]; botId: string }
  | { type: 'TASK_FAILED'; taskId: string; reason: string; botId: string };

export type SchedulerEventType = SchedulerEvent['type'];

export type SchedulerEventEnvelope<T extends SchedulerEvent = SchedulerEvent> = T & {
  id: string;
  runId: string;
  sequence: number;
  timestamp: number;
};

type EventInput<T extends SchedulerEvent> = T & { runId: string; id?: string; timestamp?: number };
type EventListener<T extends SchedulerEventType> = (
  event: SchedulerEventEnvelope<Extract<SchedulerEvent, { type: T }>>,
) => void;

/**
 * Host-in-process packet bus.
 * Not the VS Code EventBus API. Not a network, socket, or webview topic.
 */
export class HostEventBus {
  private readonly log: EventBusPacket[] = [];
  private readonly schedulerLog: SchedulerEventEnvelope[] = [];
  private readonly seenEventIds = new Set<string>();
  private readonly lastSequence = new Map<string, number>();
  private readonly listeners = new Map<SchedulerEventType, Set<(event: SchedulerEventEnvelope) => void>>();

  publish(packet: EventBusPacket): EventBusPacket {
    const next = copyPacket(packet);
    this.log.push(next);
    return copyPacket(next);
  }

  list(): EventBusPacket[] {
    return this.log.map(copyPacket);
  }

  publishEvent<T extends SchedulerEvent>(event: EventInput<T>): SchedulerEventEnvelope<T> {
    const sequence = (this.lastSequence.get(event.runId) ?? 0) + 1;
    const envelope = {
      ...event,
      id: event.id ?? crypto.randomUUID(),
      sequence,
      timestamp: event.timestamp ?? Date.now(),
    } as SchedulerEventEnvelope<T>;
    this.consumeEvent(envelope);
    return copyEvent(envelope);
  }

  consumeEvent(event: SchedulerEventEnvelope): boolean {
    const last = this.lastSequence.get(event.runId) ?? 0;
    if (this.seenEventIds.has(event.id) || event.sequence <= last) {
      return false;
    }
    const next = copyEvent(event);
    this.seenEventIds.add(next.id);
    this.lastSequence.set(next.runId, next.sequence);
    this.schedulerLog.push(next);
    for (const listener of this.listeners.get(next.type) ?? []) {
      listener(copyEvent(next));
    }
    return true;
  }

  subscribe<T extends SchedulerEventType>(
    type: T,
    listener: EventListener<T>,
  ): { dispose(): void } {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as (event: SchedulerEventEnvelope) => void);
    this.listeners.set(type, listeners);
    return { dispose: () => listeners.delete(listener as (event: SchedulerEventEnvelope) => void) };
  }

  listEvents(): SchedulerEventEnvelope[] {
    return this.schedulerLog.map(copyEvent);
  }

  clear(): void {
    this.log.length = 0;
    this.schedulerLog.length = 0;
    this.seenEventIds.clear();
    this.lastSequence.clear();
  }
}

function copyEvent<T extends SchedulerEvent>(event: SchedulerEventEnvelope<T>): SchedulerEventEnvelope<T> {
  const next = { ...event } as SchedulerEventEnvelope<T>;
  if ('artifacts' in next) {
    next.artifacts = [...next.artifacts];
  }
  return next;
}
