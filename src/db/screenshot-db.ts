import pkg from 'node-sqlite3-wasm';
const { Database } = pkg;
import path from 'path';
import { TMP_DIRECTORY } from '../constants.js';
import { Logger } from '../utils/logger.js';

export interface ScreenshotRecord {
  id: string;
  hostname: string;
  pathname: string;
  query: string | null;
  hash: string | null;
  checkpoint_id: string | null;
  timestamp: Date;
  mime_type: string;
  description: string;
  browser_id?: string; // New field for browser identification
  browser_type?: string;
  session_id?: string;
}

export interface ParsedUrl {
  hostname: string;
  pathname: string;
  query: string;
  hash: string;
}

export class ScreenshotDB {
  private db: InstanceType<typeof Database>;

  constructor() {
    const dbPath = path.join(TMP_DIRECTORY, 'screenshots.db');
    this.db = new Database(dbPath);
    this.init();
    Logger.info(`Screenshot database initialized at: ${dbPath}`);
  }

  private init() {
    // Create screenshots table with browser support
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS screenshots (
        id TEXT PRIMARY KEY,
        hostname TEXT NOT NULL,
        pathname TEXT NOT NULL,
        query TEXT,
        hash TEXT,
        checkpoint_id TEXT,
        timestamp DATETIME NOT NULL,
        mime_type TEXT NOT NULL,
        description TEXT,
        browser_id TEXT,
        browser_type TEXT,
        session_id TEXT
      )
    `);

    // Create browser_instances table for persistence
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS browser_instances (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        display_name TEXT,
        metadata TEXT,
        created_at DATETIME NOT NULL,
        last_used_at DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_screenshots_url ON screenshots(hostname, pathname);
      CREATE INDEX IF NOT EXISTS idx_screenshots_checkpoint ON screenshots(checkpoint_id);
      CREATE INDEX IF NOT EXISTS idx_screenshots_browser ON screenshots(browser_id);
      CREATE INDEX IF NOT EXISTS idx_browser_instances_type ON browser_instances(type);
      CREATE INDEX IF NOT EXISTS idx_browser_instances_active ON browser_instances(is_active);
    `);
  }

  // Parse URL into components
  parseUrl(url: string): ParsedUrl {
    try {
      // Handle URLs that might not have a protocol
      let urlToParse = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        urlToParse = 'http://' + url;
      }

      const urlObj = new URL(urlToParse);
      // Remove trailing slash from pathname for consistency
      let pathname = urlObj.pathname;
      if (pathname.endsWith('/') && pathname.length > 1) {
        pathname = pathname.slice(0, -1);
      }

      return {
        hostname: urlObj.hostname + (urlObj.port ? `:${urlObj.port}` : ''),
        pathname,
        query: urlObj.search,
        hash: urlObj.hash
      };
    } catch (error) {
      Logger.error(`Failed to parse URL: ${url}`, error);
      throw error;
    }
  }

  // Find screenshot by ID
  findById(id: string): ScreenshotRecord | null {
    const rows = this.db.all(`
      SELECT * FROM screenshots WHERE id = ?
    `, [id]) as any[];

    if (!rows || rows.length === 0) return null;
    const row = rows[0];

    return {
      ...row,
      timestamp: new Date(row.timestamp)
    };
  }

  // Find latest screenshot by URL
  findLatestByUrl(hostname: string, pathname: string): ScreenshotRecord | null {
    Logger.info(`[findLatestByUrl] Searching for hostname: '${hostname}', pathname: '${pathname}'`);

    const rows = this.db.all(`
      SELECT * FROM screenshots
      WHERE hostname = ? AND pathname = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `, [hostname, pathname]) as any[];

    if (!rows || rows.length === 0) {
      Logger.info('[findLatestByUrl] No match found');
      return null;
    }
    const row = rows[0];

    Logger.info(`[findLatestByUrl] Found match with id: ${row.id}`);
    return {
      ...row,
      timestamp: new Date(row.timestamp)
    };
  }

  // Find all screenshots by URL
  findAllByUrl(hostname: string, pathname: string): ScreenshotRecord[] {
    const rows = this.db.all(`
      SELECT * FROM screenshots
      WHERE hostname = ? AND pathname = ?
      ORDER BY timestamp DESC
    `, [hostname, pathname]) as any[];

    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp)
    }));
  }

  // Find all screenshots
  findAll(): ScreenshotRecord[] {
    const rows = this.db.all(`
      SELECT * FROM screenshots
      ORDER BY timestamp DESC
    `) as any[];

    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp)
    }));
  }

  // Insert new screenshot
  insert(record: ScreenshotRecord): void {
    Logger.info(`Inserting screenshot: ${record.id}`);
    Logger.info(`Hostname: ${record.hostname}`);
    Logger.info(`Pathname: ${record.pathname}`);
    Logger.info(`Query: ${record.query}`);
    Logger.info(`Hash: ${record.hash}`);
    Logger.info(`Checkpoint ID: ${record.checkpoint_id}`);
    Logger.info(`Browser ID: ${record.browser_id}`);
    Logger.info(`Timestamp: ${record.timestamp}`);
    
    this.db.run(`
      INSERT INTO screenshots (
        id, hostname, pathname, query, hash,
        checkpoint_id, timestamp, mime_type, description,
        browser_id, browser_type, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      record.id,
      record.hostname,
      record.pathname,
      record.query,
      record.hash,
      record.checkpoint_id,
      record.timestamp instanceof Date ? record.timestamp.toISOString() : record.timestamp,
      record.mime_type,
      record.description,
      record.browser_id || null,
      record.browser_type || null,
      record.session_id || null
    ]);
  }

  // Delete screenshot by ID
  deleteById(id: string): boolean {
    const result = this.db.run(`
      DELETE FROM screenshots WHERE id = ?
    `, [id]);
    
    return result.changes > 0;
  }

  // Browser persistence methods
  
  // Insert or update browser instance
  saveBrowserInstance(id: string, type: string, displayName?: string, metadata?: any): void {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const now = new Date().toISOString();
    
    // Use REPLACE for upsert behavior
    this.db.run(`
      REPLACE INTO browser_instances (
        id, type, display_name, metadata, created_at, last_used_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [id, type, displayName || null, metadataJson, now, now]);
    
    Logger.info(`Browser instance saved: ${id} (${type})`);
  }
  
  // Update browser last used timestamp
  updateBrowserLastUsed(id: string): void {
    this.db.run(`
      UPDATE browser_instances 
      SET last_used_at = ?, is_active = 1
      WHERE id = ?
    `, [new Date().toISOString(), id]);
  }
  
  // Mark browser as inactive
  deactivateBrowser(id: string): void {
    this.db.run(`
      UPDATE browser_instances 
      SET is_active = 0
      WHERE id = ?
    `, [id]);
    Logger.info(`Browser marked as inactive: ${id}`);
  }
  
  // Get browser instance from database
  getBrowserInstance(id: string): any {
    const rows = this.db.all(`
      SELECT * FROM browser_instances WHERE id = ? AND is_active = 1
    `, [id]) as any[];
    
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    
    return {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      created_at: new Date(row.created_at),
      last_used_at: new Date(row.last_used_at),
      is_active: Boolean(row.is_active)
    };
  }
  
  // Get all active browser instances
  getAllActiveBrowsers(): any[] {
    const rows = this.db.all(`
      SELECT * FROM browser_instances 
      WHERE is_active = 1 
      ORDER BY last_used_at DESC
    `) as any[];
    
    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      created_at: new Date(row.created_at),
      last_used_at: new Date(row.last_used_at),
      is_active: Boolean(row.is_active)
    }));
  }
  
  // Delete browser instance from database
  deleteBrowserInstance(id: string): boolean {
    const result = this.db.run(`
      DELETE FROM browser_instances WHERE id = ?
    `, [id]);
    
    return result.changes > 0;
  }

  // Close database connection
  close() {
    this.db.close();
  }
}

// Singleton instance
let instance: ScreenshotDB | null = null;

export function getScreenshotDB(): ScreenshotDB {
  if (!instance) {
    instance = new ScreenshotDB();
  }
  return instance;
}

export function closeScreenshotDB() {
  if (instance) {
    instance.close();
    instance = null;
  }
}
