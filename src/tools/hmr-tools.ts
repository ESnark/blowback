import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HMREvent } from '../types/hmr.js';
import { Logger } from '../utils/logger.js';

/**
 * Register HMR-related MCP tools to the server
 * @param server MCP server instance
 * @param lastHMREvents HMR event history array
 */
export function registerHMRTools(
  server: McpServer,
  lastHMREvents: HMREvent[]
) {
  // Recent HMR events retrieval tool
  server.tool(
    'get-hmr-events',
    'Retrieves recent HMR events',
    {
      limit: z.number().optional().describe('Maximum number of events to return')
    },
    async ({ limit }) => {
      try {
        const eventsToReturn = limit ? lastHMREvents.slice(0, limit) : lastHMREvents;

        return {
          content: [
            {
              type: 'text',
              text: eventsToReturn.length > 0
                ? `Recent HMR events:\n${JSON.stringify(eventsToReturn, null, 2)}`
                : 'No HMR events detected yet.'
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to get HMR events: ${errorMessage}`);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get HMR events: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );
}
