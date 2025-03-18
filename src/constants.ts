import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Logger } from "./utils/logger.js";

// Create random log directory path in temporary directory
const getLogDirectoryPath = (): { rootDir: string, logsDir: string, screenshotsDir: string } => {
  const tmpDir = os.tmpdir();
  const randomDirName = `mcp-${crypto.randomUUID().substring(0, 8)}`;
  const rootDir = path.join(tmpDir, randomDirName);
  const logsDir = path.join(rootDir, 'logs');
  const screenshotsDir = path.join(rootDir, 'screenshots');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
    Logger.info(`Created root directory: ${rootDir}`);
  }

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    Logger.info(`Created logs directory: ${logsDir}`);
  }

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    Logger.info(`Created screenshots directory: ${screenshotsDir}`);
  }
  
  return { rootDir, logsDir, screenshotsDir };
};

// Global directory path constants
const dirs = getLogDirectoryPath();
export const LOG_ROOT_DIRECTORY = dirs.rootDir;
export const LOG_DIRECTORY = dirs.logsDir;
export const SCREENSHOTS_DIRECTORY = dirs.screenshotsDir; 