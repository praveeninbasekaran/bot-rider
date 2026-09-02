import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Application } from '../src/app/application';
import { COPY } from '../src/app/copy';
import { resolveProposedOpen } from '../src/app/deliverable-open';
import { inferChangeKind } from '../src/domain/changeset';
import { filesToPreview } from '../src/protocol/messages';
import type { HostToUi } from '../src/protocol/messages';
import {
  changesetFence,
  configuredMcp,
  defaultWorkspace,
  FakeGateway,
  FixedWorkspace,
  MemoryFs,
  MemoryStore,
} from './fakes';

function harness(mcp?: import('../src/app/mcp-gateway').McpGateway) {
  const gw = new FakeGateway();
  const fs = new MemoryFs();
  const msgs: HostToUi[] = [];
  const app = new Application(
    new MemoryStore(),
    gw,
    fs,
    fs,
    new FixedWorkspace(defaultWorkspace),
    (m) => msgs.push(m),
    undefined,
    undefined,
    mcp,
  );
  return { app, gw, fs, msgs };
}

async function twoBots(app: Application) {
  await app.createBot({ name: 'Alpha', handle: 'alpha', persona: 'a', role: 'lead', instructions: 'one' });
  await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
}

function agreeThen(gw: FakeGateway, implementer: string | ((info: { instruction: string }) => string)) {
  gw.script = ({ turn, instruction }) => {
    if (turn === 'consensus') {
      return 'AGREE ship it';
    }
    if (turn === 'implement') {
      return typeof implementer === 'function' ? implementer({ instruction }) : implementer;
    }
    return 'talk';
  };
}

function isZip(bytes: Uint8Array | undefined): boolean {
  return !!bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function lastAsk(msgs: HostToUi[]): string {
  const ended = [...msgs].reverse().find((m) => m.type === 'chat/turn-end' && m.turn !== 'implement');
  return ended && ended.type === 'chat/turn-end' ? (ended.text ?? '') : '';
}

function previewFiles(msgs: HostToUi[]) {
  const preview = [...msgs].reverse().find((m) => m.type === 'changeset/preview');
  return preview && preview.type === 'changeset/preview' ? preview.files : [];
}

const detectSrc = readFileSync(join(__dirname, '../src/app/deliverable-detect.ts'), 'utf8');
const builderSrc = readFileSync(join(__dirname, '../src/app/deliverable-builder.ts'), 'utf8');
const reviewSrc = readFileSync(join(__dirname, '../src/adapters/review-tree.ts'), 'utf8');
const chatJs = readFileSync(join(__dirname, '../media/chat.js'), 'utf8');

describe('SD-1–4 host emit', () => {
  it('bare write a report asks and creates no html or Office file; composer stays enabled', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    agreeThen(gw, changesetFence([{ path: 'sneak.html', op: 'create', content: '<html></html>' }]));
    await app.send('write a report');
    expect(gw.turns.includes('implement')).toBe(false);
    expect(app.changesets.hasPending()).toBe(false);
    const ask = lastAsk(msgs);
    expect(ask).toContain('Word');
    expect(ask).toContain('Excel');
    expect(ask).toContain('PowerPoint');
    expect(ask).toContain('HTML');
    const state = app.orchestrator.getRunState();
    expect(state.deliverableAsk).toBe(true);
    expect(state.splitOpen).toBe(false);
    expect(state.debateRunning).toBe(false);
    expect(previewFiles(msgs).some((f) => /\.(html|docx|xlsx|pptx)$/i.test(f.path))).toBe(false);
  });

  it('Word file of the Q3 plan with three sections creates one OOXML docx and does not ask', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    agreeThen(gw, (info) => {
      expect(info.instruction).toContain(COPY.deliverableImplementerExtra);
      expect(info.instruction).not.toMatch(/UEsDB|PK\u0003\u0004/);
      return changesetFence([
        {
          path: 'q3-plan.docx',
          op: 'create',
          format: 'docx',
          title: 'Q3 plan',
          outline: ['Goals', 'Risks', 'Next'],
        },
        { path: 'extra.html', op: 'create', format: 'html', title: 'nope', outline: ['x'] },
      ]);
    });
    await app.send('Word file of the Q3 plan with three sections');
    expect(gw.turns.filter((t) => t === 'implement')).toHaveLength(1);
    expect(app.orchestrator.getRunState().deliverableAsk).toBeFalsy();
    const files = app.changesets.files ?? [];
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toMatch(/\.docx$/);
    expect(files[0]?.kind).toBe('office-binary');
    expect(isZip(files[0]?.binary)).toBe(true);
    expect(new TextDecoder().decode(files[0]!.binary!)).not.toMatch(/^# /);
    expect(new TextDecoder().decode(files[0]!.binary!)).not.toContain('vbaProject.bin');
    expect(previewFiles(msgs)[0]?.kind).toBe('office-binary');
    expect(lastAsk(msgs)).not.toBe(COPY.deliverableAskBoth);
  });

  it('Excel and PowerPoint of the same plan creates two real files and not a third html', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    agreeThen(
      gw,
      changesetFence([
        { path: 'plan.xlsx', op: 'create', format: 'xlsx', title: 'plan', outline: ['Sheet'] },
        { path: 'plan.pptx', op: 'create', format: 'pptx', title: 'plan', outline: ['Slide'] },
        { path: 'plan.html', op: 'create', format: 'html', title: 'plan', outline: ['Page'] },
      ]),
    );
    await app.send('Excel and PowerPoint of the same plan');
    const files = app.changesets.files ?? [];
    expect(files.map((f) => f.path.replace(/.*\./, '.')).sort()).toEqual(['.pptx', '.xlsx']);
    expect(files.every((f) => f.kind === 'office-binary' && isZip(f.binary))).toBe(true);
    expect(files.some((f) => f.path.endsWith('.html'))).toBe(false);
  });

  it('named HTML creates .html and Open is a preview titled {filename} (Proposed)', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    agreeThen(
      gw,
      changesetFence([{ path: 'brief.html', op: 'create', format: 'html', title: 'Brief', outline: ['One'] }]),
    );
    await app.send('HTML page of the Q3 plan with three sections');
    const file = app.changesets.files?.[0];
    expect(file?.path).toMatch(/\.html$/);
    expect(file?.kind).toBe('html-preview');
    expect(file?.content).toMatch(/<!DOCTYPE html>/i);
    const open = resolveProposedOpen(file!);
    expect(open.mode).toBe('html-preview');
    if (open.mode === 'html-preview') {
      const name = file!.path.split('/').pop()!;
      expect(open.title).toBe(`${name} (Proposed)`);
    }
  });

  it('Office Open does not call vscode.diff', () => {
    const plan = resolveProposedOpen({
      path: 'q3-plan.docx',
      op: 'create',
      kind: 'office-binary',
      binary: new Uint8Array([0x50, 0x4b]),
    });
    expect(plan.mode).toBe('office-inspect');
    if (plan.mode === 'office-inspect') {
      expect(plan.message).toBe('q3-plan.docx · new Word file');
    }
    expect(reviewSrc).toMatch(/plan\.mode === 'office-inspect'/);
    const inspectBlock = reviewSrc.slice(reviewSrc.indexOf("plan.mode === 'office-inspect'"));
    const nextDiff = inspectBlock.indexOf("executeCommand('vscode.diff'");
    const inspectReturn = inspectBlock.indexOf('return;');
    expect(inspectReturn).toBeGreaterThan(-1);
    expect(nextDiff === -1 || inspectReturn < nextDiff).toBe(true);
  });

  it('changeset/approve writes office bytes; Reject drops the create; no extra MCP invoke', async () => {
    const { port, mcp } = configuredMcp(() => undefined);
    const { app, gw, fs } = harness(mcp);
    await twoBots(app);
    agreeThen(
      gw,
      changesetFence([
        { path: 'q3-plan.docx', op: 'create', format: 'docx', title: 'Q3', outline: ['A', 'B', 'C'] },
      ]),
    );
    await app.send('Word file of the Q3 plan with three sections');
    const pending = app.changesets.files?.[0];
    expect(isZip(pending?.binary)).toBe(true);
    const invokesBefore = port.invokeCalls.length;
    const ok = await app.approve();
    expect(ok).toBe(true);
    expect(isZip(fs.binaries.get('q3-plan.docx'))).toBe(true);
    expect(port.invokeCalls.length).toBe(invokesBefore);
    expect(app.changesets.hasPending()).toBe(false);

    app.changesets.setPending([
      { path: 'dropped.docx', op: 'create', kind: 'office-binary', binary: new Uint8Array([0x50, 0x4b, 3, 4]) },
    ]);
    await app.reject();
    expect(fs.binaries.has('dropped.docx')).toBe(false);
    expect(app.changesets.hasPending()).toBe(false);
    expect(port.invokeCalls.length).toBe(invokesBefore);
  });

  it('implementer JSON has no zip bytes; builder is host-side', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    let implementerText = '';
    agreeThen(gw, ({ instruction }) => {
      expect(instruction).toContain('Do not emit zip');
      implementerText = changesetFence([
        { path: 'q3-plan.docx', op: 'create', format: 'docx', title: 'Q3', outline: ['A'] },
      ]);
      return implementerText;
    });
    await app.send('Word file of the Q3 plan with three sections');
    expect(implementerText).not.toMatch(/PK/);
    expect(implementerText).not.toMatch(/UEsDB/);
    expect(isZip(app.changesets.files?.[0]?.binary)).toBe(true);
    expect(builderSrc).not.toContain('vbaProject.bin');
  });

  it('IE html snapshot is used only when that bot already attached html and format is html', async () => {
    const { app, gw } = harness();
    const snapshot = '<!DOCTYPE html><html><body><p>IE-ALREADY-ATTACHED</p></body></html>';
    await app.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'a',
      role: 'lead',
      instructions: 'one',
      attachments: [{ path: 'notes.html', name: 'notes.html', snapshot }],
    });
    await app.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
    agreeThen(
      gw,
      changesetFence([{ path: 'page.html', op: 'create', format: 'html', title: 'Page', outline: ['One'] }]),
    );
    await app.send('HTML page of the Q3 plan with three sections');
    expect(app.changesets.files?.[0]?.content).toContain('IE-ALREADY-ATTACHED');
    expect(gw.turns.filter((t) => t === 'implement')).toHaveLength(1);

    const { app: app2, gw: gw2, fs } = harness();
    await app2.createBot({
      name: 'Alpha',
      handle: 'alpha',
      persona: 'a',
      role: 'lead',
      instructions: 'one',
      attachments: [{ path: 'notes.html', name: 'notes.html', snapshot }],
    });
    await app2.createBot({ name: 'Beta', handle: 'beta', persona: 'b', role: 'review', instructions: 'two' });
    agreeThen(
      gw2,
      changesetFence([{ path: 'plan.docx', op: 'create', format: 'docx', title: 'Plan', outline: ['One'] }]),
    );
    await app2.send('Word file of the Q3 plan with three sections');
    const zipText = new TextDecoder().decode(app2.changesets.files?.[0]?.binary ?? new Uint8Array());
    expect(zipText).not.toContain('IE-ALREADY-ATTACHED');
    expect(fs.readTextCalls.includes('notes.html')).toBe(false);
  });

  it('detect source has no sendRequest', () => {
    expect(detectSrc).not.toMatch(/\.sendRequest\s*\(/);
  });

  it('Split-open does not ask; after Continue with missing format the Swarm asks and composer is enabled', async () => {
    const { app, gw, msgs } = harness();
    await twoBots(app);
    gw.script = ({ turn, instruction }) => {
      const round = Number((instruction.match(/Round (\d+)/) || [])[1] || 1);
      if (turn === 'consensus') {
        return round >= 3 ? 'AGREE' : 'DISSENT';
      }
      if (turn === 'implement') {
        return changesetFence([{ path: 'x.html', op: 'create', content: 'nope' }]);
      }
      return 'talk';
    };
    await app.send('write a report');
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    expect(app.orchestrator.getRunState().deliverableAsk).toBeFalsy();
    expect(app.changesets.hasPending()).toBe(false);
    expect(gw.turns.includes('implement')).toBe(false);
    msgs.length = 0;
    await app.continueDebate();
    expect(app.orchestrator.getRunState().splitOpen).toBe(false);
    expect(app.orchestrator.getRunState().deliverableAsk).toBe(true);
    expect(app.orchestrator.getRunState().debateRunning).toBe(false);
    expect(lastAsk(msgs)).toContain('Word');
    expect(app.changesets.hasPending()).toBe(false);
    expect(gw.turns.includes('implement')).toBe(false);
  });

  it('answer after ask with format and outline runs implementer once; second missing answer stops', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    agreeThen(
      gw,
      changesetFence([{ path: 'q3-plan.docx', op: 'create', format: 'docx', title: 'Q3', outline: ['A'] }]),
    );
    await app.send('write a report');
    expect(app.orchestrator.getRunState().deliverableAsk).toBe(true);
    await app.send('Word file of the Q3 plan with three sections');
    expect(app.changesets.files?.[0]?.path).toMatch(/\.docx$/);
    expect(gw.turns.filter((t) => t === 'implement')).toHaveLength(1);

    const { app: app2, gw: gw2 } = harness();
    await twoBots(app2);
    agreeThen(gw2, changesetFence([{ path: 'nope.html', op: 'create', content: 'x' }]));
    await app2.send('write a report');
    await app2.send('still not sure');
    expect(app2.orchestrator.getRunState().deliverableAsk).toBe(true);
    await app2.send('still missing');
    expect(app2.changesets.hasPending()).toBe(false);
    expect(app2.orchestrator.getRunState().deliverableAsk).toBeFalsy();
    expect(gw2.turns.includes('implement')).toBe(false);
  });

  it('infers kind when omitted and keeps composer unlock for deliverableAsk in chrome', () => {
    expect(inferChangeKind({ path: 'a.html', op: 'create' })).toBe('html-preview');
    expect(inferChangeKind({ path: 'a.docx', op: 'create' })).toBe('office-binary');
    expect(inferChangeKind({ path: 'a.ts', op: 'create' })).toBe('text');
    const preview = filesToPreview([{ path: 'a.pptx', op: 'create' }]);
    expect(preview[0]?.kind).toBe('office-binary');
    expect(chatJs).toContain('deliverableAsk');
    expect(chatJs).toContain('!!state.splitOpen || (!!state.debateRunning && !deliverableAsk)');
  });

  it('Vote / Split / Stop never build a deliverable', async () => {
    const { app, gw } = harness();
    await twoBots(app);
    gw.script = ({ turn }) => {
      if (turn === 'propose') {
        return 'talking';
      }
      return 'talk';
    };
    let release!: () => void;
    gw.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const done = app.send('write a report');
    await vi.waitFor(() => {
      expect(gw.requestCount).toBeGreaterThan(1);
    });
    app.stop();
    release();
    await done;
    expect(app.changesets.hasPending()).toBe(false);
    expect(app.orchestrator.getRunState().splitOpen).toBe(true);
    expect(gw.turns.includes('implement')).toBe(false);
  });
});
