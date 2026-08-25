import { describe, expect, it } from 'vitest';
import { parseMentions } from '../src/app/mentions';

describe('parseMentions', () => {
  it('token after @ is [A-Za-z0-9_-]+ case-insensitive, handle-shaped only', () => {
    expect(parseMentions('@Alpha please').handles).toEqual(['alpha']);
    expect(parseMentions('hey @alpha-bot_1').handles).toEqual(['alpha-bot_1']);
    expect(parseMentions('@ALPHA @alpha').handles).toEqual(['alpha']);
  });

  it('display names with spaces are not a single mention token', () => {
    expect(parseMentions('@Alpha Bot please').handles).toEqual(['alpha']);
    expect(parseMentions('talk to Alpha Bot').handles).toEqual([]);
  });

  it('plain @handle is a lock mention; extra @ that are not tokens stay plain text', () => {
    expect(parseMentions('please @alpha').handles).toEqual(['alpha']);
    expect(parseMentions('see me@host.com and then send').handles).toEqual([]);
    expect(parseMentions('price @ the store').handles).toEqual([]);
    expect(parseMentions('trailing @').handles).toEqual([]);
  });

  it('keeps multiple distinct handle tokens in order', () => {
    expect(parseMentions('@alpha @beta both').handles).toEqual(['alpha', 'beta']);
  });
});
