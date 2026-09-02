import type { TurnKind } from '../domain/run-state';
import { normalizeModelId } from '../domain/bot';
import type { HostToUi } from '../protocol/messages';
import type { DisposableLike, LanguageModelPort, LmModel } from './ports';

export type BotModelsStatus = 'loading' | 'ready' | 'unavailable';

export interface CopilotModelOption {
  id: string;
  label: string;
}

export interface FormModelsWatch extends DisposableLike {
  refresh(): void;
}

export function usesPerBotModel(turn: TurnKind): boolean {
  return turn !== 'consensus';
}

export function shortIdTail(id: string): string {
  const slash = id.lastIndexOf('/');
  return slash >= 0 ? id.slice(slash + 1) : id;
}

export function copilotModelLabel(
  model: { id: string; name?: string; family?: string },
  familyCounts: Map<string, number>,
): string {
  const name = model.name?.trim();
  if (name) {
    return name;
  }
  const family = model.family?.trim();
  if (family) {
    const ambiguous = (familyCounts.get(family) ?? 0) > 1;
    if (ambiguous) {
      return `${family} · ${shortIdTail(model.id)}`;
    }
    return family;
  }
  return model.id;
}

export async function discoverCopilotModels(lm: LanguageModelPort): Promise<LmModel[]> {
  const selected = await lm.selectChatModels({ vendor: 'copilot' });
  return selected.filter((model) => model.vendor === 'copilot');
}

export function buildCopilotModelOptions(models: LmModel[]): CopilotModelOption[] {
  const familyCounts = new Map<string, number>();
  for (const model of models) {
    const family = model.family?.trim();
    if (family) {
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    }
  }
  return models.map((model) => ({
    id: model.id,
    label: copilotModelLabel(model, familyCounts),
  }));
}

export function botsModelsMessage(
  models: CopilotModelOption[],
  savedModelId: string | null | undefined,
  status: BotModelsStatus,
): Extract<HostToUi, { type: 'bots/models' }> {
  if (status === 'loading') {
    return { type: 'bots/models', models: [], selectedId: null, status: 'loading' };
  }
  if (status === 'unavailable' || models.length === 0) {
    return { type: 'bots/models', models: [], selectedId: null, status: 'unavailable' };
  }
  const saved = normalizeModelId(savedModelId);
  const selectedId = saved && models.some((model) => model.id === saved) ? saved : null;
  return { type: 'bots/models', models, selectedId, status: 'ready' };
}

export function watchFormCopilotModels(args: {
  lm: LanguageModelPort;
  savedModelId?: string | null;
  emit: (msg: HostToUi) => void;
}): FormModelsWatch {
  let closed = false;
  let gen = 0;

  const refresh = (): void => {
    const my = ++gen;
    args.emit(botsModelsMessage([], args.savedModelId, 'loading'));
    void discoverCopilotModels(args.lm)
      .then((copilot) => {
        if (closed || my !== gen) {
          return;
        }
        const options = buildCopilotModelOptions(copilot);
        const status: BotModelsStatus = options.length > 0 ? 'ready' : 'unavailable';
        args.emit(botsModelsMessage(options, args.savedModelId, status));
      })
      .catch(() => {
        if (closed || my !== gen) {
          return;
        }
        args.emit(botsModelsMessage([], args.savedModelId, 'unavailable'));
      });
  };

  refresh();
  const sub = args.lm.onDidChangeChatModels(() => {
    if (!closed) {
      refresh();
    }
  });

  return {
    refresh,
    dispose() {
      closed = true;
      sub.dispose();
    },
  };
}
