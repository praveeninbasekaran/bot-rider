import { isValidHandle } from '../domain/bot';

export interface MentionParse {
  handles: string[];
  invalid: string[];
  rest: string;
}

const MENTION_RE = /(^|\s)@([^\s]+)/g;

export function parseMentions(text: string): MentionParse {
  const handles: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    const raw = stripTrailingPunct(match[2] ?? '');
    if (!raw) {
      continue;
    }
    const lower = raw.toLowerCase();
    if (!isValidHandle(lower)) {
      if (!seen.has(`!${lower}`)) {
        invalid.push(raw);
        seen.add(`!${lower}`);
      }
      continue;
    }
    if (!seen.has(lower)) {
      handles.push(lower);
      seen.add(lower);
    }
  }
  const rest = text.replace(/(^|\s)@[^\s]+/g, '$1').replace(/\s+/g, ' ').trim();
  return { handles, invalid, rest };
}

function stripTrailingPunct(token: string): string {
  return token.replace(/[.,;:!?]+$/g, '');
}

export function parseVote(text: string): 'AGREE' | 'DISSENT' {
  const token = text.trim().split(/\s+/)[0] ?? '';
  const norm = token.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (norm === 'AGREE') {
    return 'AGREE';
  }
  return 'DISSENT';
}

export function stripNeedEditTrailer(text: string): {
  body: string;
  token: 'NEED_EDIT' | 'NO_EDIT';
} {
  const lines = text.split(/\r?\n/);
  let i = lines.length - 1;
  while (i >= 0 && lines[i]!.trim() === '') {
    i--;
  }
  if (i < 0) {
    return { body: text, token: 'NO_EDIT' };
  }
  const line = lines[i]!.trim().replace(/\.+$/, '');
  const u = line.toUpperCase();
  if (u === 'NEED_EDIT' || u === 'NO_EDIT') {
    const body = lines.slice(0, i).join('\n').replace(/\s+$/g, '');
    return { body, token: u };
  }
  return { body: text, token: 'NO_EDIT' };
}
