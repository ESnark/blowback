import { chromium, firefox, webkit, Browser, Page } from 'playwright';
import { Logger } from '../utils/logger.js';
import { getScreenshotDB } from '../db/screenshot-db.js';
import { 
  BrowserType, 
  BrowserInstance, 
  BrowserCreateOptions, 
  BrowserOperationResult, 
  BrowserListOptions,
  BrowserStats,
  BrowserMetadata
} from '../types/browser.js';

/**
 * Browser manager for handling multiple browser instances
 */
export class BrowserManager {
  private browsers = new Map<string, BrowserInstance>();
  private readonly MAX_BROWSERS = 5;

  constructor() {
    // Handle cleanup on process exit
    process.on('beforeExit', () => {
      this.cleanup();
    });

    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Initialize browser manager and restore persisted browsers
   */
  async initialize(): Promise<void> {
    Logger.info('Initializing browser manager...');
    
    // Mark all existing database entries as inactive on startup
    // This prevents stale browser references from previous sessions
    const db = getScreenshotDB();
    const persistedBrowsers = db.getAllActiveBrowsers();
    
    if (persistedBrowsers.length > 0) {
      Logger.info(`Found ${persistedBrowsers.length} persisted browser entries, marking as inactive`);
      persistedBrowsers.forEach(browser => {
        db.deactivateBrowser(browser.id);
      });
    }
    
    Logger.info('Browser manager initialized');
  }

  /**
   * Create a new browser instance
   */
  async createBrowser(options: BrowserCreateOptions): Promise<BrowserOperationResult> {
    try {
      // Check browser limit
      if (this.browsers.size >= this.MAX_BROWSERS) {
        return {
          success: false,
          error: `Maximum number of browsers (${this.MAX_BROWSERS}) reached`
        };
      }

      // Check if browser ID already exists
      if (this.browsers.has(options.id)) {
        return {
          success: false,
          error: `Browser with ID '${options.id}' already exists`
        };
      }

      const browserType = options.type || BrowserType.CHROMIUM;
      const headless = options.headless ?? false;
      const viewport = options.viewport || { width: 1280, height: 800 };

      Logger.info(`Creating browser: ${options.id} (${browserType})`);

      // Launch browser
      let browser: Browser;
      switch (browserType) {
      case BrowserType.CHROMIUM:
        browser = await chromium.launch({ headless });
        break;
      case BrowserType.FIREFOX:
        browser = await firefox.launch({ headless });
        break;
      case BrowserType.WEBKIT:
        browser = await webkit.launch({ headless });
        break;
      default:
        return {
          success: false,
          error: `Unsupported browser type: ${browserType}`
        };
      }

      // Create context
      const context = await browser.newContext({
        viewport
      });

      // Create initial page if targetUrl is provided
      let page: Page | null = null;
      if (options.targetUrl) {
        page = await context.newPage();
        await page.goto(options.targetUrl, { waitUntil: 'networkidle' });
      }

      const metadata: BrowserMetadata = {
        tags: options.tags || [],
        purpose: options.purpose,
        targetUrl: options.targetUrl,
        viewport,
        headless
      };

      const browserInstance: BrowserInstance = {
        id: options.id,
        type: browserType,
        displayName: options.displayName,
        browser,
        context,
        page,
        metadata,
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      this.browsers.set(options.id, browserInstance);

      // Persist to database
      const db = getScreenshotDB();
      db.saveBrowserInstance(
        options.id, 
        browserType, 
        options.displayName, 
        metadata
      );

      Logger.info(`Browser created successfully: ${options.id}`);

      return {
        success: true,
        browserId: options.id,
        data: {
          id: options.id,
          type: browserType,
          displayName: options.displayName,
          targetUrl: options.targetUrl
        }
      };

    } catch (error) {
      Logger.error(`Failed to create browser ${options.id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get browser instance by ID
   */
  getBrowser(browserId: string): BrowserInstance | null {
    const browserInstance = this.browsers.get(browserId);
    if (browserInstance) {
      browserInstance.lastUsedAt = new Date();
      // Update database timestamp
      const db = getScreenshotDB();
      db.updateBrowserLastUsed(browserId);
    }
    return browserInstance || null;
  }

  /**
   * Get all browsers matching filter options
   */
  listBrowsers(options?: BrowserListOptions): BrowserInstance[] {
    let browsers = Array.from(this.browsers.values());

    if (options?.type) {
      browsers = browsers.filter(b => b.type === options.type);
    }

    if (options?.tags && options.tags.length > 0) {
      browsers = browsers.filter(b => 
        options.tags!.some(tag => b.metadata.tags?.includes(tag))
      );
    }

    return browsers;
  }

  /**
   * Close and remove browser instance
   */
  async closeBrowser(browserId: string): Promise<BrowserOperationResult> {
    try {
      const browserInstance = this.browsers.get(browserId);
      if (!browserInstance) {
        return {
          success: false,
          error: `Browser '${browserId}' not found`
        };
      }

      Logger.info(`Closing browser: ${browserId}`);

      // Close browser
      await browserInstance.browser.close();

      // Remove from map
      this.browsers.delete(browserId);

      // Update database to mark as inactive
      const db = getScreenshotDB();
      db.deactivateBrowser(browserId);

      Logger.info(`Browser closed successfully: ${browserId}`);

      return {
        success: true,
        browserId
      };

    } catch (error) {
      Logger.error(`Failed to close browser ${browserId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check if browser exists and is active
   */
  hasBrowser(browserId: string): boolean {
    return this.browsers.has(browserId);
  }


  /**
   * Get most recently used browser
   */
  getMostRecentBrowser(): BrowserInstance | null {
    const browsers = Array.from(this.browsers.values());
    if (browsers.length === 0) return null;
    
    // Return the most recently used browser
    const sortedBrowsers = browsers.sort((a, b) => 
      b.lastUsedAt.getTime() - a.lastUsedAt.getTime()
    );
    
    return sortedBrowsers[0];
  }

  /**
   * Get browser statistics
   */
  getBrowserStats(browserId?: string): BrowserStats[] {
    const browsers = browserId 
      ? [this.browsers.get(browserId)].filter(Boolean) as BrowserInstance[]
      : Array.from(this.browsers.values());

    return browsers.map(browser => ({
      browserId: browser.id,
      type: browser.type,
      displayName: browser.displayName,
      uptime: Date.now() - browser.createdAt.getTime(),
      totalPages: 1, // TODO: Track actual page count
      totalScreenshots: 0, // TODO: Integrate with screenshot system
      totalLogs: 0, // TODO: Integrate with log system
      lastActivity: browser.lastUsedAt
    }));
  }


  /**
   * Clean up all browsers
   */
  private async cleanup(): Promise<void> {
    Logger.info('Cleaning up browser manager...');
    
    const closeBrowserPromises = Array.from(this.browsers.keys())
      .map(browserId => this.closeBrowser(browserId));

    await Promise.allSettled(closeBrowserPromises);
    
    Logger.info('Browser manager cleanup completed');
  }

  /**
   * Get total browser count
   */
  getBrowserCount(): number {
    return this.browsers.size;
  }

  /**
   * Get maximum browser limit
   */
  getMaxBrowsers(): number {
    return this.MAX_BROWSERS;
  }
}