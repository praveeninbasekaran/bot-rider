import * as nodePath from 'node:path';

export type RepositoryNodeKind = 'file' | 'symbol' | 'markdown' | 'requirement';

export interface RepositoryNode {
  id: string;
  kind: RepositoryNodeKind;
  label: string;
  path: string;
  text?: string;
}

export interface RepositoryEdge {
  from: string;
  to: string;
  kind: 'contains' | 'imports' | 'calls' | 'documents' | 'task' | 'proposes';
}

export interface RepositoryContextPort {
  listFiles(): Promise<string[]>;
  readText(path: string): Promise<string | undefined>;
}

export interface RepositoryContextResult {
  text: string;
  includedChars: number;
  dropped: string[];
  nodeIds: string[];
}

const CODE_EXT = /\.(?:[cm]?[jt]sx?|py|go|rs|java|cs)$/i;
const MARKDOWN_EXT = /\.(?:md|mdx)$/i;
const IGNORE = /(?:^|\/)(?:node_modules|\.git|dist|out|coverage|[^/]+-out)(?:\/|$)/;

export class RepositoryContextService {
  private nodes: RepositoryNode[] = [];
  private edges: RepositoryEdge[] = [];

  constructor(private readonly port: RepositoryContextPort) {}

  async rebuild(): Promise<void> {
    const files = (await this.port.listFiles())
      .map(normalizePath)
      .filter((path) => !IGNORE.test(path) && (CODE_EXT.test(path) || MARKDOWN_EXT.test(path)))
      .sort();
    const nodes: RepositoryNode[] = [];
    const edges: RepositoryEdge[] = [];
    const symbolsByName = new Map<string, string[]>();
    const imports: { from: string; target: string }[] = [];
    const calls: { from: string; name: string }[] = [];
    for (const path of files) {
      const text = (await this.port.readText(path)) ?? '';
      const fileId = `file:${path}`;
      nodes.push({ id: fileId, kind: 'file', label: path, path });
      if (MARKDOWN_EXT.test(path)) {
        for (const chunk of markdownChunks(path, text)) {
          nodes.push(chunk);
          edges.push({ from: fileId, to: chunk.id, kind: 'contains' });
          for (const requirement of requirementIds(chunk.text ?? '')) {
            const requirementId = `requirement:${requirement}`;
            if (!nodes.some((node) => node.id === requirementId)) {
              nodes.push({ id: requirementId, kind: 'requirement', label: requirement, path });
            }
            edges.push({ from: chunk.id, to: requirementId, kind: 'documents' });
          }
        }
        continue;
      }
      for (const symbol of codeSymbols(path, text)) {
        nodes.push(symbol);
        edges.push({ from: fileId, to: symbol.id, kind: 'contains' });
        const list = symbolsByName.get(symbol.label) ?? [];
        list.push(symbol.id);
        symbolsByName.set(symbol.label, list);
      }
      for (const target of importTargets(text)) {
        imports.push({ from: fileId, target: resolveImportPath(path, target, files) });
      }
      for (const name of callNames(text)) {
        calls.push({ from: fileId, name });
      }
    }
    for (const item of imports) {
      if (item.target) {
        edges.push({ from: item.from, to: `file:${item.target}`, kind: 'imports' });
      }
    }
    for (const call of calls) {
      for (const target of symbolsByName.get(call.name) ?? []) {
        edges.push({ from: call.from, to: target, kind: 'calls' });
      }
    }
    this.nodes = uniqueBy(nodes, (node) => node.id);
    this.edges = uniqueBy(edges, (edge) => `${edge.from}\0${edge.to}\0${edge.kind}`);
  }

  snapshot(): { nodes: RepositoryNode[]; edges: RepositoryEdge[] } {
    return structuredClone({ nodes: this.nodes, edges: this.edges });
  }

  buildContext(args: {
    query: string;
    paths?: readonly string[];
    specIds?: readonly string[];
    maxChars?: number;
  }): RepositoryContextResult {
    const terms = tokenize(`${args.query} ${(args.specIds ?? []).join(' ')}`);
    const wantedPaths = new Set((args.paths ?? []).map(normalizePath));
    const ranked = this.nodes
      .filter((node) => node.kind !== 'requirement')
      .map((node) => ({
        node,
        score:
          (wantedPaths.has(node.path) ? 100 : 0) +
          scoreText(`${node.label} ${node.path} ${node.text ?? ''}`, terms),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.node.id.localeCompare(right.node.id));
    const maxChars = Math.max(0, args.maxChars ?? 6000);
    const lines: string[] = ['Repository context (local index):'];
    const nodeIds: string[] = [];
    const dropped: string[] = [];
    let used = lines[0]!.length;
    for (const item of ranked) {
      const line = item.node.kind === 'markdown'
        ? `[doc ${item.node.path}] ${compact(item.node.text ?? '')}`
        : `[${item.node.kind} ${item.node.path}] ${item.node.label}`;
      if (used + line.length + 1 > maxChars) {
        dropped.push(item.node.id);
        continue;
      }
      lines.push(line);
      nodeIds.push(item.node.id);
      used += line.length + 1;
    }
    return {
      text: nodeIds.length > 0 ? lines.join('\n') : '',
      includedChars: used,
      dropped,
      nodeIds,
    };
  }

  linksFor(args: {
    taskId?: string;
    taskPaths?: readonly string[];
    proposedPaths?: readonly string[];
    specIds?: readonly string[];
  }): RepositoryEdge[] {
    const links: RepositoryEdge[] = [];
    for (const path of args.taskPaths ?? []) {
      links.push({ from: `task:${args.taskId ?? 'current'}`, to: `file:${normalizePath(path)}`, kind: 'task' });
    }
    for (const path of args.proposedPaths ?? []) {
      links.push({ from: `proposal:${normalizePath(path)}`, to: `file:${normalizePath(path)}`, kind: 'proposes' });
    }
    for (const id of args.specIds ?? []) {
      const requirement = `requirement:${id}`;
      for (const node of this.nodes.filter((item) => item.text?.includes(id))) {
        links.push({ from: requirement, to: node.id, kind: 'documents' });
      }
    }
    return uniqueBy(links, (edge) => `${edge.from}\0${edge.to}\0${edge.kind}`);
  }
}

function markdownChunks(path: string, text: string): RepositoryNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const chunks: RepositoryNode[] = [];
  let heading = nodePath.basename(path);
  let body: string[] = [];
  const flush = (): void => {
    const value = body.join('\n').trim();
    if (value) {
      const index = chunks.length;
      chunks.push({
        id: `doc:${path}#${index}`,
        kind: 'markdown',
        label: heading,
        path,
        text: `${heading}\n${value}`,
      });
    }
    body = [];
  };
  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      flush();
      heading = match[1]!.trim();
    } else {
      body.push(line);
    }
  }
  flush();
  return chunks;
}

function codeSymbols(path: string, text: string): RepositoryNode[] {
  const symbols: RepositoryNode[] = [];
  const regex = /\b(?:class|interface|type|enum|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of text.matchAll(regex)) {
    symbols.push({
      id: `symbol:${path}:${match[1]}`,
      kind: 'symbol',
      label: match[1]!,
      path,
    });
  }
  return uniqueBy(symbols, (symbol) => symbol.id);
}

function importTargets(text: string): string[] {
  return [...text.matchAll(/(?:from\s+|require\()\s*['"]([^'"]+)['"]/g)].map((match) => match[1]!);
}

function callNames(text: string): string[] {
  return [...text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => match[1]!)
    .filter((name) => !['if', 'for', 'while', 'switch', 'catch', 'function'].includes(name));
}

function resolveImportPath(from: string, target: string, files: readonly string[]): string {
  if (!target.startsWith('.')) {
    return '';
  }
  const base = normalizePath(nodePath.posix.join(nodePath.posix.dirname(from), target));
  return files.find((file) => file === base || file.replace(/\.[^.]+$/, '') === base || file.startsWith(`${base}/index.`)) ?? '';
}

function requirementIds(text: string): string[] {
  return [...new Set(text.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [])].sort();
}

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? [])];
}

function scoreText(text: string, terms: readonly string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 800);
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}
