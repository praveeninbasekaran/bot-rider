import type { BotDraft } from '../domain/bot';

/**
 * UI-only compat: if a caller still posts chat/token `{ text }`, map it to `{ delta }`.
 * This is not the host contract — outbound/host emit is `{ botId, delta }`.
 */
export function mapIncomingToken(msg: {
  type: 'chat/token';
  botId?: string;
  delta?: string;
  text?: string;
}): { type: 'chat/token'; botId: string; delta: string } | undefined {
  const delta = msg.delta ?? msg.text ?? '';
  const botId = msg.botId ?? '';
  if (!botId) {
    return undefined;
  }
  return { type: 'chat/token', botId, delta };
}

export function asCreateDraft(msg: { draft?: BotDraft } & Partial<BotDraft>): BotDraft {
  if (msg.draft) {
    return msg.draft;
  }
  return {
    name: msg.name ?? '',
    handle: msg.handle,
    persona: msg.persona ?? '',
    role: msg.role ?? '',
    instructions: msg.instructions ?? '',
    active: msg.active,
  };
}
