import Database from 'better-sqlite3';
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
}

export interface ParsedUrl {
  hostname: string;
  pathname: string;
  query: string;
  hash: string;
}

export class ScreenshotDB {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(TMP_DIRECTORY, 'screenshots.db');
    this.db = new Database(dbPath);
    this.init();
    Logger.info(`Screenshot database initialized at: ${dbPath}`);
  }

  private init() {
    // Create screenshots table
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
        description TEXT
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_screenshots_url ON screenshots(hostname, pathname);
      CREATE INDEX IF NOT EXISTS idx_screenshots_checkpoint ON screenshots(checkpoint_id);
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
    const stmt = this.db.prepare(`
      SELECT * FROM screenshots WHERE id = ?
    `);

    const row = stmt.get(id) as ScreenshotRecord | null;
    if (!row) return null;

    return {
      ...row,
      timestamp: new Date(row.timestamp)
    };
  }

  // Find latest screenshot by URL
  findLatestByUrl(hostname: string, pathname: string): ScreenshotRecord | null {
    Logger.info(`[findLatestByUrl] Searching for hostname: '${hostname}', pathname: '${pathname}'`);

    const stmt = this.db.prepare(`
      SELECT * FROM screenshots
      WHERE hostname = ? AND pathname = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    const row = stmt.get(hostname, pathname) as ScreenshotRecord | null;
    if (!row) {
      Logger.info('[findLatestByUrl] No match found');
      return null;
    }

    Logger.info(`[findLatestByUrl] Found match with id: ${row.id}`);
    return {
      ...row,
      timestamp: new Date(row.timestamp)
    };
  }

  // Find all screenshots by URL
  findAllByUrl(hostname: string, pathname: string): ScreenshotRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM screenshots
      WHERE hostname = ? AND pathname = ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(hostname, pathname) as ScreenshotRecord[];
    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp)
    }));
  }

  // Find all screenshots
  findAll(): ScreenshotRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM screenshots
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all() as ScreenshotRecord[];
    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp)
    }));
  }

  // Insert new screenshot
  insert(record: ScreenshotRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO screenshots (
        id, hostname, pathname, query, hash,
        checkpoint_id, timestamp, mime_type, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    Logger.info(`Inserting screenshot: ${record.id}`);
    Logger.info(`Hostname: ${record.hostname}`);
    Logger.info(`Pathname: ${record.pathname}`);
    Logger.info(`Query: ${record.query}`);
    Logger.info(`Hash: ${record.hash}`);
    Logger.info(`Checkpoint ID: ${record.checkpoint_id}`);
    Logger.info(`Timestamp: ${record.timestamp}`);
    stmt.run(
      record.id,
      record.hostname,
      record.pathname,
      record.query,
      record.hash,
      record.checkpoint_id,
      record.timestamp instanceof Date ? record.timestamp.toISOString() : record.timestamp,
      record.mime_type,
      record.description
    );
  }

  // Delete screenshot by ID
  deleteById(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM screenshots WHERE id = ?
    `);

    const result = stmt.run(id);
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
