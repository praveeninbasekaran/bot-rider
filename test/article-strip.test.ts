import { describe, expect, it } from 'vitest';
import {
  removeParseableTodoLines,
  stripArticleChrome,
  stripLeadingVoteToken,
  userAskedForList,
} from '../src/app/article-strip';

describe('userAskedForList', () => {
  it('is deterministic on userText only', () => {
    expect(userAskedForList('fix the bug')).toBe(false);
    expect(userAskedForList('list the risks')).toBe(true);
    expect(userAskedForList('Give me bullets please')).toBe(true);
    expect(userAskedForList('a checklist of steps')).toBe(true);
    expect(userAskedForList('as a list')).toBe(true);
    expect(userAskedForList('numbered steps')).toBe(true);
    expect(userAskedForList('do 1) then 2)')).toBe(true);
    expect(userAskedForList('see 1. and go')).toBe(true);
  });
});

describe('stripLeadingVoteToken', () => {
  it('drops only the first AGREE or DISSENT token and keeps the reason', () => {
    expect(stripLeadingVoteToken('AGREE ship it')).toBe('ship it');
    expect(stripLeadingVoteToken('DISSENT we differ')).toBe('we differ');
    expect(stripLeadingVoteToken('agree\nbecause the cache is ready')).toBe('because the cache is ready');
  });
});

describe('removeParseableTodoLines', () => {
  it('removes parseable checkbox lines and keeps fenced lookalikes', () => {
    const raw = ['hello', '- [ ] first', '```', '- [ ] inside', '```', 'after'].join('\n');
    expect(removeParseableTodoLines(raw)).toBe(['hello', '```', '- [ ] inside', '```', 'after'].join('\n'));
  });
});

describe('stripArticleChrome', () => {
  it('drops # / ## / ### lead-in hashes and keeps the rest', () => {
    const raw = '## Heading\n### Sub\n#Hi\n#### leave four';
    expect(stripArticleChrome(raw, 'fix the bug')).toBe('Heading\nSub\nHi\n#### leave four');
  });

  it('flattens unsolicited consecutive list lines and nested lists', () => {
    const wall = '- one\n- two\n- three';
    expect(stripArticleChrome(wall, 'fix the bug')).toBe('one\ntwo\nthree');
    const nested = 'Intro\n  - nested only\nMore';
    expect(stripArticleChrome(nested, 'fix the bug')).toBe('Intro\nnested only\nMore');
  });

  it('keeps a single-level list when this Send asked for a list and flattens nesting', () => {
    const raw = '- one\n  - nested\n* two\n1. three';
    expect(stripArticleChrome(raw, 'list the risks')).toBe('- one\n- nested\n* two\n1. three');
  });

  it('keeps fenced code with inner list lines byte-for-byte', () => {
    const raw = ['Look:', '```', '- keep me', '  * also', '```', '- flatten', '- these'].join('\n');
    expect(stripArticleChrome(raw, 'fix the bug')).toBe(
      ['Look:', '```', '- keep me', '  * also', '```', 'flatten', 'these'].join('\n'),
    );
  });

  it('leaves inline code spans alone', () => {
    expect(stripArticleChrome('Use `foo-bar` here.', 'fix the bug')).toBe('Use `foo-bar` here.');
  });
});
