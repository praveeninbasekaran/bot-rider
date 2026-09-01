export const ATTACHMENT_KINDS = [
  'agent',
  'skills',
  'scripts',
  'instructions',
  'prompts',
  'hooks',
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export interface BotAttachment {
  path: string;
  name: string;
  snapshot: string;
  /** Slot the user picked. Missing on pre-TA IE records; never inferred from filename. */
  kind?: AttachmentKind;
}

export interface BotRecord {
  id: string;
  handle: string;
  name: string;
  persona: string;
  role: string;
  instructions: string;
  active: boolean;
  colorIndex: number;
  createdAt: string;
  updatedAt: string;
  attachments?: BotAttachment[];
}

export interface BotDraft {
  name: string;
  handle?: string;
  persona: string;
  role: string;
  instructions: string;
  active?: boolean;
  attachments?: BotAttachment[];
}

export const ATTACH_MAX_BYTES = 262144;
export const ATTACH_BINARY_PROBE_BYTES = 8192;

export function isAttachmentKind(value: unknown): value is AttachmentKind {
  return typeof value === 'string' && (ATTACHMENT_KINDS as readonly string[]).includes(value);
}

export function attachmentsOf(bot?: { attachments?: BotAttachment[] } | null): BotAttachment[] {
  if (!bot || !Array.isArray(bot.attachments)) {
    return [];
  }
  return bot.attachments.map((item) => {
    const next: BotAttachment = {
      path: item.path,
      name: item.name,
      snapshot: item.snapshot,
    };
    if (isAttachmentKind(item.kind)) {
      next.kind = item.kind;
    }
    return next;
  });
}

export function agentKindCount(attachments: BotAttachment[]): number {
  return attachments.filter((item) => item.kind === 'agent').length;
}

export function copyBotRecord(bot: BotRecord): BotRecord {
  return { ...bot, attachments: attachmentsOf(bot) };
}

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}

export function deriveHandle(name: string): string {
  let s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  s = s.replace(/[^a-z0-9_-]/g, '');
  if (!s || !/^[a-z0-9]/.test(s)) {
    s = `bot${s}`.replace(/[^a-z0-9_-]/g, '');
  }
  s = s.slice(0, 32);
  while (s.length > 0 && !HANDLE_PATTERN.test(s)) {
    s = s.slice(0, -1);
  }
  return s || 'bot';
}

export const BOT_COLORS = [
  '#4fc1ff',
  '#c586c0',
  '#4ec9b0',
  '#dcdcaa',
  '#ce9178',
  '#9cdcfe',
  '#d7ba7d',
  '#f14c4c',
];

export function botColor(colorIndex: number): string {
  return BOT_COLORS[((colorIndex % BOT_COLORS.length) + BOT_COLORS.length) % BOT_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
  }
  const one = name.trim();
  return (one.slice(0, 2) || '?').toUpperCase();
}

export function avatarSvg(name: string, colorIndex: number): string {
  const color = botColor(colorIndex);
  const text = initials(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="12" fill="${color}"/><text x="12" y="16" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#ffffff">${escapeXml(text)}</text></svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
