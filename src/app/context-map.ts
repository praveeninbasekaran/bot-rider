import type { BotRecord } from '../domain/bot';
import type {
  ContextMapEdge,
  ContextMapNode,
  ContextMapRunPayload,
  ContextMapWorkspacePayload,
  HostToUi,
} from '../protocol/messages';
import type { IsolationPacket } from './bot-session-store';

export type ContextMapFolder = {
  uri: string;
  path: string;
  name: string;
};

export type ContextMapFile = {
  uri: string;
  path: string;
  name: string;
};

export type ContextMapChild = {
  uri: string;
  path: string;
  name: string;
  directory: boolean;
};

export type ContextMapSymbol = {
  name: string;
  kind: string;
  start: { line: number; character: number };
  end: { line: number; character: number };
  children?: ContextMapSymbol[];
};

export interface ContextMapNeighborhood {
  folder(): ContextMapFolder | undefined;
  activeFile(): ContextMapFile | undefined;
  listChildren(folderUri: string): Promise<ContextMapChild[]>;
  fileSymbols(fileUri: string): Promise<ContextMapSymbol[]>;
}

export interface ContextMapActions {
  openUri(
    uri: string,
    range?: { start: { line: number; character: number }; end?: { line: number; character: number } },
  ): Promise<void>;
  revealProposedFile(path: string): Promise<void>;
}

export interface ContextMapRunSource {
  bots(): BotRecord[];
  published(): IsolationPacket[];
  proposedFiles(): { path: string }[];
}

export class EmptyContextMapNeighborhood implements ContextMapNeighborhood {
  folder(): ContextMapFolder | undefined {
    return undefined;
  }
  activeFile(): ContextMapFile | undefined {
    return undefined;
  }
  async listChildren(_folderUri: string): Promise<ContextMapChild[]> {
    return [];
  }
  async fileSymbols(_fileUri: string): Promise<ContextMapSymbol[]> {
    return [];
  }
}

export const noopContextMapActions: ContextMapActions = {
  async openUri() {
    return undefined;
  },
  async revealProposedFile() {
    return undefined;
  },
};

export function emptyWorkspaceGraph(): ContextMapWorkspacePayload {
  return { nodes: [], edges: [] };
}

export function emptyRunGraph(): ContextMapRunPayload {
  return { nodes: [], edges: [] };
}

export function isCodeNode(node: ContextMapNode): boolean {
  return node.kind === 'folder' || node.kind === 'file' || node.kind === 'symbol';
}

export function folderNodeId(uri: string): string {
  return `folder:${uri}`;
}

export function fileNodeId(uri: string): string {
  return `file:${uri}`;
}

export function symbolNodeId(
  uri: string,
  name: string,
  start: { line: number; character: number },
): string {
  return `symbol:${uri}#${name}@${start.line}:${start.character}`;
}

export function botNodeId(botId: string): string {
  return `bot:${botId}`;
}

export function proposedFileNodeId(path: string): string {
  return `proposed:${path.replace(/\\/g, '/')}`;
}

export function packetCanvasLabel(packet: IsolationPacket): string {
  if (packet.at === 'consensus') {
    return 'Consensus';
  }
  if (packet.at === 'pick') {
    return 'Pick';
  }
  return 'Turn';
}

function includesPath(text: string, path: string): boolean {
  return text.includes(path);
}

/** Known workspace code node ids a packet maps to. Omit unknown/stale. */
export function matchCodeNodeIds(packet: IsolationPacket, nodes: ContextMapNode[]): string[] {
  const fields = [...packet.constraints, ...packet.requirements, ...packet.decisions];
  const known = nodes.filter(isCodeNode);
  const ids: string[] = [];
  for (const node of known) {
    if (!node.path) {
      continue;
    }
    const hit = fields.some((field) => includesPath(field, node.path!));
    if (!hit) {
      continue;
    }
    if (node.kind === 'symbol' && !fields.some((field) => field.includes(node.label))) {
      continue;
    }
    if (!ids.includes(node.id)) {
      ids.push(node.id);
    }
  }
  return ids;
}

export function retainKnownNodeIds(ids: string[] | undefined, knownIds: Iterable<string>): string[] | undefined {
  if (!ids?.length) {
    return undefined;
  }
  const known = new Set(knownIds);
  const kept = ids.filter((id) => known.has(id));
  return kept.length > 0 ? kept : undefined;
}

function upsertNode(nodes: ContextMapNode[], node: ContextMapNode): void {
  const index = nodes.findIndex((n) => n.id === node.id);
  if (index >= 0) {
    nodes[index] = node;
    return;
  }
  nodes.push(node);
}

function addEdge(edges: ContextMapEdge[], edge: ContextMapEdge): void {
  if (edges.some((e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind)) {
    return;
  }
  edges.push(edge);
}

function addSymbols(
  file: ContextMapNode,
  symbols: ContextMapSymbol[],
  nodes: ContextMapNode[],
  edges: ContextMapEdge[],
  parentId = file.id,
): void {
  for (const symbol of symbols) {
    const node: ContextMapNode = {
      id: symbolNodeId(file.uri ?? file.id, symbol.name, symbol.start),
      kind: 'symbol',
      label: symbol.name,
      path: file.path,
      uri: file.uri,
      start: symbol.start,
      end: symbol.end,
      symbolKind: symbol.kind,
    };
    upsertNode(nodes, node);
    addEdge(edges, { from: parentId, to: node.id, kind: 'contains' });
    if (symbol.children?.length) {
      addSymbols(file, symbol.children, nodes, edges, node.id);
    }
  }
}

export class ContextMapHost {
  lastWorkspace: ContextMapWorkspacePayload = emptyWorkspaceGraph();
  lastRun: ContextMapRunPayload = emptyRunGraph();

  constructor(
    private readonly emit: (msg: HostToUi) => void,
    private readonly neighborhood: ContextMapNeighborhood,
    private readonly run: ContextMapRunSource,
    private readonly actions: ContextMapActions = noopContextMapActions,
  ) {}

  knownCodeNodeIds(): string[] {
    return this.lastWorkspace.nodes.filter(isCodeNode).map((n) => n.id);
  }

  nodeIdsFor(packet: IsolationPacket, extraCandidates: string[] = []): string[] | undefined {
    const matched = matchCodeNodeIds(packet, this.lastWorkspace.nodes);
    const known = this.knownCodeNodeIds();
    return retainKnownNodeIds([...matched, ...extraCandidates], known);
  }

  postLast(): void {
    this.emitWorkspace(this.lastWorkspace);
    this.emitRun(this.lastRun);
  }

  clearRun(): void {
    this.lastRun = emptyRunGraph();
    this.emitRun(this.lastRun);
  }

  syncRun(): void {
    this.lastRun = this.buildRun();
    this.emitRun(this.lastRun);
  }

  async onViewVisible(): Promise<void> {
    await this.refreshWorkspace();
    this.emitRun(this.lastRun);
  }

  async refreshWorkspace(): Promise<ContextMapWorkspacePayload> {
    const folder = this.neighborhood.folder();
    if (!folder) {
      this.lastWorkspace = emptyWorkspaceGraph();
      this.emitWorkspace(this.lastWorkspace);
      return this.lastWorkspace;
    }

    const nodes: ContextMapNode[] = [];
    const edges: ContextMapEdge[] = [];
    upsertNode(nodes, {
      id: folderNodeId(folder.uri),
      kind: 'folder',
      label: folder.name,
      path: folder.path,
      uri: folder.uri,
    });

    const active = this.neighborhood.activeFile();
    let scopeHint: string | undefined;
    let focusUri: string | undefined;
    if (active) {
      const file: ContextMapNode = {
        id: fileNodeId(active.uri),
        kind: 'file',
        label: active.name,
        path: active.path,
        uri: active.uri,
      };
      upsertNode(nodes, file);
      const symbols = await this.safeSymbols(active.uri);
      addSymbols(file, symbols, nodes, edges);
      scopeHint = active.name;
      focusUri = active.uri;
    }

    this.lastWorkspace = { nodes, edges, scopeHint, focusUri };
    this.emitWorkspace(this.lastWorkspace);
    return this.lastWorkspace;
  }

  async expandFile(uri: string): Promise<ContextMapWorkspacePayload> {
    const existing = this.lastWorkspace.nodes.find((n) => n.uri === uri);
    const nodes = this.lastWorkspace.nodes.map((n) => ({ ...n }));
    const edges = this.lastWorkspace.edges.map((e) => ({ ...e }));

    if (existing?.kind === 'folder') {
      const children = await this.safeChildren(uri);
      const parentId = existing.id;
      for (const child of children) {
        const node: ContextMapNode = child.directory
          ? {
              id: folderNodeId(child.uri),
              kind: 'folder',
              label: child.name,
              path: child.path,
              uri: child.uri,
            }
          : {
              id: fileNodeId(child.uri),
              kind: 'file',
              label: child.name,
              path: child.path,
              uri: child.uri,
            };
        upsertNode(nodes, node);
        addEdge(edges, { from: parentId, to: node.id, kind: 'contains' });
      }
    } else {
      const file =
        existing?.kind === 'file'
          ? existing
          : nodes.find((n) => n.kind === 'file' && n.uri === uri) ??
            {
              id: fileNodeId(uri),
              kind: 'file' as const,
              label: uri.split('/').filter(Boolean).pop() ?? uri,
              uri,
            };
      upsertNode(nodes, file);
      const symbols = await this.safeSymbols(uri);
      addSymbols(file, symbols, nodes, edges);
    }

    this.lastWorkspace = {
      nodes,
      edges,
      scopeHint: this.lastWorkspace.scopeHint,
      focusUri: this.lastWorkspace.focusUri,
    };
    this.emitWorkspace(this.lastWorkspace);
    return this.lastWorkspace;
  }

  async select(nodeId: string): Promise<void> {
    const node = this.findNode(nodeId);
    if (node?.kind === 'proposedFile' && node.path) {
      await this.actions.revealProposedFile(node.path);
    }
  }

  async open(nodeId: string): Promise<void> {
    const node = this.findNode(nodeId);
    if (!node?.uri) {
      return;
    }
    await this.actions.openUri(node.uri, node.start && node.end ? { start: node.start, end: node.end } : undefined);
  }

  private findNode(nodeId: string): ContextMapNode | undefined {
    return (
      this.lastWorkspace.nodes.find((n) => n.id === nodeId) ??
      this.lastRun.nodes.find((n) => n.id === nodeId)
    );
  }

  private buildRun(): ContextMapRunPayload {
    const nodes: ContextMapNode[] = [];
    const edges: ContextMapEdge[] = [];
    const bots = this.run.bots();
    for (const bot of bots) {
      upsertNode(nodes, {
        id: botNodeId(bot.id),
        kind: 'bot',
        label: `@${bot.handle}`,
        handle: bot.handle,
      });
    }
    const published = this.run.published();
    const known = new Set(this.knownCodeNodeIds());
    for (const packet of published) {
      const packetNode: ContextMapNode = {
        id: packet.id,
        kind: 'packet',
        label: packetCanvasLabel(packet),
        packetId: packet.id,
      };
      upsertNode(nodes, packetNode);
      if (packet.fromBotId) {
        addEdge(edges, { from: botNodeId(packet.fromBotId), to: packet.id, kind: 'published' });
      }
      const surviving = retainKnownNodeIds(packet.nodeIds, known);
      if (surviving) {
        for (const id of surviving) {
          addEdge(edges, { from: packet.id, to: id, kind: 'mapsTo' });
        }
      }
    }
    const files = this.run.proposedFiles();
    const implementer = bots[0];
    for (const file of files) {
      const path = file.path.replace(/\\/g, '/');
      const id = proposedFileNodeId(path);
      upsertNode(nodes, {
        id,
        kind: 'proposedFile',
        label: path,
        path,
      });
      if (implementer) {
        addEdge(edges, { from: botNodeId(implementer.id), to: id, kind: 'proposes' });
      }
      for (const packet of published) {
        const fields = [...packet.constraints, ...packet.requirements];
        if (fields.some((field) => includesPath(field, path))) {
          addEdge(edges, { from: packet.id, to: id, kind: 'proposes' });
        }
      }
    }
    return { nodes, edges };
  }

  private emitWorkspace(payload: ContextMapWorkspacePayload): void {
    this.emit({
      type: 'contextMap/workspace',
      nodes: payload.nodes,
      edges: payload.edges,
      ...(payload.scopeHint ? { scopeHint: payload.scopeHint } : {}),
      ...(payload.focusUri ? { focusUri: payload.focusUri } : {}),
    });
  }

  private emitRun(payload: ContextMapRunPayload): void {
    this.emit({ type: 'contextMap/run', nodes: payload.nodes, edges: payload.edges });
  }

  private async safeSymbols(uri: string): Promise<ContextMapSymbol[]> {
    try {
      return await this.neighborhood.fileSymbols(uri);
    } catch {
      return [];
    }
  }

  private async safeChildren(uri: string): Promise<ContextMapChild[]> {
    try {
      return await this.neighborhood.listChildren(uri);
    } catch {
      return [];
    }
  }
}
