import { COPY } from '../app/copy';

export type ReviewChromeMode = 'empty' | 'files' | 'mcp' | 'both';

export function reviewChromeMode(fileCount: number, mcpCount: number): ReviewChromeMode {
  if (fileCount > 0 && mcpCount > 0) {
    return 'both';
  }
  if (fileCount > 0) {
    return 'files';
  }
  if (mcpCount > 0) {
    return 'mcp';
  }
  return 'empty';
}

/** Exact §19.4 two lines, no blank line between them. Retry/Reject are MCP-gate only. */
export function mcpFailedViewMessage(): string {
  return `${COPY.mcpActionsFailed}\n[ Retry ](command:botrider.mcp.approve) [ Reject ](command:botrider.mcp.reject)`;
}
