import * as vscode from 'vscode';
import { CopilotGateway } from '../app/copilot-gateway';
import type { McpGateway } from '../app/mcp-gateway';
import type {
  CancelToken,
  DisposableLike,
  LanguageModelPort,
  LmChatMessage,
  LmModel,
  LmSendOptions,
  LmStreamPart,
} from '../app/ports';
import type { CopilotStatus, PromptMessage } from '../protocol/messages';
import { COPILOT_JUSTIFICATION } from '../app/copy';

class VsCodeLmModel implements LmModel {
  constructor(readonly inner: vscode.LanguageModelChat) {}

  get id(): string {
    return this.inner.id;
  }

  get name(): string | undefined {
    const name = this.inner.name;
    return name && name.trim() ? name : undefined;
  }

  get family(): string | undefined {
    const value = this.inner.family;
    return value && value.trim() ? value : undefined;
  }

  get vendor(): string {
    return this.inner.vendor;
  }

  get maxInputTokens(): number {
    return this.inner.maxInputTokens;
  }

  async countTokens(messages: PromptMessage[]): Promise<number> {
    let total = 0;
    for (const message of messages) {
      total += await this.inner.countTokens(toVsCodeMessage(message));
    }
    return total;
  }

  async sendRequest(
    messages: LmChatMessage[],
    options: LmSendOptions,
    token: CancelToken,
  ): Promise<{ text: AsyncIterable<string>; stream: AsyncIterable<LmStreamPart> }> {
    const cts = new vscode.CancellationTokenSource();
    token.onCancellationRequested(() => cts.cancel());
    const requestOptions: vscode.LanguageModelChatRequestOptions = {
      justification: options.justification || COPILOT_JUSTIFICATION,
    };
    if (options.tools) {
      requestOptions.tools = options.tools;
    }
    const response = await this.inner.sendRequest(messages.map(toVsCodeMessage), requestOptions, cts.token);
    return { text: response.text, stream: mapStream(response.stream) };
  }
}

async function* mapStream(
  stream: AsyncIterable<unknown>,
): AsyncIterable<LmStreamPart> {
  for await (const part of stream) {
    if (isToolCallPart(part)) {
      yield { kind: 'tool-call', callId: part.callId, name: part.name, input: part.input ?? {} };
    } else if (isTextPart(part)) {
      yield { kind: 'text', value: part.value };
    }
  }
}

function isTextPart(part: unknown): part is { value: string } {
  return (
    !!part &&
    typeof part === 'object' &&
    'value' in part &&
    typeof (part as { value: unknown }).value === 'string' &&
    !('callId' in part)
  );
}

function isToolCallPart(part: unknown): part is { callId: string; name: string; input: object } {
  return (
    !!part &&
    typeof part === 'object' &&
    typeof (part as { callId?: unknown }).callId === 'string' &&
    typeof (part as { name?: unknown }).name === 'string'
  );
}

function toVsCodeMessage(message: LmChatMessage): vscode.LanguageModelChatMessage {
  if ('toolCalls' in message) {
    const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = [];
    if (message.content) {
      parts.push(new vscode.LanguageModelTextPart(message.content));
    }
    for (const call of message.toolCalls) {
      parts.push(new vscode.LanguageModelToolCallPart(call.callId, call.name, call.input));
    }
    return vscode.LanguageModelChatMessage.Assistant(parts);
  }
  if ('toolResults' in message) {
    const parts = message.toolResults.map(
      (result) =>
        new vscode.LanguageModelToolResultPart(result.callId, [new vscode.LanguageModelTextPart(result.content)]),
    );
    return vscode.LanguageModelChatMessage.User(parts);
  }
  if (message.role === 'assistant') {
    return vscode.LanguageModelChatMessage.Assistant(message.content, message.handle);
  }
  return vscode.LanguageModelChatMessage.User(message.content);
}

export class VsCodeLanguageModelPort implements LanguageModelPort {
  constructor(private readonly access: vscode.LanguageModelAccessInformation) {}

  async selectChatModels(selector: { vendor: 'copilot' }): Promise<LmModel[]> {
    const models = await vscode.lm.selectChatModels({ vendor: selector.vendor });
    return models.filter((m) => m.vendor === 'copilot').map((m) => new VsCodeLmModel(m));
  }

  canSendRequest(model: LmModel): boolean | undefined {
    if (!(model instanceof VsCodeLmModel)) {
      return undefined;
    }
    return this.access.canSendRequest(model.inner);
  }

  onDidChangeChatModels(listener: () => void): DisposableLike {
    return vscode.lm.onDidChangeChatModels(listener);
  }

  onDidChangeAccess(listener: () => void): DisposableLike {
    return this.access.onDidChange(listener);
  }
}

export function createCopilotGateway(
  context: vscode.ExtensionContext,
  onStatus: (status: CopilotStatus) => void,
  mcp?: McpGateway,
): CopilotGateway {
  return new CopilotGateway(
    new VsCodeLanguageModelPort(context.languageModelAccessInformation),
    onStatus,
    60_000,
    mcp,
  );
}
