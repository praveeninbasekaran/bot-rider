import { isParseableTodoLine } from './run-board';

const CLOSED_FENCE_RE = /```[^\r\n]*\r?\n[\s\S]*?```/g;
const HEADING_LEAD_IN = /^(#{1,3})(?!#)(\s*)(.*)$/;
const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function userAskedForList(userText: string): boolean {
  if (/\b(list|bullet|bullets|checklist)\b/i.test(userText)) {
    return true;
  }
  if (/\bas a list\b/i.test(userText)) {
    return true;
  }
  if (/\bnumbered\b/i.test(userText)) {
    return true;
  }
  return /\b1\)/.test(userText) || /\b1\./.test(userText);
}

export function stripLeadingVoteToken(text: string): string {
  return text.replace(/^\s*(AGREE|DISSENT)\b\s*/i, '');
}

export function removeParseableTodoLines(text: string): string {
  return mapUnfenced(text, (segment) =>
    segment
      .split(/\r?\n/)
      .filter((line) => !isParseableTodoLine(line))
      .join('\n'),
  );
}

/** Heading lead-in then list flatten. Fenced blocks stay byte-for-byte. */
export function stripArticleChrome(text: string, userText: string): string {
  const asked = userAskedForList(userText);
  return mapUnfenced(text, (segment) => flattenListLines(stripHeadingLeadIn(segment), asked));
}

function mapUnfenced(text: string, map: (segment: string) => string): string {
  const re = new RegExp(CLOSED_FENCE_RE.source, 'g');
  let out = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out += map(text.slice(last, match.index));
    out += match[0];
    last = match.index + match[0].length;
  }
  const rest = text.slice(last);
  const open = rest.search(/(^|\n)```/);
  if (open >= 0) {
    out += map(rest.slice(0, open));
    out += rest.slice(open);
    return out;
  }
  return out + map(rest);
}

function stripHeadingLeadIn(segment: string): string {
  return segment
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(HEADING_LEAD_IN);
      if (!match) {
        return line;
      }
      return (match[3] ?? '').trim();
    })
    .join('\n');
}

function flattenListLines(segment: string, askedForList: boolean): string {
  const lines = segment.split(/\r?\n/);
  const infos = lines.map(listInfo);
  const out: string[] = [];

  if (askedForList) {
    for (let i = 0; i < lines.length; i++) {
      const info = infos[i];
      if (!info) {
        out.push(lines[i]!);
        continue;
      }
      out.push(`${info.marker} ${info.rest}`);
    }
    return out.join('\n');
  }

  let i = 0;
  while (i < lines.length) {
    const start = infos[i];
    if (!start) {
      out.push(lines[i]!);
      i += 1;
      continue;
    }
    let end = i;
    let nested = start.indent > 0;
    while (end + 1 < lines.length && infos[end + 1]) {
      end += 1;
      if (infos[end]!.indent > 0) {
        nested = true;
      }
    }
    const wall = end > i || nested;
    for (let k = i; k <= end; k++) {
      const info = infos[k]!;
      out.push(wall ? info.rest : lines[k]!);
    }
    i = end + 1;
  }
  return out.join('\n');
}

function listInfo(line: string): { indent: number; marker: string; rest: string } | undefined {
  const match = line.match(LIST_LINE);
  if (!match) {
    return undefined;
  }
  return {
    indent: match[1]!.length,
    marker: match[2]!,
    rest: match[3] ?? '',
  };
}
