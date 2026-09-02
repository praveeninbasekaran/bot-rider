import { copyPacket, type IsolationPacket } from './bot-session-store';

/** SI-2 packet on the host bus. Not a protocol member. */
export type EventBusPacket = IsolationPacket;

/**
 * Host-in-process packet bus.
 * Not the VS Code EventBus API. Not a network, socket, or webview topic.
 */
export class HostEventBus {
  private readonly log: EventBusPacket[] = [];

  publish(packet: EventBusPacket): EventBusPacket {
    const next = copyPacket(packet);
    this.log.push(next);
    return copyPacket(next);
  }

  list(): EventBusPacket[] {
    return this.log.map(copyPacket);
  }

  clear(): void {
    this.log.length = 0;
  }
}
