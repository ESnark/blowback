#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import puppeteer from 'puppeteer';
import { z } from 'zod';
import { registerBrowserTools } from './tools/browser-tools.js';
import { registerHMRTools } from './tools/hmr-tools.js';
import { HMREvent } from './types/hmr.js';
import { Logger } from './utils/logger.js';

/**
 * Main entry point for MCP Vite HMR server
 * Initializes the server, registers tools, and starts communication with clients using stdio transport
 */
async function main() {
  try {
    // Reference objects for state management
    // Using object references so values can be updated from other modules
    const browserRef = { current: null as puppeteer.Browser | null };
    const pageRef = { current: null as puppeteer.Page | null };
    const viteDevServerUrlRef = { current: 'http://localhost:5173' };

    // Array to store recent HMR events
    const lastHMREvents: HMREvent[] = [];

    // Create MCP server instance
    const server = new McpServer({
      name: 'vite-mcp-server',
      version: '1.0.0',
      description: 'Connects to Vite development server to track changes in your project and provide real-time feedback on the results.',
      capabilities: {
        tools: {}
      }
    });

    server.tool('how-to-use', 'Description of how to use the server', {
      section: z.enum(['checkpoint', 'hmr']).describe('Section to describe'),
    }, ({ section }) => {
      switch (section) {
      case 'checkpoint':
        return {
          content: [
            { type: 'text', text: `
You can use checkpoint features by inserting '<meta name="__mcp_checkpoint" data-id="">' into the head to create a named snapshot of the current state.

The data-id attribute is a unique identifier for the checkpoint.

Console logs generated in the browser while a checkpoint is active are tagged with the checkpoint ID and can be queried individually.

Note: Since hot reload is triggered when files are saved, carefully consider the sequence between meta tag changes and the changes you want to observe. Make sure to set the checkpoint meta tag before making the changes you want to track.
              ` }
          ]
        };
      case 'hmr':
        return {
          content: [
            { type: 'text', text: `
If the HMR connection is established with the client, the server will automatically gather HMR events and provide them to the client.

You can read the HMR events using the 'get-hmr-events' tool.

The HMR connection is optional.
              ` }
          ]
        };
      default:
        return {
          content: [
            { type: 'text', text: 'Invalid section' }
          ]
        };
      }
    });

    // Register tools and resources
    registerHMRTools(server, lastHMREvents);
    registerBrowserTools(
      server,
      browserRef,
      pageRef,
      lastHMREvents,
      viteDevServerUrlRef
    );
    // registerConsoleResource(server);

    // Set up stdio transport and connect
    const transport = new StdioServerTransport();
    await server.connect(transport);
    Logger.info('MCP Vite HMR Server running on stdio transport');

    // Clean up resources on exit
    process.on('exit', () => {
      if (browserRef.current) {
        browserRef.current.close().catch(error => {
          Logger.error('Error closing browser:', error);
        });
      }
    });
  } catch (error) {
    Logger.error('Fatal error in main():', error);
    process.exit(1);
  }
}

// Execute main function
main().catch(error => {
  Logger.error('Unhandled promise rejection in main():', error);
  process.exit(1);
});
