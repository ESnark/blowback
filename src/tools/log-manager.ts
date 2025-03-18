import fs from "fs";
import path from "path";
import readline from "readline";
import { Logger } from "../utils/logger.js";
import { LOG_DIRECTORY } from "../constants.js";

/**
 * Manages log files with rotation implementation
 */
export class LogManager {
  private static instance: LogManager;
  private writeStream: fs.WriteStream | null = null;
  private currentLogCount: number = 0;
  private readonly MAX_LOGS_PER_FILE: number = 10000;
  private readonly logDir = LOG_DIRECTORY;
  private currentFileNumber: number = 0;
  
  // Checkpoint related fields
  private checkpointStreams: Map<string, {
    writeStream: fs.WriteStream | null;
    currentFileNumber: number;
    currentLogCount: number;
    timestamp: number;
  }> = new Map();
  private readonly MAX_CHECKPOINT_FILES = 3;

  private constructor() {
    // Check and create log directory
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.initializeLogFile();
    
    // Clean up all streams when process exits
    process.on('beforeExit', () => {
      this.closeAll();
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.closeAll();
      process.exit(0);
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      this.closeAll();
      process.exit(0);
    });
  }

  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }

    return LogManager.instance;
  }
  
  private getLogFilePath(fileNumber: number, checkpointId?: string): string {
    const filename = checkpointId ? `chk-${checkpointId}-${fileNumber}.log` : `default-log-${fileNumber}.log`;
    return path.join(this.logDir, filename);
  }

  private initializeLogFile({
    checkpointId,
    nextFileNumber = 0,
  }: {
    checkpointId?: string;
    nextFileNumber?: number;
  } = {}): void {
    try {
      const logFilePath = this.getLogFilePath(nextFileNumber, checkpointId);

      const writeStream = fs.createWriteStream(logFilePath, { flags: 'a' });
      writeStream.on('error', (error) => {
        Logger.error(`Log file write stream error for ${logFilePath}: ${error}`);
      });

      if (checkpointId && this.checkpointStreams.get(checkpointId) && this.checkpointStreams.get(checkpointId)?.writeStream !== null) {
        this.attachCheckpointStream(checkpointId);
      } else if (checkpointId) {
        this.checkpointStreams.get(checkpointId)?.writeStream?.end();
        this.checkpointStreams.set(checkpointId, {
          writeStream,
          currentFileNumber: nextFileNumber,
          currentLogCount: 0,
          timestamp: Date.now(),
        });
      } else {
        this.writeStream?.end();
        this.writeStream = writeStream;
        this.currentFileNumber = nextFileNumber;
        this.currentLogCount = 0;
      }
      Logger.info(`Initialized log file: ${logFilePath} (${this.currentLogCount} logs)`);
    } catch (error) {
      Logger.error(`Failed to initialize log file: ${error}`);
    }
  }

  private async attachCheckpointStream(checkpointId: string) {
    const detached = this.checkpointStreams.get(checkpointId);
    if (!detached || detached.writeStream === null) {
      return;
    }

    const writeStream = fs.createWriteStream(this.getLogFilePath(detached.currentFileNumber, checkpointId), { flags: 'a' });
    this.checkpointStreams.set(checkpointId, {
      writeStream,
      currentFileNumber: detached.currentFileNumber,
      currentLogCount: detached.currentLogCount,
      timestamp: Date.now(),
    });
  }

  private isCheckpointStreamAttached(checkpointId: string) {
    const stream = this.checkpointStreams.get(checkpointId);
    return stream && stream.writeStream !== null;
  }

  /**
   * detach checkpoint streams that are not in use
   */
  private async detachCheckpointStreams() {
    const checkpointIds = Array.from(this.checkpointStreams.keys());
    checkpointIds.sort((a, b) => a.localeCompare(b));

    for (const checkpointId of checkpointIds.slice(0, -this.MAX_CHECKPOINT_FILES)) {
      const streamData = this.checkpointStreams.get(checkpointId);
      if (streamData) {
        streamData.writeStream?.end();
        streamData.writeStream = null;
      }
    }
  }

  public async appendLog(logEntry: string, checkpointId?: string): Promise<void> {
    try {
      // Append log to default log file
      await new Promise<void>((resolve, reject) => {
        const writeStream = this.writeStream;

        if (!writeStream) {
          reject(new Error('Log file is not initialized'));
          return;
        }

        this.writeStream?.write(logEntry, (err: Error | null | undefined) => {
          if (err) { reject(err) } else {
            this.currentLogCount++;

            if (this.currentLogCount >= this.MAX_LOGS_PER_FILE) {
              this.initializeLogFile({ nextFileNumber: this.currentFileNumber + 1 });
            }

            resolve();
          }
        });
      });

      // Append log to checkpoint log file
      if (checkpointId && this.isCheckpointStreamAttached(checkpointId) === false) {
        await this.attachCheckpointStream(checkpointId);
      }

      if (checkpointId) {
        await new Promise<void>((resolve, reject) => {
          const streamData = this.checkpointStreams.get(checkpointId);

          if (!streamData) {
            reject(new Error('Checkpoint stream data not found'));
            return;
          }

          streamData.writeStream?.write(logEntry, (err: Error | null | undefined) => {
            if (err) { reject(err) } else {
              streamData.currentLogCount++;

              if (streamData.currentLogCount >= this.MAX_LOGS_PER_FILE) {
                this.initializeLogFile({ nextFileNumber: streamData.currentFileNumber + 1, checkpointId });
              }

              resolve();
            }
          });
        });
      }
    } catch (error) {
      Logger.error(`Failed to append log: ${error}`);
    }
  }

  public async readLogs(limit: number, checkpointId?: string): Promise<{ logs: string[], writePosition: number, totalLogs: number }> {
    try {
      // 1. Calculate necessary information
      const logDir = path.dirname(this.getLogFilePath(0, checkpointId));
      const filePattern = checkpointId ? 
        new RegExp(`^chk-${checkpointId}-(\\d+)\\.log$`) : 
        /^default-log-(\d+)\.log$/;
      
      // 2. Find log files in directory
      const files = fs.existsSync(logDir) ? fs.readdirSync(logDir) : [];
      const logFiles = files
        .filter(file => filePattern.test(file))
        .map(file => {
          const match = file.match(filePattern);
          return {
            file,
            path: path.join(logDir, file),
            number: match ? parseInt(match[1], 10) : -1
          };
        })
        .filter(item => item.number >= 0)
        .sort((a, b) => a.number - b.number); // Sort in order (oldest first)
      
      if (logFiles.length === 0) {
        return { logs: [], writePosition: 0, totalLogs: 0 };
      }
      
      // 3. Calculate total number of logs (completed files + current file log count)
      const lastFileIndex = logFiles.length - 1;
      const completedFilesLogs = lastFileIndex * this.MAX_LOGS_PER_FILE;
      
      // Get log count of the last file
      let currentFileLogCount = 0;
      if (checkpointId) {
        const checkpointData = this.checkpointStreams.get(checkpointId);
        currentFileLogCount = checkpointData ? checkpointData.currentLogCount : 0;
      } else {
        currentFileLogCount = this.currentLogCount;
      }
      
      const totalLogs = completedFilesLogs + currentFileLogCount;
      
      // 4. Return empty result if no logs needed
      if (totalLogs === 0) {
        return { logs: [], writePosition: currentFileLogCount, totalLogs: 0 };
      }
      
      // 5. Calculate start position and number of logs to read
      const startPosition = Math.max(0, totalLogs - limit);
      const startFileIndex = Math.floor(startPosition / this.MAX_LOGS_PER_FILE);
      const startLogInFile = startPosition % this.MAX_LOGS_PER_FILE;
      
      // 6. Read log files (using stream)
      const logs: string[] = [];
      let logsNeeded = Math.min(limit, totalLogs);
      
      for (let i = startFileIndex; i < logFiles.length && logsNeeded > 0; i++) {
        const filePath = logFiles[i].path;
        if (!fs.existsSync(filePath)) continue;
        
        // Read line by line using readline interface
        const rl = readline.createInterface({
          input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
          crlfDelay: Infinity
        });
        
        let skippedLines = 0;
        
        // Skip lines if this is the first file and has a start position
        const shouldSkipLines = (i === startFileIndex && startLogInFile > 0);
        const linesToSkip = shouldSkipLines ? startLogInFile : 0;
        
        for await (const line of rl) {
          if (!line.trim()) continue;
          
          // Skip necessary lines
          if (shouldSkipLines && skippedLines < linesToSkip) {
            skippedLines++;
            continue;
          }
          
          logs.push(line);
          logsNeeded--;
          
          if (logsNeeded <= 0) {
            rl.close();
            break;
          }
        }
      }
      
      // 7. Return result
      return {
        logs,
        writePosition: currentFileLogCount,
        totalLogs
      };
    } catch (error) {
      Logger.error(`Failed to read logs: ${error}`);
      return { logs: [], writePosition: 0, totalLogs: 0 };
    }
  }

  private findAllLogFiles(checkpointId?: string): string[] {
    const allLogFiles = [];
    for (let i = 0; i < this.MAX_LOGS_PER_FILE; i++) {
      const logFile = this.getLogFilePath(i, checkpointId);
      allLogFiles.push(logFile);
    }

    return allLogFiles;
  }

  public close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
  
  public closeAll(): void {
    // Close default log stream
    this.close();
    
    // Close all checkpoint streams
    for (const [checkpointId, streamData] of this.checkpointStreams.entries()) {
      streamData.writeStream?.end();
      Logger.info(`Closed checkpoint log stream for ${checkpointId}`);
    }
    
    this.checkpointStreams.clear();
  }
} 