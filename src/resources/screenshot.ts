import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Browser, Page } from 'playwright';
import { SCREENSHOTS_DIRECTORY } from '../constants.js';
import { Logger } from '../utils/logger.js';

// Screenshot repository
interface Screenshot {
  id: string;
  timestamp: string;
  mimeType: string;
  filePath: string; // File system path
  description: string;
  checkpointId: string | null;
  url?: string; // URL where the screenshot was taken
  cacheId?: string; // Cache identifier
}



// URL path normalization function (removes protocol, host, and port)
const normalizeUrlPath = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search + urlObj.hash;
  } catch (error) {
    return url; // Return as is if URL is invalid
  }
};

// Create key for URL path and cache ID
const createUrlCacheKey = (urlPath: string, cacheId: string): string => {
  return `${urlPath}#${cacheId}`;
};

// Screenshot memory storage
const screenshots: Map<string, Screenshot> = new Map();
// Screenshot ID storage by URL path (stores only the latest screenshot)
const urlPathToScreenshotId: Map<string, string> = new Map();
// Screenshot ID storage by URL path and cache ID
const urlPathCacheIdToScreenshotId: Map<string, string> = new Map();

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
  const getCurrentCheckpointId = async () => {
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


  // Create screenshot URI
  const getScreenshotUri = (id: string) => `screenshot://${id}`;

  // Create screenshot URI from URL path
  const getScreenshotUriFromPath = (path: string, withCacheId?: boolean) => {
    const id = urlPathToScreenshotId.get(path);
    if (!id) return null;

    // Include cache ID if requested
    if (withCacheId) {
      const screenshot = screenshots.get(id);
      if (screenshot && screenshot.cacheId) {
        // Create URL object
        try {
          const urlObj = new URL(path);
          // Add cache-id query parameter
          urlObj.searchParams.set('cache-id', screenshot.cacheId);
          return urlObj.toString();
        } catch (error) {
          Logger.error(`Failed to create URL with cache-id: ${error}`);
          return getScreenshotUri(id);
        }
      }
    }

    return getScreenshotUri(id);
  };

  // 모든 스크린샷 목록 반환
  const getAllScreenshots = () => {
    return {
      contents: Array.from(screenshots.values()).map(screenshot => ({
        uri: getScreenshotUri(screenshot.id),
        mimeType: screenshot.mimeType,
        blob: '', // Empty blob for list
        metadata: {
          name: `Screenshot ${screenshot.id}`,
          description: screenshot.description,
          timestamp: screenshot.timestamp,
          checkpointId: screenshot.checkpointId,
          url: screenshot.url
        }
      }))
    };
  };

  // 캐시 ID로 스크린샷 조회
  const getScreenshotByCacheId = async (cleanTargetUrl: string, cacheId: string) => {
    const normalizedPath = normalizeUrlPath(cleanTargetUrl);
    const cacheKey = createUrlCacheKey(normalizedPath, cacheId);
    const cachedScreenshotId = urlPathCacheIdToScreenshotId.get(cacheKey);

    if (!cachedScreenshotId) {
      throw new Error(`Screenshot with cache ID ${cacheId} not found for URL: ${cleanTargetUrl}`);
    }

    const screenshot = screenshots.get(cachedScreenshotId);
    if (!screenshot) {
      throw new Error(`Screenshot with ID ${cachedScreenshotId} not found`);
    }

    // 이미지 데이터 읽어오기
    const imageBuffer = await fs.readFile(screenshot.filePath);

    return {
      contents: [
        {
          uri: `screenshot://${normalizedPath}?__mcp_cache=${cacheId}`,
          mimeType: screenshot.mimeType,
          blob: imageBuffer.toString('base64'),
          metadata: {
            name: `Screenshot ${screenshot.id}`,
            description: screenshot.description,
            timestamp: screenshot.timestamp,
            checkpointId: screenshot.checkpointId,
            url: screenshot.url,
            cacheId: screenshot.cacheId
          }
        }
      ]
    };
  };

  // 새 스크린샷 캡처 및 반환
  const captureAndReturnScreenshot = async (cleanTargetUrl: string, uri: URL) => {
    if (!isBrowserStarted() || !pageRef.current) {
      throw new Error('Browser not started. Cannot capture screenshot.');
    }

    try {
      // 현재 URL 가져오기
      const currentUrl = await pageRef.current.url();

      // URL이 다르면 이동
      if (cleanTargetUrl !== currentUrl) {
        Logger.info(`Navigating to ${cleanTargetUrl} before capturing screenshot`);
        await pageRef.current.goto(cleanTargetUrl, { waitUntil: 'networkidle' });
      }

      // 스크린샷 캡처
      const imageData = await pageRef.current.screenshot({ fullPage: true });

      // 랜덤 ID 생성
      const id = randomUUID();
      const newCacheId = randomUUID().substring(0, 8);

      // 체크포인트 ID 가져오기
      const checkpointId = await getCurrentCheckpointId();

      // 최종 URL (이동 후 URL이 변경되었을 수 있음)
      const finalUrl = await pageRef.current.url();
      const urlPath = normalizeUrlPath(finalUrl);

      // 파일명 생성 및 저장
      const filename = `${id}.png`;
      const filePath = path.join(SCREENSHOTS_DIRECTORY, filename);

      // 이미지 데이터 파일로 저장
      await fs.writeFile(filePath, imageData);
      Logger.info(`Screenshot saved to file: ${filePath}`);

      // 스크린샷 객체 생성
      const screenshot: Screenshot = {
        id,
        timestamp: new Date().toISOString(),
        mimeType: 'image/png',
        filePath,
        description: `Screenshot of full page at ${finalUrl}`,
        checkpointId,
        url: finalUrl,
        cacheId: newCacheId
      };

      // 스크린샷 저장
      screenshots.set(id, screenshot);

      // URL 경로로 최신 스크린샷 ID 저장
      urlPathToScreenshotId.set(urlPath, id);

      // URL 경로와 캐시 ID 함께 저장
      const cacheKey = createUrlCacheKey(urlPath, newCacheId);
      urlPathCacheIdToScreenshotId.set(cacheKey, id);

      Logger.info(`Screenshot captured with ID: ${id} for URL: ${finalUrl} with cache ID: ${newCacheId}`);

      // 이미지 데이터 읽기
      const imageBuffer = await fs.readFile(screenshot.filePath);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: screenshot.mimeType,
            blob: imageBuffer.toString('base64'),
            metadata: {
              name: `Screenshot ${screenshot.id}`,
              description: screenshot.description,
              timestamp: screenshot.timestamp,
              checkpointId: screenshot.checkpointId,
              url: screenshot.url,
              cacheId: newCacheId,
              cacheUrl: `screenshot://${finalUrl.replace(/^https?:\/\//, '')}?__mcp_cache=${newCacheId}`
            }
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`Failed to capture screenshot: ${errorMessage}`);
      throw new Error(`Failed to capture screenshot: ${errorMessage}`);
    }
  };

  // URL 파싱 및 정규화
  const parseScreenshotUrl = (uri: URL) => {
    // URL 변환 (screenshot://example.com/... -> http://example.com/...)
    const targetUrl = 'http' + uri.href.substring('screenshot'.length);
    // 캐시 ID 파라미터 제거
    const cleanTargetUrl = targetUrl.replace(/\?__mcp_cache=.*$/, '');
    // 캐시 ID 추출
    const cacheId = uri.searchParams.get('__mcp_cache');

    return { targetUrl, cleanTargetUrl, cacheId };
  };

  // Expose screenshots as resources (MCP resource API)
  server.resource(
    'screenshots',
    'screenshot://',
    async (uri, params: any) => {
      // If no specific screenshot is requested, return all screenshots
      if (uri.href === 'screenshot://') {
        return getAllScreenshots();
      }

      // 스크린샷 요청 처리 - 모든 URL 지원
      if (uri.href.startsWith('screenshot://')) {
        const urlObj = new URL(uri.href);
        const { cleanTargetUrl, cacheId } = parseScreenshotUrl(urlObj);

        // 캐시 ID가 있는 경우 해당 ID로 저장된 스크린샷 조회
        if (cacheId) {
          return await getScreenshotByCacheId(cleanTargetUrl, cacheId);
        }

        // 캐시 ID가 없는 경우 새 스크린샷 캡처하고 반환
        return await captureAndReturnScreenshot(cleanTargetUrl, urlObj);
      }

      // 지원하지 않는 URI 형식
      throw new Error(`Unsupported screenshot URI format: ${uri.href}`);
    }
  );

  // Find screenshot by URL path
  const getScreenshotByPath = (url: string): Screenshot | undefined => {
    if (!url) return undefined;

    const urlPath = normalizeUrlPath(url);
    const screenshotId = urlPathToScreenshotId.get(urlPath);

    if (!screenshotId) return undefined;

    return screenshots.get(screenshotId);
  };

  // Return functions to also add screenshots from browser tools
  return {
    // Function to externally add screenshots
    addScreenshot: async (
      imageData: string | Buffer,
      description: string,
      checkpointId: string | null = null,
      url?: string
    ): Promise<string> => {
      const id = randomUUID();
      const cacheId = randomUUID().substring(0, 8);

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

      const screenshot: Screenshot = {
        id,
        timestamp: new Date().toISOString(),
        mimeType: 'image/png',
        filePath,
        description,
        checkpointId,
        url,
        cacheId
      };

      screenshots.set(id, screenshot);

      // Map URL path if URL is provided (for all URLs)
      if (url) {
        const urlPath = normalizeUrlPath(url);
        urlPathToScreenshotId.set(urlPath, id);

        // Store URL path and cache ID together
        const cacheKey = createUrlCacheKey(urlPath, cacheId);
        urlPathCacheIdToScreenshotId.set(cacheKey, id);

        Logger.info(`Associated URL path ${urlPath} with external screenshot ID: ${id}`);
      }

      Logger.info(`External screenshot added with ID: ${id}`);

      return getScreenshotUri(id);
    },

    // Find screenshot by URL path
    getScreenshotByPath,

    // Get screenshot URI from path
    getScreenshotUriFromPath
  };
}
