import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BrowserManager } from '../managers/browser-manager.js';
import { BrowserType } from '../types/browser.js';
import { Logger } from '../utils/logger.js';

/**
 * Register browser manager tools for multi-browser support
 */
export function registerBrowserManagerTools(server: McpServer) {
  const browserManager = new BrowserManager();

  // Initialize browser manager on startup
  browserManager.initialize().catch(error => {
    Logger.error('Failed to initialize browser manager:', error);
  });

  // Create browser tool (with auto-generated ID)
  server.tool(
    'start-browser',
    'Creates a new browser instance with an auto-generated unique ID',
    {
      type: z.enum(['chromium', 'firefox', 'webkit']).optional().describe('Browser type (default: chromium)'),
      displayName: z.string().optional().describe('Human-readable name for the browser'),
      targetUrl: z.string().optional().describe('URL to navigate to after starting'),
      headless: z.boolean().optional().describe('Run browser in headless mode (default: false)'),
      viewport: z.object({
        width: z.number(),
        height: z.number()
      }).optional().describe('Browser viewport size (default: 1280x800)'),
      tags: z.array(z.string()).optional().describe('Tags for organizing browsers'),
      purpose: z.string().optional().describe('Description of what this browser is for')
    },
    async ({ type, displayName, targetUrl, headless, viewport, tags, purpose }) => {
      // Generate unique browser ID at function scope
      const browserId = `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        const result = await browserManager.createBrowser({
          id: browserId,
          type: type as BrowserType | undefined,
          displayName,
          targetUrl,
          headless,
          viewport,
          tags,
          purpose
        });

        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Browser created successfully!\nBrowser ID: ${browserId}\nType: ${result.data?.type || type || 'chromium'}\nURL: ${targetUrl || 'about:blank'}`
              }
            ],
            // Include the generated ID in the response for easy access
            browserId: browserId,
            browserInfo: {
              id: browserId,
              type: result.data?.type || type || 'chromium',
              displayName: displayName,
              targetUrl: targetUrl || 'about:blank'
            }
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to create browser: ${result.error}`
              }
            ],
            isError: true
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to create browser ${browserId}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to create browser: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // List browsers tool
  server.tool(
    'list-browsers',
    'Lists all active browser instances',
    {
      type: z.enum(['chromium', 'firefox', 'webkit']).optional().describe('Filter by browser type'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      includeStats: z.boolean().optional().describe('Include usage statistics (default: false)')
    },
    async ({ type, tags, includeStats = false }) => {
      try {
        const browsers = browserManager.listBrowsers({ 
          type: type as BrowserType | undefined, 
          tags 
        });

        if (browsers.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No active browsers found'
              }
            ]
          };
        }

        const browserInfo = browsers.map(browser => {
          const info: any = {
            id: browser.id,
            type: browser.type,
            displayName: browser.displayName,
            targetUrl: browser.metadata.targetUrl,
            tags: browser.metadata.tags,
            purpose: browser.metadata.purpose,
            createdAt: browser.createdAt,
            lastUsedAt: browser.lastUsedAt
          };

          return info;
        });

        let stats = null;
        if (includeStats) {
          stats = browserManager.getBrowserStats();
        }

        const result = {
          totalBrowsers: browsers.length,
          browsers: browserInfo,
          ...(stats && { statistics: stats })
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('Failed to list browsers:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list browsers: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Close browser tool
  server.tool(
    'close-browser',
    'Closes a specific browser instance',
    {
      browserId: z.string().describe('ID of the browser to close')
    },
    async ({ browserId }) => {
      try {
        const result = await browserManager.closeBrowser(browserId);

        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Browser closed successfully: ${browserId}`
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to close browser: ${result.error}`
              }
            ],
            isError: true
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to close browser ${browserId}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to close browser: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Get browser info tool
  server.tool(
    'get-browser-info',
    'Gets detailed information about a specific browser instance',
    {
      browserId: z.string().describe('ID of the browser to inspect')
    },
    async ({ browserId }) => {
      try {
        const browser = browserManager.getBrowser(browserId);

        if (!browser) {
          return {
            content: [
              {
                type: 'text',
                text: `Browser not found: ${browserId}`
              }
            ],
            isError: true
          };
        }

        const browserInfo = {
          id: browser.id,
          type: browser.type,
          displayName: browser.displayName,
          metadata: browser.metadata,
          createdAt: browser.createdAt,
          lastUsedAt: browser.lastUsedAt,
          isActive: browserManager.hasBrowser(browserId),
          currentUrl: browser.page ? browser.page.url() : null
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(browserInfo, null, 2)
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to get browser info for ${browserId}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get browser info: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Get browser statistics tool
  server.tool(
    'get-browser-stats',
    'Gets usage statistics for browsers',
    {
      browserId: z.string().optional().describe('Specific browser ID (returns stats for all browsers if not specified)')
    },
    async ({ browserId }) => {
      try {
        const stats = browserManager.getBrowserStats(browserId);

        const result = {
          totalBrowsers: browserManager.getBrowserCount(),
          maxBrowsers: browserManager.getMaxBrowsers(),
          statistics: stats
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('Failed to get browser stats:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get browser stats: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );


  return browserManager;
}