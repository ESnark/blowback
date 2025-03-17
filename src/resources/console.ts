import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import readline from "readline";
import { createReadStream } from "fs";
import { Logger } from "../utils/logger.js";

// 브라우저 도구에서 관리하는 콘솔 메시지 타입과 동일하게 맞춤
type ConsoleMessage = {
  type: string;
  text: string;
  timestamp: string;
  url: string;
  checkpointId: string | null;
};

// 외부에서 접근할 수 있도록 콘솔 메시지 저장소 export
export const consoleMessages: ConsoleMessage[] = [];

export function registerConsoleResource(server: McpServer, projectRoot: string) {
  const LOG_DIR = path.join(projectRoot, 'dist', 'logs');
  
  Logger.info(`Registering console-logs resource with LOG_DIR: ${LOG_DIR}`);

  server.resource("console-logs", "console-logs://", {
    description: "Get console logs from the development server, starting from the most recent logs",
    mimeType: "application/json",
    // properties: {
    //   checkpoint: z.string().optional().describe("If specified, returns only logs recorded at this checkpoint"),
    //   limit: z.number().optional().describe("Number of logs to return, ordered from most recent to oldest"),
    // },
  }, async (uri: URL) => {
    try {
      const checkpoint = uri.searchParams.get("checkpoint");
      const limit = uri.searchParams.get("limit") ? parseInt(uri.searchParams.get("limit")!) : undefined;

      // 로그 파일 경로 결정
      const logPath = checkpoint
        ? path.join(LOG_DIR, `browser-console.${checkpoint}.log`)
        : path.join(LOG_DIR, 'browser-console.log');

      // 파일이 존재하지 않으면 빈 배열 반환
      if (!await fs.access(logPath).then(() => true).catch(() => false)) {
        return { contents: [] };
      }

      // 로그 파일 읽기
      const logs: ConsoleMessage[] = [];
      const fileStream = createReadStream(logPath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        if (line.trim()) {
          try {
            const log = JSON.parse(line);
            logs.push(log);
          } catch (error) {
            // 잘못된 JSON 라인은 무시
            continue;
          }
        }
      }

      // 최신 순으로 정렬
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // limit이 지정된 경우 해당 개수만큼만 반환
      const limitedLogs = limit ? logs.slice(0, limit) : logs;

      return {
        contents: limitedLogs.map(log => ({
          uri: uri.toString(),
          text: JSON.stringify(log),
          mimeType: "application/json"
        }))
      };
    } catch (error) {
      throw new Error(`Failed to read console logs: ${error}`);
    }
  });
}
