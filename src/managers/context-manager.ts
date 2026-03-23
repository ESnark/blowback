import { chromium, firefox, webkit, Browser } from 'playwright';
import { Logger } from '../utils/logger.js';
import { getScreenshotDB } from '../db/screenshot-db.js';
import { 
  BrowserType, 
  ContextInstance, 
  ContextCreateOptions, 
  ContextOperationResult, 
  ContextListOptions,
  ContextStats,
  ContextMetadata,
  SharedBrowserInstance
} from '../types/browser.js';

/**
 * Context manager for handling multiple browser contexts with shared browser instance
 */
export class ContextManager {
  private contexts = new Map<string, ContextInstance>();
  private sharedBrowser: SharedBrowserInstance | null = null;
  private readonly MAX_CONTEXTS = 10;

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
   * Initialize context manager and restore persisted contexts
   */
  async initialize(): Promise<void> {
    Logger.info('Initializing context manager...');
    
    // Mark all existing database entries as inactive on startup
    // This prevents stale context references from previous sessions
    const db = getScreenshotDB();
    const persistedContexts = db.getAllActiveBrowsers(); // TODO: rename to getAllActiveContexts
    
    if (persistedContexts.length > 0) {
      Logger.info(`Found ${persistedContexts.length} persisted context entries, marking as inactive`);
      persistedContexts.forEach(context => {
        db.deactivateBrowser(context.id); // TODO: rename to deactivateContext
      });
    }
    
    Logger.info('Context manager initialized');
  }

  /**
   * Find an available port for CDP debugging
   */
  private findAvailablePort(): number {
    // Start from 9222 (Chrome's default) and increment
    const startPort = 9222;
    return startPort + Math.floor(Math.random() * 1000);
  }

  /**
   * Ensure shared browser instance exists
   */
  private async ensureSharedBrowser(type: BrowserType, headless: boolean): Promise<Browser> {
    if (!this.sharedBrowser || this.sharedBrowser.type !== type) {
      Logger.info(`Creating shared browser instance: ${type}`);
      
      let browser: Browser;
      let cdpPort: number | undefined;
      
      switch (type) {
      case BrowserType.CHROMIUM: {
        // For Chromium, enable CDP with specific port
        const debugPort = headless ? undefined : this.findAvailablePort();
        const launchOptions = {
          headless,
          args: debugPort ? [`--remote-debugging-port=${debugPort}`] : []
        };
        browser = await chromium.launch(launchOptions);
        cdpPort = debugPort;
        break;
      }
      case BrowserType.FIREFOX:
        browser = await firefox.launch({ headless });
        break;
      case BrowserType.WEBKIT:
        browser = await webkit.launch({ headless });
        break;
      default:
        throw new Error(`Unsupported browser type: ${type}`);
      }

      // Set CDP endpoint if debugging port was specified
      let cdpEndpoint: string | undefined;
      if (cdpPort) {
        cdpEndpoint = `http://127.0.0.1:${cdpPort}`;
        Logger.info(`CDP endpoint: ${cdpEndpoint}`);
      }

      this.sharedBrowser = {
        browser,
        type,
        createdAt: new Date(),
        contextCount: 0,
        cdpEndpoint
      };
    }
    
    return this.sharedBrowser.browser;
  }

  /**
   * Create a new context instance
   */
  async createContext(options: ContextCreateOptions): Promise<ContextOperationResult> {
    try {
      // Check context limit
      if (this.contexts.size >= this.MAX_CONTEXTS) {
        return {
          success: false,
          error: `Maximum number of contexts (${this.MAX_CONTEXTS}) reached`
        };
      }

      // Check if context ID already exists
      if (this.contexts.has(options.id)) {
        return {
          success: false,
          error: `Context with ID '${options.id}' already exists`
        };
      }

      const browserType = options.type || BrowserType.CHROMIUM;
      const headless = options.headless ?? false;
      const viewport = options.viewport || { width: 1280, height: 800 };

      Logger.info(`Creating context: ${options.id} (${browserType})`);

      // Get or create shared browser instance
      const browser = await this.ensureSharedBrowser(browserType, headless);

      // Create isolated context
      const context = await browser.newContext({
        viewport
      });

      // Always create a page (following Playwright standard pattern)
      const page = await context.newPage();
      
      // Navigate to targetUrl if provided, otherwise stays at default "about:blank"
      if (options.targetUrl) {
        await page.goto(options.targetUrl, { waitUntil: 'networkidle' });
      }

      const metadata: ContextMetadata = {
        tags: options.tags || [],
        purpose: options.purpose,
        targetUrl: options.targetUrl,
        viewport,
        headless
      };

      const contextInstance: ContextInstance = {
        id: options.id,
        type: browserType,
        displayName: options.displayName,
        context,
        page,
        metadata,
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      this.contexts.set(options.id, contextInstance);
      if (this.sharedBrowser) {
        this.sharedBrowser.contextCount++;
      }

      // Persist to database
      const db = getScreenshotDB();
      db.saveBrowserInstance( // TODO: rename to saveContextInstance
        options.id, 
        browserType, 
        options.displayName, 
        metadata
      );

      Logger.info(`Context created successfully: ${options.id}`);

      return {
        success: true,
        contextId: options.id,
        data: {
          id: options.id,
          type: browserType,
          displayName: options.displayName,
          targetUrl: options.targetUrl
        }
      };

    } catch (error) {
      Logger.error(`Failed to create context ${options.id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get context instance by ID
   */
  getContext(contextId: string): ContextInstance | null {
    const contextInstance = this.contexts.get(contextId);
    if (contextInstance) {
      contextInstance.lastUsedAt = new Date();
      // Update database timestamp
      const db = getScreenshotDB();
      db.updateBrowserLastUsed(contextId); // TODO: rename to updateContextLastUsed
    }
    return contextInstance || null;
  }

  /**
   * Get all contexts matching filter options
   */
  listContexts(options?: ContextListOptions): ContextInstance[] {
    let contexts = Array.from(this.contexts.values());

    if (options?.type) {
      contexts = contexts.filter(c => c.type === options.type);
    }

    if (options?.tags && options.tags.length > 0) {
      contexts = contexts.filter(c => 
        options.tags!.some(tag => c.metadata.tags?.includes(tag))
      );
    }

    return contexts;
  }

  /**
   * Close and remove context instance
   */
  async closeContext(contextId: string): Promise<ContextOperationResult> {
    try {
      const contextInstance = this.contexts.get(contextId);
      if (!contextInstance) {
        return {
          success: false,
          error: `Context '${contextId}' not found`
        };
      }

      Logger.info(`Closing context: ${contextId}`);

      // Close context
      await contextInstance.context.close();

      // Remove from map
      this.contexts.delete(contextId);
      
      // Update shared browser context count
      if (this.sharedBrowser) {
        this.sharedBrowser.contextCount--;
        
        // Close shared browser if no contexts remain
        if (this.sharedBrowser.contextCount === 0) {
          Logger.info('Closing shared browser - no contexts remaining');
          await this.sharedBrowser.browser.close();
          this.sharedBrowser = null;
        }
      }

      // Update database to mark as inactive
      const db = getScreenshotDB();
      db.deactivateBrowser(contextId); // TODO: rename to deactivateContext

      Logger.info(`Context closed successfully: ${contextId}`);

      return {
        success: true,
        contextId
      };

    } catch (error) {
      Logger.error(`Failed to close context ${contextId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check if context exists and is active
   */
  hasContext(contextId: string): boolean {
    return this.contexts.has(contextId);
  }


  /**
   * Get most recently used context
   */
  getMostRecentContext(): ContextInstance | null {
    const contexts = Array.from(this.contexts.values());
    if (contexts.length === 0) return null;
    
    // Return the most recently used context
    const sortedContexts = contexts.sort((a, b) => 
      b.lastUsedAt.getTime() - a.lastUsedAt.getTime()
    );
    
    return sortedContexts[0];
  }

  /**
   * Get context statistics
   */
  getContextStats(contextId?: string): ContextStats[] {
    const contexts = contextId 
      ? [this.contexts.get(contextId)].filter(Boolean) as ContextInstance[]
      : Array.from(this.contexts.values());

    return contexts.map(context => ({
      contextId: context.id,
      type: context.type,
      displayName: context.displayName,
      uptime: Date.now() - context.createdAt.getTime(),
      totalPages: 1, // TODO: Track actual page count
      totalScreenshots: 0, // TODO: Integrate with screenshot system
      totalLogs: 0, // TODO: Integrate with log system
      lastActivity: context.lastUsedAt
    }));
  }


  /**
   * Clean up all contexts and shared browser
   */
  private async cleanup(): Promise<void> {
    Logger.info('Cleaning up context manager...');
    
    const closeContextPromises = Array.from(this.contexts.keys())
      .map(contextId => this.closeContext(contextId));

    await Promise.allSettled(closeContextPromises);
    
    // Ensure shared browser is closed
    if (this.sharedBrowser) {
      try {
        await this.sharedBrowser.browser.close();
        this.sharedBrowser = null;
      } catch (error) {
        Logger.error('Error closing shared browser:', error);
      }
    }
    
    Logger.info('Context manager cleanup completed');
  }

  /**
   * Get total context count
   */
  getContextCount(): number {
    return this.contexts.size;
  }

  /**
   * Get maximum context limit
   */
  getMaxContexts(): number {
    return this.MAX_CONTEXTS;
  }

  /**
   * Get shared browser information
   */
  getSharedBrowserInfo(): SharedBrowserInstance | null {
    return this.sharedBrowser;
  }
}