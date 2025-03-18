import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { Logger } from '../utils/logger.js';

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

export function registerConsoleResource(server: McpServer, projectRoot: string) {
  const LOG_DIR = path.join(projectRoot, 'dist', 'logs');

  Logger.info(`Registering console-logs resource with LOG_DIR: ${LOG_DIR}`);

  server.resource('console-logs', 'console-logs://', {
    description: 'Get console logs from the development server, starting from the most recent logs',
    mimeType: 'application/json',
  }, async (uri: URL) => {
    try {
      const checkpoint = uri.searchParams.get('checkpoint');
      const limit = uri.searchParams.get('limit') ? parseInt(uri.searchParams.get('limit')!) : undefined;

      // Determine log file path
      const logPath = checkpoint
        ? path.join(LOG_DIR, `browser-console.${checkpoint}.log`)
        : path.join(LOG_DIR, 'browser-console.log');

      // Return empty array if file doesn't exist
      if (!await fs.access(logPath).then(() => true).catch(() => false)) {
        return { contents: [] };
      }

      // Read log file
      const logs: ConsoleMessage[] = [];
      const fileStream = createReadStream(logPath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        if (line.trim()) {
          try {
            const log = JSON.parse(line);
            logs.push(log);
          } catch (error) {
            // Ignore invalid JSON lines
            continue;
          }
        }
      }

      // Sort by most recent first
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Return only the specified number of logs if limit is provided
      const limitedLogs = limit ? logs.slice(0, limit) : logs;

      return {
        contents: limitedLogs.map(log => ({
          uri: uri.toString(),
          text: JSON.stringify(log),
          mimeType: 'application/json'
        }))
      };
    } catch (error) {
      throw new Error(`Failed to read console logs: ${error}`);
    }
  });
}
