import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Logger } from './utils/logger.js';

// Get project root from environment variable or current working directory
const getProjectRoot = (): string => {
  if (process.env.PROJECT_ROOT) {
    const resolvedPath = path.resolve(process.env.PROJECT_ROOT);
    Logger.info(`Using PROJECT_ROOT from environment: ${resolvedPath}`);
    return resolvedPath;
  }

  const cwd = process.cwd();
  Logger.info(`No PROJECT_ROOT environment variable, using current directory: ${cwd}`);
  return cwd;
};

// Create random log directory path in temporary directory
const getLogDirectoryPath = (): { rootDir: string, logsDir: string } => {
  const tmpDir = os.tmpdir();
  const randomDirName = `mcp-${crypto.randomUUID().substring(0, 8)}`;
  const rootDir = path.join(tmpDir, randomDirName);
  const logsDir = path.join(rootDir, 'logs');

  // Create directory if it doesn't exist
  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
    Logger.info(`Created temporary root directory: ${rootDir}`);
  }

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    Logger.info(`Created logs directory: ${logsDir}`);
  }

  return { rootDir, logsDir };
};

// Get screenshots directory in project root
const getScreenshotsDirectory = (): string => {
  const projectRoot = getProjectRoot();
  const screenshotsDir = path.join(projectRoot, '.mcp_screenshot');

  // Create directory if it doesn't exist
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    Logger.info(`Created screenshots directory: ${screenshotsDir}`);
  }

  return screenshotsDir;
};

// Global directory path constants
export const PROJECT_ROOT = getProjectRoot();
const dirs = getLogDirectoryPath();
export const TMP_DIRECTORY = dirs.rootDir;
export const LOG_DIRECTORY = dirs.logsDir;
export const SCREENSHOTS_DIRECTORY = getScreenshotsDirectory();

// Environment variable to enable base64 image responses
export const ENABLE_BASE64 = process.env.ENABLE_BASE64 === 'true' || process.env.ENABLE_BASE64 === '1';
