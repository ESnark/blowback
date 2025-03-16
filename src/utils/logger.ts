/**
 * Logging utility for MCP server
 * Uses console.error to output log messages to stderr instead of stdout
 * (MCP protocol sends JSON-RPC messages via stdout, so logging is done via stderr)
 */
export class Logger {
  /**
   * Info log message
   * @param message Log message
   * @param args Additional arguments
   */
  static info(message: string, ...args: any[]) {
    console.error(`[INFO] ${message}`, ...args);
  }

  /**
   * Error log message
   * @param message Log message
   * @param args Additional arguments
   */
  static error(message: string, ...args: any[]) {
    console.error(`[ERROR] ${message}`, ...args);
  }

  /**
   * Debug log message
   * @param message Log message
   * @param args Additional arguments
   */
  static debug(message: string, ...args: any[]) {
    console.error(`[DEBUG] ${message}`, ...args);
  }

  /**
   * Warning log message
   * @param message Log message
   * @param args Additional arguments
   */
  static warn(message: string, ...args: any[]) {
    console.error(`[WARN] ${message}`, ...args);
  }
}
