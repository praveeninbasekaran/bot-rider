import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const protocol = readFileSync(join(root, 'src/protocol/messages.ts'), 'utf8');
const hub = readFileSync(join(root, 'src/adapters/chat-view.ts'), 'utf8');
const extension = readFileSync(join(root, 'src/extension.ts'), 'utf8');
const chat = readFileSync(join(root, 'media/chat.js'), 'utf8');
const expanded = readFileSync(join(root, 'src/adapters/chat-expand-panel.ts'), 'utf8');

describe('PU-2 Swarm transcript replay wiring', () => {
  it('defines and emits one host-owned transcript snapshot', () => {
    expect(protocol).toContain("type: 'chat/transcript-snapshot'");
    expect(hub).toContain('bindThread(thread: ThreadStore)');
    expect(hub).toContain("type: 'chat/transcript-snapshot', snapshot: this.thread.snapshot()");
    expect(extension).toContain('hub.bindThread(app.thread)');
  });

  it('uses the same ChatHub for sidebar and expanded Swarm', () => {
    expect(extension).toContain("new ChatViewProvider(context.extensionUri, hub)");
    expect(extension).toContain('new ChatExpandPanel(context.extensionUri, hub');
    expect(expanded).toContain('this.hub.attach(this.panel.webview)');
  });

  it('rebuilds ordered transcript and recoverable state idempotently', () => {
    expect(chat).toContain("msg.type === 'chat/transcript-snapshot'");
    expect(chat).toContain('function restoreTranscript(snapshot)');
    expect(chat).toContain('thread.replaceChildren()');
    expect(chat).toContain('Number(a.sequence || 0) - Number(b.sequence || 0)');
    expect(chat).toContain("entry.kind === 'user'");
    expect(chat).toContain("entry.kind === 'bot'");
    expect(chat).toContain("entry.kind === 'notice'");
    expect(chat).toContain("entry.kind === 'error'");
    expect(chat).toContain('showSplit(data.split)');
    expect(chat).toContain('showFiles(data.pendingFiles)');
    expect(chat).toContain('showMcpActions(data.pendingMcpActions || [])');
    expect(chat).toContain('paintBoard(state.board)');
  });

  it('restores partial bot output as an active flight', () => {
    expect(chat).toContain('function appendSnapshotBot(entry)');
    expect(chat).toContain('if (entry.complete)');
    expect(chat).toContain('state.flights[entry.botId] = flight');
    expect(chat).toContain('flight.stream.textContent = entry.text');
  });

  it('renders a submitted user message immediately and only once', () => {
    const sendStart = chat.indexOf('function sendNow()');
    const sendEnd = chat.indexOf('function esc', sendStart);
    const sendBlock = chat.slice(sendStart, sendEnd);
    expect(sendBlock).toContain("vscode.postMessage({ type: 'chat/send'");
    expect(sendBlock).toContain('appendUser(input.value)');
    expect(sendBlock.match(/appendUser\(input\.value\)/g)).toHaveLength(1);
  });
});
