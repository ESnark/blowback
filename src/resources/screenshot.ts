import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Browser, Page } from 'playwright';
import { z } from 'zod';
import { SCREENSHOTS_DIRECTORY } from '../constants.js';
import { getScreenshotDB } from '../db/screenshot-db.js';
import { Logger } from '../utils/logger.js';

// Helper function to get file path from ID
const getFilePath = (id: string): string => {
  return path.join(SCREENSHOTS_DIRECTORY, `${id}.png`);
};

// URL validation schema for paths without protocol
const urlPathSchema = z.string()
  .refine((val) => !val.startsWith('http://') && !val.startsWith('https://'), {
    message: 'URL should not include protocol (http:// or https://)'
  })
  .refine((val) => {
    try {
      new URL('http://' + val);
      return true;
    } catch {
      return false;
    }
  }, {
    message: 'Invalid URL format'
  })
  .refine((val) => {
    // Block dangerous protocols that might be embedded
    const dangerousPatterns = ['javascript:', 'data:', 'file:', 'ftp:', 'about:', 'blob:'];
    const lowerVal = val.toLowerCase();
    return !dangerousPatterns.some(pattern => lowerVal.includes(pattern));
  }, {
    message: 'URL contains forbidden protocol'
  });

/**
 * Register screenshot resource to MCP server
 * @param server MCP server instance
 * @param browserRef Browser reference
 * @param pageRef Page reference
 * @param viteDevServerUrlRef Development server URL reference
 */
export function registerScreenshotResource(
  server: McpServer,
  browserRef: { current: Browser | null },
  pageRef: { current: Page | null },
) {
  // Function to check if browser is started
  const isBrowserStarted = () => {
    return browserRef.current !== null && pageRef.current !== null;
  };

  // Get checkpoint ID
  const _getCurrentCheckpointId = async () => {
    if (!isBrowserStarted() || !pageRef.current) return null;

    try {
      const checkpointId = await pageRef.current.evaluate(() => {
        const metaTag = document.querySelector('meta[name="__mcp_checkpoint"]');
        return metaTag ? metaTag.getAttribute('data-id') : null;
      });
      return checkpointId;
    } catch (error) {
      Logger.error(`Failed to get checkpoint ID: ${error}`);
      return null;
    }
  };


  // Get database instance
  const db = getScreenshotDB();

  // Create screenshot URI
  const getScreenshotUri = (id: string) => `screenshot://${id}`;

  // Create screenshot URI from URL
  const getScreenshotUriFromPath = (url: string) => {
    const parsed = db.parseUrl(url);
    const record = db.findLatestByUrl(parsed.hostname, parsed.pathname);
    if (!record) return null;
    return getScreenshotUri(record.id);
  };

  // 모든 스크린샷 목록 반환
  const getAllScreenshots = () => {
    const screenshots = db.findAll();
    return {
      contents: screenshots.map(screenshot => ({
        uri: getScreenshotUri(screenshot.id),
        mimeType: screenshot.mime_type,
        text: `Screenshot ${screenshot.id} - ${screenshot.description}`
      }))
    };
  };

  // Get screenshot by ID and return image data
  const _getScreenshotById = async (id: string) => {
    const screenshot = db.findById(id);
    if (!screenshot) {
      throw new McpError(ErrorCode.InvalidRequest, `Screenshot with ID ${id} not found`);
    }

    const filePath = getFilePath(screenshot.id);
    const imageBuffer = await fs.readFile(filePath);

    return {
      contents: [
        {
          uri: getScreenshotUri(screenshot.id),
          mimeType: screenshot.mime_type,
          blob: imageBuffer.toString('base64')
        }
      ]
    };
  };


  // List all screenshots
  server.resource(
    'screenshots',
    'screenshot://',
    async () => {
      return getAllScreenshots();
    }
  );

  // Get screenshot by hostname and path using template
  server.resource(
    'screenshot-by-url',
    new ResourceTemplate('screenshot://{+path}', {
      list: undefined,
    }),
    async (uri, variables) => {
      let validatedPath: string;

      try {
        validatedPath = urlPathSchema.parse(variables.path);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new McpError(ErrorCode.InvalidParams, error.errors[0]?.message || 'Invalid URL format');
        }
        throw error;
      }

      // Parse URL with validated path
      const r = new URL('http://' + validatedPath);
      const host = r.host;
      const pathname = r.pathname;

      Logger.info(`uri: ${uri}`);
      Logger.info(`path: ${variables.path}`);
      Logger.info(`host: ${host}`);
      Logger.info(`pathname: ${pathname}`);

      // Check if screenshot exists in database
      const existing = db.findLatestByUrl(host, pathname);

      if (!existing) {
        Logger.info(`No screenshot found for ${host}${pathname}`);
        throw new McpError(ErrorCode.InvalidRequest, `No screenshot found for ${host}${pathname}`);
      }

      // Return existing screenshot
      const filePath = getFilePath(existing.id);
      const imageBuffer = await fs.readFile(filePath);

      return {
        contents: [
          {
            uri: `screenshot://${host}${pathname}`,
            mimeType: existing.mime_type,
            blob: imageBuffer.toString('base64')
          }
        ]
      };
    }
  );

  // Find screenshot by URL
  const getScreenshotByPath = (url: string) => {
    if (!url) return undefined;

    const parsed = db.parseUrl(url);
    const record = db.findLatestByUrl(parsed.hostname, parsed.pathname);

    if (!record) return undefined;

    return {
      id: record.id,
      timestamp: record.timestamp.toISOString(),
      mimeType: record.mime_type,
      filePath: getFilePath(record.id),
      description: record.description,
      checkpointId: record.checkpoint_id,
      url: url
    };
  };

  // Return functions to also add screenshots from browser tools
  return {
    // Function to externally add screenshots
    addScreenshot: async (
      imageData: string | Buffer,
      description: string,
      checkpointId: string | null = null,
      url?: string
    ): Promise<{ id: string; resourceUri: string }> => {
      const id = randomUUID();

      // Create filename and save
      const filename = `${id}.png`;
      const filePath = path.join(SCREENSHOTS_DIRECTORY, filename);

      // Save data to file
      if (typeof imageData === 'string') {
        // Convert base64 string if needed
        await fs.writeFile(filePath, Buffer.from(imageData, 'base64'));
      } else {
        // Save Buffer directly
        await fs.writeFile(filePath, imageData);
      }
      Logger.info(`External screenshot saved to file: ${filePath}`);

      // Save to database
      let resourceUri: string;

      if (url) {
        const parsed = db.parseUrl(url);
        db.insert({
          id,
          hostname: parsed.hostname,
          pathname: parsed.pathname,
          query: parsed.query || null,
          hash: parsed.hash || null,
          checkpoint_id: checkpointId,
          timestamp: new Date(),
          mime_type: 'image/png',
          description
        });
        Logger.info(`Screenshot saved to database with ID: ${id} for URL: ${url}`);

        // Return hostname/path based URI
        resourceUri = `screenshot://${parsed.hostname}${parsed.pathname}`;
      } else {
        // If no URL, save with empty hostname/pathname
        db.insert({
          id,
          hostname: 'unknown',
          pathname: '/',
          query: null,
          hash: null,
          checkpoint_id: checkpointId,
          timestamp: new Date(),
          mime_type: 'image/png',
          description
        });
        Logger.info(`Screenshot saved to database with ID: ${id} (no URL)`);

        // Return ID-based URI for unknown URLs
        resourceUri = getScreenshotUri(id);
      }

      return { id, resourceUri };
    },

    // Find screenshot by URL path
    getScreenshotByPath,

    // Get screenshot URI from path
    getScreenshotUriFromPath
  };
}
