export interface MentionParse {
  handles: string[];
  invalid: string[];
  rest: string;
}

/** `@` token: `[A-Za-z0-9_-]+`. Display names with spaces are not a single mention. */
const MENTION_TOKEN_RE = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_-]+)/g;

export function parseMentions(text: string): MentionParse {
  const handles: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(MENTION_TOKEN_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1] ?? '';
    if (!raw) {
      continue;
    }
    const lower = raw.toLowerCase();
    if (!seen.has(lower)) {
      handles.push(lower);
      seen.add(lower);
    }
  }
  const rest = text
    .replace(/(^|[^A-Za-z0-9_])@[A-Za-z0-9_-]+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return { handles, invalid: [], rest };
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

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
