import { WriteStream, createWriteStream } from "fs";
import { Transform } from "stream";
import fs from "fs/promises";
import path from "path";
import { Logger } from "../utils/logger.js";
import { createReadStream } from "fs";
import readline from "readline";

class CircularLogStream extends Transform {
  private currentLogCount = 0;
  private readonly maxLogLines = 1000;
  private writePosition = 0;
  private logPositions: { start: number; length: number }[] = [];

  constructor() {
    super({
      transform(chunk, encoding, callback) {
        this.push(chunk);
        callback();
      }
    });
  }

  _transform(chunk: any, encoding: string, callback: Function) {
    const logEntry = chunk.toString();
    const logSize = Buffer.byteLength(logEntry);

    if (this.currentLogCount < this.maxLogLines) {
      // 최대 라인 수에 도달하지 않은 경우 그냥 추가
      this.logPositions.push({
        start: this.logPositions.length > 0 
          ? this.logPositions[this.logPositions.length - 1].start + this.logPositions[this.logPositions.length - 1].length 
          : 0,
        length: logSize
      });
      this.currentLogCount++;
      callback(null, logEntry);
    } else {
      // 최대 라인 수에 도달한 경우 가장 오래된 로그 위치에 새 로그 작성
      const oldestLog = this.logPositions[this.writePosition];
      
      // 로그 위치 업데이트
      this.logPositions[this.writePosition] = {
        start: oldestLog.start,
        length: logSize
      };
      
      // 다음 쓰기 위치로 이동
      this.writePosition = (this.writePosition + 1) % this.maxLogLines;
      
      // 새 로그를 이전 로그 위치에 덮어쓰기
      callback(null, Buffer.concat([
        Buffer.from('\u0000'.repeat(oldestLog.length)), // 이전 로그 영역을 null 문자로 채움
        Buffer.from(logEntry)
      ]));
    }
  }
}

// 공통 로그 읽기 함수
async function readCircularBufferLogs(logPath: string, limit?: number): Promise<{ logs: any[]; writePosition: number; totalLogs: number }> {
  try {
    // 파일이 존재하지 않으면 빈 배열 반환
    if (!await fs.access(logPath).then(() => true).catch(() => false)) {
      Logger.info(`Log file not found: ${logPath}`);
      return { logs: [], writePosition: 0, totalLogs: 0 };
    }

    // 로그 파일 읽기
    const logs: any[] = [];
    const fileStream = createReadStream(logPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let writePosition = 0;
    let currentLogCount = 0;

    // 먼저 writePosition과 currentLogCount 찾기
    for await (const line of rl) {
      if (line.trim()) {
        try {
          const log = JSON.parse(line);
          currentLogCount++;
        } catch (error) {
          // 빈 라인이나 파싱 불가능한 라인은 writePosition으로 간주
          writePosition = currentLogCount;
        }
      }
    }

    // 스트림 다시 생성
    const secondFileStream = createReadStream(logPath);
    const secondRl = readline.createInterface({
      input: secondFileStream,
      crlfDelay: Infinity
    });

    // 실제 로그 읽기
    let readCount = 0;
    const requestedLimit = limit || currentLogCount;
    const effectiveLimit = Math.min(requestedLimit, currentLogCount);

    // writePosition부터 시작하여 순환하면서 읽기
    let lineCount = 0;
    for await (const line of secondRl) {
      if (line.trim()) {
        try {
          // writePosition 이후의 로그부터 읽기 시작
          if (lineCount >= writePosition) {
            const log = JSON.parse(line);
            logs.push(log);
            readCount++;
          }
          
          // writePosition 이전의 로그도 필요한 경우
          if (readCount < effectiveLimit && lineCount < writePosition) {
            const log = JSON.parse(line);
            logs.push(log);
            readCount++;
          }

          // 충분한 로그를 읽었으면 중단
          if (readCount >= effectiveLimit) {
            break;
          }

          lineCount++;
        } catch (error) {
          Logger.error(`Failed to parse log line: ${error}`);
          continue;
        }
      }
    }

    Logger.info(`Retrieved ${logs.length} logs from write position ${writePosition} (total logs: ${currentLogCount})`);

    return {
      logs,
      writePosition,
      totalLogs: currentLogCount
    };
  } catch (error) {
    Logger.error(`Failed to read logs: ${error}`);
    throw error;
  }
}

export class LogManager {
  private writeStream: WriteStream | null = null;
  private circularStream: CircularLogStream | null = null;
  private static instances: Set<LogManager> = new Set();

  constructor(private logFilePath: string) {
    LogManager.instances.add(this);
  }

  async initialize() {
    try {
      // 로그 디렉토리 생성
      await fs.mkdir(path.dirname(this.logFilePath), { recursive: true });

      // 순환 스트림 생성
      this.circularStream = new CircularLogStream();
      
      // 쓰기 스트림 생성
      this.writeStream = createWriteStream(this.logFilePath, { flags: 'a' });
      
      // 스트림 연결
      this.circularStream.pipe(this.writeStream);

      // 에러 핸들링
      this.writeStream.on('error', (error) => {
        Logger.error(`Log write stream error: ${error}`);
      });
    } catch (error) {
      Logger.error(`Failed to initialize log manager: ${error}`);
    }
  }

  async appendLog(logEntry: string) {
    try {
      if (!this.circularStream) {
        await this.initialize();
      }

      if (!this.circularStream) {
        throw new Error('Failed to initialize streams');
      }

      this.circularStream.write(logEntry);
    } catch (error) {
      Logger.error(`Failed to append log: ${error}`);
    }
  }

  async readLogs(limit?: number): Promise<{ logs: any[]; writePosition: number; totalLogs: number }> {
    return readCircularBufferLogs(this.logFilePath, limit);
  }

  async close() {
    if (this.circularStream) {
      this.circularStream.end();
    }
    if (this.writeStream) {
      await new Promise(resolve => this.writeStream!.end(resolve));
      this.writeStream = null;
    }
    LogManager.instances.delete(this);
  }

  static async closeAll() {
    for (const instance of LogManager.instances) {
      await instance.close();
    }
    LogManager.instances.clear();
  }
}

export class CheckpointLogManager {
  private static instance: CheckpointLogManager;
  private checkpointStreams: Map<string, {
    circularStream: CircularLogStream;
    writeStream: WriteStream;
    timestamp: number;
  }> = new Map();

  private constructor() {
    // 프로세스 종료 시 모든 스트림 정리
    process.on('beforeExit', () => {
      this.closeAll();
    });

    // SIGINT (Ctrl+C) 처리
    process.on('SIGINT', () => {
      this.closeAll();
      process.exit(0);
    });

    // SIGTERM 처리
    process.on('SIGTERM', () => {
      this.closeAll();
      process.exit(0);
    });
  }

  static getInstance(): CheckpointLogManager {
    if (!this.instance) {
      this.instance = new CheckpointLogManager();
    }
    return this.instance;
  }

  async appendLog(checkpointId: string, logEntry: string, logDir: string) {
    try {
      let streamData = this.checkpointStreams.get(checkpointId);

      if (!streamData) {
        // 새로운 스트림 생성
        const logPath = path.join(logDir, `browser-console.${checkpointId}.log`);
        const writeStream = createWriteStream(logPath, { flags: 'a' });
        const circularStream = new CircularLogStream();

        // 스트림 연결
        circularStream.pipe(writeStream);

        // 스트림 맵에 추가
        streamData = {
          circularStream,
          writeStream,
          timestamp: Date.now()
        };
        this.checkpointStreams.set(checkpointId, streamData);

        // 스트림이 2개를 초과하면 가장 오래된 스트림 제거
        if (this.checkpointStreams.size > 2) {
          let oldestCheckpoint: string | null = null;
          let oldestTimestamp = Infinity;

          for (const [id, data] of this.checkpointStreams) {
            if (data.timestamp < oldestTimestamp) {
              oldestTimestamp = data.timestamp;
              oldestCheckpoint = id;
            }
          }

          if (oldestCheckpoint) {
            const oldData = this.checkpointStreams.get(oldestCheckpoint);
            if (oldData) {
              oldData.circularStream.end();
              oldData.writeStream.end();
            }
            this.checkpointStreams.delete(oldestCheckpoint);
          }
        }

        // 에러 핸들링
        writeStream.on('error', (error) => {
          Logger.error(`Checkpoint log write stream error for ${checkpointId}: ${error}`);
        });
      }

      // 로그 작성
      streamData.circularStream.write(logEntry);
    } catch (error) {
      Logger.error(`Failed to append checkpoint log: ${error}`);
    }
  }

  async readLogs(checkpointId: string, logDir: string, limit?: number): Promise<{ logs: any[]; writePosition: number; totalLogs: number }> {
    const logPath = path.join(logDir, `browser-console.${checkpointId}.log`);
    return readCircularBufferLogs(logPath, limit);
  }

  async closeAll() {
    const promises: Promise<void>[] = [];
    
    for (const [checkpointId, data] of this.checkpointStreams) {
      promises.push(
        new Promise<void>((resolve) => {
          data.circularStream.end(() => {
            data.writeStream.end(() => {
              resolve();
            });
          });
        })
      );
    }

    await Promise.all(promises);
    this.checkpointStreams.clear();
  }
}

// 프로세스 종료 이벤트 처리를 전역으로 관리
process.on('beforeExit', async () => {
  await Promise.all([
    LogManager.closeAll(),
    CheckpointLogManager.getInstance().closeAll()
  ]);
});

process.on('SIGINT', async () => {
  await Promise.all([
    LogManager.closeAll(),
    CheckpointLogManager.getInstance().closeAll()
  ]);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await Promise.all([
    LogManager.closeAll(),
    CheckpointLogManager.getInstance().closeAll()
  ]);
  process.exit(0);
}); 