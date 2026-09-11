import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const graphPath = path.join(root, 'graphify-out', 'graph.json');
const documents = [
  'docs/master_product_requirement_document.md',
  'docs/product-requirements-crosswalk.md',
  'openspec/specs.md',
  'openspec/specs/pu-1-product-usability/spec.md',
  'openspec/specs/edit-1-selective-hunks/spec.md',
  'openspec/specs/ctx-1-repository-context/spec.md',
];

const mappings = {
  'PU-1': {
    symbols: ['BotRecord', 'BotRegistry', 'Application', '.workRoles()'],
    tests: ['test/bot-registry.test.ts', 'test/work-run-host.test.ts'],
  },
  'PU-2': {
    symbols: ['ThreadStore', 'ChatHub', '.replayTo()', 'HostToUi'],
    tests: ['test/orchestrator.test.ts', 'test/parallel-stream-chrome.test.ts'],
  },
  'PU-3': {
    symbols: ['CopilotGateway', 'CopilotRequestScheduler', 'normalizeCopilotConcurrency()', '.runDebateBatch()', '.runWorkBatch()'],
    tests: ['test/copilot-scheduler.test.ts', 'test/copilot-gateway.test.ts', 'test/event-bus-host.test.ts', 'test/work-run-host.test.ts'],
  },
  'PU-4': {
    symbols: ['Orchestrator', 'TaskGraphScheduler', 'parseTaskGraph()', 'validateTaskGraph()', '.runTaskGraph()'],
    tests: ['test/task-graph.test.ts', 'test/work-run-host.test.ts'],
  },
  'PU-5': {
    symbols: ['.runDebateRounds()', '.runDebateBatch()', 'turnInstruction()'],
    tests: ['test/orchestrator.test.ts', 'test/prompt-builder.test.ts'],
  },
  'PU-6': {
    symbols: ['ReviewTreeProvider', 'McpActionStore', 'openProposedDiff()'],
    tests: ['test/mcp-actions.test.ts', 'test/mcp-actions-chrome.test.ts', 'test/deliverable-chrome.test.ts', 'test/contributions.test.ts'],
  },
  'PU-7': {
    symbols: ['WorkspaceRecoveryStore', 'WorkspaceRecoverySnapshot', 'Application', 'ThreadStore', 'ChangesetStore', 'McpActionStore'],
    tests: ['test/recovery.test.ts', 'test/chat-webview.integration.test.ts', 'test/changeset-store.test.ts', 'test/mcp-actions.test.ts'],
  },
  'PU-8': {
    symbols: [],
    tests: ['test/contributions.test.ts', 'test/integration/suite/index.js'],
  },
  'EDIT-1': {
    symbols: ['UnifiedHunk', 'UnifiedPatchResult', 'HunkApplyResult', 'ChangesetStore'],
    tests: ['test/unified-hunk.test.ts', 'test/patch-parser.test.ts', 'test/changeset-store.test.ts', 'test/chat-webview.integration.test.ts'],
  },
  'CTX-1': {
    symbols: ['RepositoryContextService', 'VsCodeRepositoryContextPort'],
    tests: ['test/repository-context.test.ts', 'test/prompt-builder.test.ts'],
  },
  'CTX-2': {
    symbols: ['RepositoryContextService', 'VsCodeRepositoryContextPort'],
    tests: ['test/repository-context.test.ts'],
  },
  'CTX-3': {
    symbols: ['RepositoryContextService', 'OpenSpecCatalog', 'ContextMapHost'],
    tests: ['test/repository-context.test.ts', 'test/openspec-host.test.ts', 'test/context-map-host.test.ts'],
  },
};

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function firstParagraph(lines, start) {
  const result = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^#{1,6}\s/.test(line)) break;
    if (!line && result.length) break;
    if (line && !line.startsWith('|') && !line.startsWith('```')) result.push(line);
  }
  return result.join(' ').slice(0, 500);
}

function findNode(graph, label) {
  return graph.nodes.find((node) => node.label === label);
}

function findFileNode(graph, sourceFile) {
  return graph.nodes.find((node) => node.source_file === sourceFile && node.label === path.basename(sourceFile))
    ?? graph.nodes.find((node) => node.source_file === sourceFile);
}

function addEdge(edges, seen, source, target, relation, sourceFile, sourceLocation) {
  const key = `${source}\0${target}\0${relation}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({
    source,
    target,
    relation,
    _origin: 'product-docs',
    confidence: 'EXTRACTED',
    confidence_score: 1,
    context: 'requirements-traceability',
    source_file: sourceFile,
    source_location: sourceLocation,
    weight: 1,
  });
}

const graph = JSON.parse(await readFile(graphPath, 'utf8'));
graph.nodes = graph.nodes.filter((node) => node._origin !== 'product-docs');
graph.links = graph.links.filter((edge) => edge._origin !== 'product-docs');

const nodeIds = new Set(graph.nodes.map((node) => node.id));
const edgeKeys = new Set(graph.links.map((edge) => `${edge.source}\0${edge.target}\0${edge.relation}`));
const requirementNodes = new Map();

for (const sourceFile of documents) {
  const text = await readFile(path.join(root, sourceFile), 'utf8');
  const lines = text.split(/\r?\n/);
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim() ?? path.basename(sourceFile);
  const documentLabel = `[DOC] ${title}`;
  const documentId = `doc_${slug(sourceFile)}`;
  const documentNode = {
    id: documentId,
    label: documentLabel,
    _origin: 'product-docs',
    community: 127,
    community_name: 'Product Requirements',
    file_type: 'document',
    norm_label: documentLabel.toLowerCase(),
    source_file: sourceFile,
    source_location: 'L1',
    description: firstParagraph(lines, 1),
  };
  if (!nodeIds.has(documentId)) {
    graph.nodes.push(documentNode);
    nodeIds.add(documentId);
  }

  let parentId = documentId;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{2,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (!match) continue;
    const heading = match[2].replace(/\*\*/g, '').trim();
    const requirementId = /^(PRD-C\d+|PU-\d+|CTX-\d+|EDIT-\d+|PORT-\d+|AUD-\d+|VIZ-\d+)\b/.exec(heading)?.[1];
    const isCanonicalRecovery = /openspec\/specs\/(pu-1-product-usability|edit-1-selective-hunks|ctx-1-repository-context)\/spec\.md$/.test(sourceFile);
    const sectionId = `${match[1].length === 2 ? documentId : parentId}_${slug(heading)}`;
    const sectionLabel = requirementId && isCanonicalRecovery
      ? `[REQ] ${requirementId}`
      : `[SECTION] ${requirementId ?? heading} · ${slug(sourceFile)}${match[1].length > 2 ? ` · ${slug(parentId)}` : ''}`;
    const sectionNode = {
      id: sectionId,
      label: sectionLabel,
      title: heading,
      _origin: 'product-docs',
      community: 127,
      community_name: 'Product Requirements',
      file_type: requirementId ? 'requirement' : 'document-section',
      requirement_id: requirementId,
      norm_label: sectionLabel.toLowerCase(),
      source_file: sourceFile,
      source_location: `L${index + 1}`,
      description: firstParagraph(lines, index + 1),
    };
    if (!nodeIds.has(sectionId)) {
      graph.nodes.push(sectionNode);
      nodeIds.add(sectionId);
    }
    addEdge(graph.links, edgeKeys, parentId, sectionId, 'contains', sourceFile, `L${index + 1}`);
    if (requirementId && (isCanonicalRecovery || !requirementNodes.has(requirementId))) {
      requirementNodes.set(requirementId, sectionNode);
    }
    parentId = match[1].length === 2 ? sectionId : parentId;
  }
}

for (const [requirementId, mapping] of Object.entries(mappings)) {
  const requirement = requirementNodes.get(requirementId);
  if (!requirement) throw new Error(`Missing requirement heading for ${requirementId}`);
  for (const label of mapping.symbols) {
    const target = findNode(graph, label);
    if (!target) {
      console.warn(`Missing code node: ${requirementId} -> ${label}`);
      continue;
    }
    addEdge(graph.links, edgeKeys, requirement.id, target.id, 'implemented_by', requirement.source_file, requirement.source_location);
  }
  for (const sourceFile of mapping.tests) {
    const target = findFileNode(graph, sourceFile);
    if (!target) {
      console.warn(`Missing test node: ${requirementId} -> ${sourceFile}`);
      continue;
    }
    addEdge(graph.links, edgeKeys, requirement.id, target.id, 'verified_by', requirement.source_file, requirement.source_location);
  }
}

await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`Injected ${graph.nodes.filter((node) => node._origin === 'product-docs').length} product document nodes.`);
console.log(`Injected ${graph.links.filter((edge) => edge._origin === 'product-docs').length} product traceability edges.`);
