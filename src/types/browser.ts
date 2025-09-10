import { Browser, BrowserContext, Page } from 'playwright';

/**
 * Browser type enumeration
 */
export enum BrowserType {
  CHROMIUM = 'chromium',
  FIREFOX = 'firefox',
  WEBKIT = 'webkit'
}

/**
 * Context metadata interface
 */
export interface ContextMetadata {
  tags?: string[];
  purpose?: string;
  targetUrl?: string;
  viewport?: { width: number; height: number };
  userAgent?: string;
  headless: boolean;
}

/**
 * Context instance interface
 */
export interface ContextInstance {
  id: string;
  type: BrowserType;
  displayName?: string;
  
  // Runtime objects
  context: BrowserContext;
  page: Page;
  
  // Metadata
  metadata: ContextMetadata;
  
  // Timing
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * Context creation options
 */
export interface ContextCreateOptions {
  id: string;
  type?: BrowserType;
  displayName?: string;
  headless?: boolean;
  targetUrl?: string;
  viewport?: { width: number; height: number };
  tags?: string[];
  purpose?: string;
}

/**
 * Context operation result
 */
export interface ContextOperationResult {
  success: boolean;
  contextId?: string;
  error?: string;
  data?: any;
}

/**
 * Context list filter options
 */
export interface ContextListOptions {
  activeOnly?: boolean;
  type?: BrowserType;
  tags?: string[];
}

/**
 * Context statistics
 */
export interface ContextStats {
  contextId: string;
  type: BrowserType;
  displayName?: string;
  uptime: number; // milliseconds
  totalPages: number;
  totalScreenshots: number;
  totalLogs: number;
  lastActivity: Date;
}

/**
 * Browser manager interface for shared browser instance
 */
export interface SharedBrowserInstance {
  browser: Browser;
  type: BrowserType;
  createdAt: Date;
  contextCount: number;
  cdpEndpoint?: string; // Chrome DevTools Protocol endpoint
}