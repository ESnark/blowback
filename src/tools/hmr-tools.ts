import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ViteHMRClient } from "../clients/vite-hmr-client.js";
import { HMRError, HMREvent, HMRUpdate } from "../types/hmr.js";
import { Logger } from "../utils/logger.js";

// Maximum number of HMR events to store
const MAX_HMR_EVENTS = 10;

/**
 * Register HMR-related MCP tools to the server
 * @param server MCP server instance
 * @param lastHMREvents HMR event history array
 * @param viteClientRef Vite HMR client reference
 * @param projectRootRef Project root path reference
 */
export function registerHMRTools(
  server: McpServer, 
  lastHMREvents: HMREvent[],
  viteClientRef: { current: ViteHMRClient | null },
  projectRootRef: { current: string }
) {
  // Vite HMR connection initialization tool
  server.tool(
    "init-vite-connection",
    "Connects to the project's development server",
    {
      viteHmrUrl: z.string().describe("WebSocket URL for Vite HMR (e.g., ws://localhost:5173/__hmr)"),
      projectRoot: z.string().optional().describe("Root path of the project")
    },
    async ({ viteHmrUrl, projectRoot }) => {
      try {
        if (projectRoot) {
          projectRootRef.current = projectRoot;
          Logger.info(`Project root set to: ${projectRoot}`);
        }
        
        if (viteClientRef.current) {
          viteClientRef.current.close();
          Logger.info('Closed existing Vite HMR client');
        }
        
        viteClientRef.current = new ViteHMRClient(viteHmrUrl);
        await viteClientRef.current.connect();
        Logger.info(`Connected to Vite HMR server at: ${viteHmrUrl}`);
        
        // Setup listener to collect all HMR events
        viteClientRef.current.on('all', (event: HMREvent) => {
          lastHMREvents.unshift(event);
          if (lastHMREvents.length > MAX_HMR_EVENTS) {
            lastHMREvents.pop();
          }
          Logger.debug(`Received HMR event: ${event.type}`);
        });
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully connected to Vite HMR server at ${viteHmrUrl}\nProject root: ${projectRootRef.current}`
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to connect to Vite HMR server: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to connect to Vite HMR server: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Recent HMR events retrieval tool
  server.tool(
    "get-hmr-events",
    "Retrieves recent HMR events",
    {
      limit: z.number().optional().describe("Maximum number of events to return")
    },
    async ({ limit }) => {
      try {
        if (!viteClientRef.current) {
          return {
            content: [
              {
                type: "text",
                text: "Vite HMR client not initialized. Please call init-vite-connection first."
              }
            ],
            isError: true
          };
        }

        const eventsToReturn = limit ? lastHMREvents.slice(0, limit) : lastHMREvents;
        
        return {
          content: [
            {
              type: "text",
              text: `Recent HMR events:\n${JSON.stringify(eventsToReturn, null, 2)}`
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to get HMR events: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get HMR events: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // HMR status check tool
  server.tool(
    "check-hmr-status",
    "Checks the status of HMR",
    { timeout: z.number().optional().describe("Timeout in milliseconds to wait for HMR events") },
    async ({ timeout = 5000 }) => {
      try {
        if (!viteClientRef.current) {
          return {
            content: [
              {
                type: "text",
                text: "Vite HMR client not initialized. Please call init-vite-connection first."
              }
            ],
            isError: true
          };
        }

        // Check errors from recent events
        const errors = lastHMREvents
          .filter(event => event.type === 'error')
          .map(event => (event as HMRError).err);
        
        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `HMR errors detected:\n${JSON.stringify(errors, null, 2)}`
              }
            ],
            isError: true
          };
        }
        
        // Check update events
        const updates = lastHMREvents
          .filter(event => event.type === 'update')
          .map(event => (event as HMRUpdate).updates);
        
        return {
          content: [
            {
              type: "text",
              text: updates.length > 0
                ? `HMR updates processed successfully:\n${JSON.stringify(updates, null, 2)}`
                : `No recent HMR updates detected.`
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to check HMR status: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to check HMR status: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );
}
