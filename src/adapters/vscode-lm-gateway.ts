import * as vscode from 'vscode';
import { CopilotGateway } from '../app/copilot-gateway';
import type { CancelToken, DisposableLike, LanguageModelPort, LmModel } from '../app/ports';
import type { CopilotStatus, PromptMessage } from '../protocol/messages';
import { COPILOT_JUSTIFICATION } from '../app/copy';

class VsCodeLmModel implements LmModel {
  constructor(readonly inner: vscode.LanguageModelChat) {}

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
    messages: PromptMessage[],
    options: { justification: string },
    token: CancelToken,
  ): Promise<{ text: AsyncIterable<string> }> {
    const cts = new vscode.CancellationTokenSource();
    token.onCancellationRequested(() => cts.cancel());
    const response = await this.inner.sendRequest(
      messages.map(toVsCodeMessage),
      { justification: options.justification || COPILOT_JUSTIFICATION },
      cts.token,
    );
    return { text: response.text };
  }
}

function toVsCodeMessage(message: PromptMessage): vscode.LanguageModelChatMessage {
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
): CopilotGateway {
  return new CopilotGateway(new VsCodeLanguageModelPort(context.languageModelAccessInformation), onStatus);
}
