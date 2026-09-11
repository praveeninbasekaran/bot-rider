import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

describe('Swarm webview runtime integration', () => {
  let dom: JSDOM | undefined;

  afterEach(() => dom?.window.close());

  it('renders recovery choices and posts explicit user actions', () => {
    const posted: unknown[] = [];
    dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'dangerously',
      url: 'https://webview.test/',
    });
    Object.defineProperty(dom.window, 'acquireVsCodeApi', {
      value: () => ({
        postMessage: (message: unknown) => posted.push(message),
        getState: () => undefined,
        setState: () => undefined,
      }),
    });
    dom.window.eval(readFileSync('media/chat.js', 'utf8'));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: 'recovery/state',
        recovery: {
          available: true,
          phase: 'pendingReview',
          fileCount: 2,
          mcpCount: 1,
          canResume: true,
        },
      },
    }));

    const recovery = dom.window.document.getElementById('recovery');
    expect(recovery?.hidden).toBe(false);
    expect(recovery?.textContent).toContain('Nothing will run automatically');
    const buttons = [...recovery!.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Review pending', 'Resume', 'Discard']);
    buttons[0]!.click();
    expect(posted).toContainEqual({ type: 'recovery/review' });
  });

  it('renders stale-patch regeneration as an explicit action', () => {
    const posted: unknown[] = [];
    dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' });
    Object.defineProperty(dom.window, 'acquireVsCodeApi', {
      value: () => ({
        postMessage: (message: unknown) => posted.push(message),
        getState: () => undefined,
        setState: () => undefined,
      }),
    });
    dom.window.eval(readFileSync('media/chat.js', 'utf8'));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'changeset/stale', paths: ['src/a.ts'], message: 'Workspace changed.' },
    }));
    const button = [...dom.window.document.querySelectorAll('button')]
      .find((item) => item.textContent === 'Regenerate stale patches');
    expect(button).toBeDefined();
    button!.click();
    expect(posted).toContainEqual({ type: 'changeset/regenerate-stale' });
  });
});
