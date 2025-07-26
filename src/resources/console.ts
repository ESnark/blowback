import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Match console message types with those managed by browser tools
type ConsoleMessage = {
  type: string;
  text: string;
  timestamp: string;
  url: string;
  checkpointId: string | null;
};

// Export console message store for external access
export const consoleMessages: ConsoleMessage[] = [];

export function registerConsoleResource(_server: McpServer) {
  throw new Error('Not implemented');
}
