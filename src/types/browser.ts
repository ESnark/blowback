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
 * Browser metadata interface
 */
export interface BrowserMetadata {
  tags?: string[];
  purpose?: string;
  targetUrl?: string;
  viewport?: { width: number; height: number };
  userAgent?: string;
  headless: boolean;
}

/**
 * Browser instance interface
 */
export interface BrowserInstance {
  id: string;
  type: BrowserType;
  displayName?: string;
  
  // Runtime objects
  browser: Browser;
  context: BrowserContext;
  page: Page | null;
  
  // Metadata
  metadata: BrowserMetadata;
  
  // Timing
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * Browser creation options
 */
export interface BrowserCreateOptions {
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
 * Browser operation result
 */
export interface BrowserOperationResult {
  success: boolean;
  browserId?: string;
  error?: string;
  data?: any;
}

/**
 * Browser list filter options
 */
export interface BrowserListOptions {
  activeOnly?: boolean;
  type?: BrowserType;
  tags?: string[];
}

/**
 * Browser statistics
 */
export interface BrowserStats {
  browserId: string;
  type: BrowserType;
  displayName?: string;
  uptime: number; // milliseconds
  totalPages: number;
  totalScreenshots: number;
  totalLogs: number;
  lastActivity: Date;
}