#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import puppeteer from "puppeteer";
import { HMREvent } from "./types/hmr.js";
import { ViteHMRClient } from "./clients/vite-hmr-client.js";
import { registerHMRTools } from "./tools/hmr-tools.js";
import { registerBrowserTools } from "./tools/browser-tools.js";
import { Logger } from "./utils/logger.js";

/**
 * Main entry point for MCP Vite HMR server
 * Initializes the server, registers tools, and starts communication with clients using stdio transport
 */
async function main() {
  try {
    // Reference objects for state management
    // Using object references so values can be updated from other modules
    const viteClientRef = { current: null as ViteHMRClient | null };
    const browserRef = { current: null as puppeteer.Browser | null };
    const pageRef = { current: null as puppeteer.Page | null };
    const projectRootRef = { current: process.cwd() };
    const viteDevServerUrlRef = { current: "http://localhost:5173" };

    // Array to store recent HMR events
    const lastHMREvents: HMREvent[] = [];

    // Create MCP server instance
    const server = new McpServer({
      name: "vite-hmr-server",
      version: "1.0.0",
      description: "Connects to Vite development server to track changes in your project and provide real-time feedback on the results",
      capabilities: {
        tools: {}
      }
    });

    // Register tools
    registerHMRTools(server, lastHMREvents, viteClientRef, projectRootRef);
    registerBrowserTools(
      server,
      browserRef,
      pageRef,
      lastHMREvents,
      projectRootRef,
      viteDevServerUrlRef
    );

    // Set up stdio transport and connect
    const transport = new StdioServerTransport();
    await server.connect(transport);
    Logger.info("MCP Vite HMR Server running on stdio transport");

    // Clean up resources on exit
    process.on('exit', () => {
      if (viteClientRef.current) {
        viteClientRef.current.close();
      }
      if (browserRef.current) {
        browserRef.current.close().catch(error => {
          Logger.error("Error closing browser:", error);
        });
      }
    });
  } catch (error) {
    Logger.error("Fatal error in main():", error);
    process.exit(1);
  }
}

// Execute main function
main().catch(error => {
  Logger.error("Unhandled promise rejection in main():", error);
  process.exit(1);
});