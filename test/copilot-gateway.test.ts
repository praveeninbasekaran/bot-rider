import { describe, expect, it } from 'vitest';
import { CopilotGateway, mapCopilotError } from '../src/app/copilot-gateway';
import type { LanguageModelPort, LmModel, CancelToken } from '../src/app/ports';
import type { PromptMessage } from '../src/protocol/messages';
import { COPILOT_JUSTIFICATION } from '../src/app/copy';

class FakeLm implements LanguageModelPort {
  selectCalls = 0;
  models: LmModel[] = [];
  can: boolean | undefined = true;
  private readonly modelLs = new Set<() => void>();
  private readonly accessLs = new Set<() => void>();
  lastOptions: { justification: string } | undefined;

  async selectChatModels(selector: { vendor: 'copilot' }): Promise<LmModel[]> {
    this.selectCalls += 1;
    expect(selector).toEqual({ vendor: 'copilot' });
    return this.models.filter((m) => m.vendor === 'copilot');
  }

  canSendRequest(_model: LmModel): boolean | undefined {
    return this.can;
  }

  onDidChangeChatModels(listener: () => void) {
    this.modelLs.add(listener);
    return { dispose: () => this.modelLs.delete(listener) };
  }

  onDidChangeAccess(listener: () => void) {
    this.accessLs.add(listener);
    return { dispose: () => this.accessLs.delete(listener) };
  }

  fireModels(): void {
    for (const l of this.modelLs) {
      l();
    }
  }

  fireAccess(): void {
    for (const l of this.accessLs) {
      l();
    }
  }
}

function model(overrides: Partial<LmModel> = {}): LmModel {
  return {
    vendor: 'copilot',
    maxInputTokens: 1000,
    countTokens: async () => 1,
    sendRequest: async (messages: PromptMessage[], options: { justification: string }, _token: CancelToken) => {
      void messages;
      void _token;
      return { text: (async function* () { yield 'ok'; })() };
    },
    ...overrides,
  };
}

describe('CopilotGateway status', () => {
  it('does not treat startup empty list as missing until both events settle', async () => {
    const lm = new FakeLm();
    const statuses: string[] = [];
    const gw = new CopilotGateway(lm, (s) => statuses.push(s));
    expect(gw.status).toBe('settling');
    expect(lm.selectCalls).toBe(0);
    lm.fireModels();
    expect(gw.status).toBe('settling');
    lm.fireAccess();
    await Promise.resolve();
    expect(gw.settled).toBe(true);
    expect(gw.status).toBe('missing');
    expect(statuses).toEqual(['missing']);
    expect(lm.selectCalls).toBe(0);
  });

  it('recheck selectChatModels uses vendor copilot only and maps noPermissions', async () => {
    const lm = new FakeLm();
    const captured: { justification: string }[] = [];
    lm.models = [
      model({
        sendRequest: async (_m, options) => {
          captured.push(options);
          return { text: (async function* () { yield 'x'; })() };
        },
      }),
    ];
    lm.can = false;
    const gw = new CopilotGateway(lm);
    const status = await gw.ensureAvailable();
    expect(status).toBe('noPermissions');
    expect(lm.selectCalls).toBe(1);
    lm.can = true;
    expect(await gw.ensureAvailable()).toBe('ready');
    await gw.stream(
      [{ role: 'user', content: 'hi' }],
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) },
      () => undefined,
    );
    expect(captured[0]).toEqual({ justification: COPILOT_JUSTIFICATION });
    expect('tools' in captured[0]!).toBe(false);
  });

  it('maps language-model errors onto CopilotStatus', () => {
    expect(mapCopilotError({ code: 'NoPermissions' })).toBe('noPermissions');
    expect(mapCopilotError({ code: 'NotFound' })).toBe('notFound');
    expect(mapCopilotError({ code: 'Blocked' })).toBe('blocked');
    expect(mapCopilotError({ message: 'off_topic' })).toBe('offTopic');
    expect(mapCopilotError({ message: 'quota exceeded' })).toBe('quota');
    expect(mapCopilotError({ message: 'rate limit' })).toBe('quota');
    expect(mapCopilotError({ message: 'boom' })).toBe('streamFailed');
  });
});
