import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { HMREvent } from "../types/hmr.js";
import { Logger } from "../utils/logger.js";
import { randomUUID } from "crypto";
import { LogManager, CheckpointLogManager } from "./log-manager.js";
import { createReadStream } from "fs";
import readline from "readline";

// Return type definition
type BrowserStatus = {
  isStarted: true;
  page: puppeteer.Page;
} | {
  isStarted: false;
  error: {
    content: { type: "text"; text: string; }[];
    isError: true;
  };
};

export function registerBrowserTools(
  server: McpServer,
  browserRef: { current: puppeteer.Browser | null },
  pageRef: { current: puppeteer.Page | null },
  lastHMREvents: HMREvent[],
  projectRootRef: { current: string },
  viteDevServerUrlRef: { current: string }
) {
  const LOG_FILE_PATH = path.join(projectRootRef.current, 'dist', 'logs', 'browser-console.log');
  const logManager = new LogManager(LOG_FILE_PATH);
  
  // 로그를 파일에 기록하는 함수
  async function appendLogToFile(type: string, text: string) {
    try {
      // meta 태그에서 현재 checkpoint ID 읽기
      const checkpointId = await pageRef.current?.evaluate(() => {
        const metaTag = document.querySelector('meta[name="__vite_hmr_cursor"]');
        return metaTag ? metaTag.getAttribute('data-hash') : null;
      }) || null;

      const url = await pageRef.current?.evaluate(() => window.location.href) || 'unknown';
      const logEntry = JSON.stringify({
        type,
        text,
        timestamp: new Date().toISOString(),
        url,
        checkpointId
      }) + '\n';

      // 기본 로그 파일에 기록
      await logManager.appendLog(logEntry);

      // checkpoint 로그 파일에도 기록 (checkpoint가 있는 경우)
      if (checkpointId) {
        const checkpointLogManager = CheckpointLogManager.getInstance();
        await checkpointLogManager.appendLog(
          checkpointId,
          logEntry,
          path.dirname(LOG_FILE_PATH)
        );
      }
    } catch (error) {
      Logger.error(`Failed to write console log to file: ${error}`);
    }
  }

  // Utility function: Check browser status
  const ensureBrowserStarted = (): BrowserStatus => {
    if (!browserRef.current || !pageRef.current) {
      return {
        isStarted: false,
        error: {
          content: [
            {
              type: "text",
              text: "Browser not started. Please call start-browser first."
            }
          ],
          isError: true
        }
      };
    }
    return { isStarted: true, page: pageRef.current };
  };

  // Utility function: Get current checkpoint ID
  const getCurrentCheckpointId = async (page: puppeteer.Page) => {
    const checkpointId = await page.evaluate(() => {
      const metaTag = document.querySelector('meta[name="__vite_hmr_cursor"]');
      return metaTag ? metaTag.getAttribute('data-hash') : null;
    });
    return checkpointId;
  };

  // Browser start tool
  server.tool(
    "start-browser",
    "Launches a browser instance and navigates to the Vite dev server",
    {
      viteServerUrl: z.string().optional().describe("URL of the Vite dev server (default: http://localhost:5173)"),
      headless: z.boolean().optional().describe("Run browser in headless mode")
    },
    async ({ viteServerUrl = "http://localhost:5173", headless = false }) => {
      try {
        if (browserRef.current) {
          await browserRef.current.close();
          Logger.info("Closed existing browser instance");
        }
        
        Logger.info(`Starting browser and navigating to ${viteServerUrl}`);
        browserRef.current = await puppeteer.launch({ 
          headless,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        pageRef.current = await browserRef.current.newPage();
        await pageRef.current.setViewport({ width: 1280, height: 800 });
        
        // 콘솔 메시지 핸들러
        pageRef.current.on('console', async msg => {
          const messageText = msg.text();
          const messageType = msg.type();
          await appendLogToFile(messageType, messageText);
          Logger.debug(`Browser console ${messageType}: ${messageText}`);
        });
        
        // 페이지 에러 핸들러
        pageRef.current.on('pageerror', async err => {
          await appendLogToFile('error', err.message);
          Logger.error(`Browser page error: ${err}`);
          lastHMREvents.unshift({
            type: 'browser-error',
            err: {
              message: err.message,
              stack: err.stack || ""
            }
          });
          if (lastHMREvents.length > 10) {
            lastHMREvents.pop();
          }
        });

        // 페이지 이동 이벤트 리스너 설정
        pageRef.current.on('framenavigated', async frame => {
          if (frame === pageRef.current?.mainFrame()) {
            const url = frame.url();
            await appendLogToFile('navigation', `frame navigated: ${url}`);
          }
        });
        
        // Navigate to Vite development server
        await pageRef.current.goto(viteServerUrl, { waitUntil: 'networkidle0' });
        viteDevServerUrlRef.current = viteServerUrl;
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully started browser and navigated to ${viteServerUrl}`
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to start browser: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to start browser: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Screenshot capture tool
  server.tool(
    "capture-screenshot",
    "Captures a screenshot of the current page or a specific element",
    {
      selector: z.string().optional().describe("CSS selector to capture (captures full page if not provided)"),
      saveToFile: z.boolean().optional().describe("Whether to save as a file (default: false)")
    },
    async ({ selector, saveToFile = false }) => {
      try {
        // Check browser status
        const browserStatus = ensureBrowserStarted();
        if (!browserStatus.isStarted) {
          return browserStatus.error;
        }
        
        // Get current checkpoint ID
        const checkpointId = await getCurrentCheckpointId(browserStatus.page);
        
        let screenshot: string | Buffer;
        let screenshotFilepath: string | undefined;
        
        if (selector) {
          // Wait for element to appear
          await browserStatus.page.waitForSelector(selector, { visible: true, timeout: 5000 });
          const element = await browserStatus.page.$(selector);
          
          if (!element) {
            return {
              content: [
                {
                  type: "text",
                  text: `Element with selector "${selector}" not found`
                }
              ],
              isError: true
            };
          }
          
          screenshot = await element.screenshot({ encoding: 'base64' });
        } else {
          // Capture full page
          screenshot = await browserStatus.page.screenshot({ encoding: 'base64', fullPage: true });
        }
        
        // Save to file if needed
        if (saveToFile) {
          // Use checkpoint ID or random ID for filename
          const hashForFilename = checkpointId || randomUUID().substring(0, 8);
          
          // Generate filename: YYYY-MM-DD.{checkpoint_hash}.png
          const filename = `${new Date().toISOString().split('T')[0]}.${hashForFilename}.png`;
          
          // Create screenshots directory in project root
          const screenshotsDir = path.join(projectRootRef.current, 'screenshots');
          try {
            await fs.mkdir(screenshotsDir, { recursive: true });
          } catch (error) {
            Logger.error(`Failed to create screenshots directory: ${error}`);
          }
          
          // Full file path
          screenshotFilepath = path.join(screenshotsDir, filename);
          
          // Save file
          if (typeof screenshot === 'string') {
            await fs.writeFile(screenshotFilepath, Buffer.from(screenshot, 'base64'));
          } else {
            await fs.writeFile(screenshotFilepath, screenshot);
          }
          
          Logger.info(`Screenshot saved: ${screenshotFilepath}`);
        }
        
        // Result message construction
        const resultMessage = {
          message: screenshotFilepath 
            ? `Screenshot saved to ${screenshotFilepath}` 
            : `Screenshot captured ${selector ? `of element "${selector}"` : 'of full page'}`,
          filename: screenshotFilepath ? path.basename(screenshotFilepath) : undefined,
          checkpointId
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resultMessage, null, 2)
            },
            {
              type: "image",
              data: typeof screenshot === 'string'
                ? screenshot
                : (screenshot as Buffer).toString('base64'),
              mimeType: "image/png"
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to capture screenshot: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to capture screenshot: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Element properties retrieval tool
  server.tool(
    "get-element-properties",
    "Retrieves properties and state information of a specific element",
    {
      selector: z.string().describe("CSS selector of the element to inspect"),
      properties: z.array(z.string()).describe("Array of property names to retrieve (e.g., ['value', 'checked', 'textContent'])")
    },
    async ({ selector, properties }) => {
      try {
        // Check browser status
        const browserStatus = ensureBrowserStarted();
        if (!browserStatus.isStarted) {
          return browserStatus.error;
        }
        
        // Get current checkpoint ID
        const checkpointId = await getCurrentCheckpointId(browserStatus.page);
        
        // Check if element exists
        await browserStatus.page.waitForSelector(selector, { visible: true, timeout: 5000 });
        
        // Retrieve element properties
        const elementProperties = await browserStatus.page.evaluate((selector, propertiesToGet) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          
          const result: Record<string, any> = {};
          propertiesToGet.forEach(prop => {
            result[prop] = (element as any)[prop];
          });
          return result;
        }, selector, properties);
        
        if (!elementProperties) {
          return {
            content: [
              {
                type: "text",
                text: `Element with selector "${selector}" not found`
              }
            ],
            isError: true
          };
        }
        
        // Result message construction
        const resultMessage = {
          selector,
          properties: elementProperties,
          checkpointId
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resultMessage, null, 2)
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to get element properties: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get element properties: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Element styles retrieval tool
  server.tool(
    "get-element-styles",
    "Retrieves style information of a specific element",
    {
      selector: z.string().describe("CSS selector of the element to inspect"),
      styleProperties: z.array(z.string()).describe("Array of style property names to retrieve (e.g., ['color', 'fontSize', 'backgroundColor'])")
    },
    async ({ selector, styleProperties }) => {
      try {
        // Check browser status
        const browserStatus = ensureBrowserStarted();
        if (!browserStatus.isStarted) {
          return browserStatus.error;
        }
        
        // Get current checkpoint ID
        const checkpointId = await getCurrentCheckpointId(browserStatus.page);
        
        // Retrieve element styles
        const styles = await browserStatus.page.evaluate((selector, stylePropsToGet) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          
          const computedStyle = window.getComputedStyle(element);
          const result: Record<string, string> = {};
          
          stylePropsToGet.forEach(prop => {
            result[prop] = computedStyle.getPropertyValue(prop);
          });
          
          return result;
        }, selector, styleProperties);
        
        if (!styles) {
        return {
          content: [
            {
              type: "text",
                text: `Element with selector "${selector}" not found`
              }
            ],
            isError: true
          };
        }
        
        // Result message construction
        const resultMessage = {
          selector,
          styles,
          checkpointId
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resultMessage, null, 2)
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to get element styles: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get element styles: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Element dimensions and position retrieval tool
  server.tool(
    "get-element-dimensions",
    "Retrieves dimension and position information of a specific element",
    {
      selector: z.string().describe("CSS selector of the element to inspect")
    },
    async ({ selector }) => {
      try {
        // Check browser status
        const browserStatus = ensureBrowserStarted();
        if (!browserStatus.isStarted) {
          return browserStatus.error;
        }
        
        // Get current checkpoint ID
        const checkpointId = await getCurrentCheckpointId(browserStatus.page);
        
        // Retrieve element dimensions and position information
        const dimensions = await browserStatus.page.evaluate((selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right,
            x: rect.x,
            y: rect.y,
            isVisible: !!(
              rect.width && 
              rect.height && 
              window.getComputedStyle(element).display !== 'none' &&
              window.getComputedStyle(element).visibility !== 'hidden'
            )
          };
        }, selector);
        
        if (!dimensions) {
          return {
            content: [
              {
                type: "text",
                text: `Element with selector "${selector}" not found`
              }
            ],
            isError: true
          };
        }
        
        // Result message construction
        const resultMessage = {
          selector,
          dimensions,
          checkpointId
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resultMessage, null, 2)
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to get element dimensions: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get element dimensions: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Network request monitoring tool
  server.tool(
    "monitor-network",
    "Monitors network requests in the browser for a specified duration",
    {
      urlPattern: z.string().optional().describe("URL pattern to filter (regex string)"),
      duration: z.number().optional().describe("Duration in milliseconds to monitor (default: 5000)")
    },
    async ({ urlPattern, duration = 5000 }) => {
      try {
        // Check browser status
        const browserStatus = ensureBrowserStarted();
        if (!browserStatus.isStarted) {
          return browserStatus.error;
        }
        
        const requests: any[] = [];
        const pattern = urlPattern ? new RegExp(urlPattern) : null;
        
        // Start network request monitoring
        await browserStatus.page.setRequestInterception(true);
        
        const requestHandler = (request: puppeteer.HTTPRequest) => {
          const url = request.url();
          if (!pattern || pattern.test(url)) {
            requests.push({
              url,
              method: request.method(),
              resourceType: request.resourceType(),
              timestamp: Date.now()
            });
          }
          request.continue();
        };
        
        browserStatus.page.on('request', requestHandler);
        
        // Wait for specified duration
        await new Promise(resolve => setTimeout(resolve, duration));
        
        // Stop monitoring
        browserStatus.page.off('request', requestHandler);
        await browserStatus.page.setRequestInterception(false);
        
        return {
          content: [
            {
              type: "text",
              text: requests.length > 0 
                ? `Captured ${requests.length} network requests:\n${JSON.stringify(requests, null, 2)}` 
                : `No network requests matching the criteria were captured during the monitoring period.`
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to monitor network: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to monitor network: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Element HTML content retrieval tool
  server.tool(
    "get-element-html",
    "Retrieves the HTML content of a specific element and its children",
    {
      selector: z.string().describe("CSS selector of the element to inspect"),
      includeOuter: z.boolean().optional().describe("If true, includes the selected element's outer HTML; otherwise returns only inner HTML (default: false)")
    },
    async ({ selector, includeOuter = false }) => {
      try {
        // Check browser status
        const browserStatus = ensureBrowserStarted();
        if (!browserStatus.isStarted) {
          return browserStatus.error;
        }
        
        // Check if element exists
        await browserStatus.page.waitForSelector(selector, { visible: true, timeout: 5000 });
        
        // Get element's HTML content
        const htmlContent = await browserStatus.page.evaluate((selector, includeOuter) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          
          return includeOuter ? element.outerHTML : element.innerHTML;
        }, selector, includeOuter);
        
        if (htmlContent === null) {
          return {
            content: [
              {
                type: "text",
                text: `Element with selector "${selector}" not found`
              }
            ],
            isError: true
          };
        }
        
        // Result message construction
        const resultMessage = {
          selector,
          htmlType: includeOuter ? "outerHTML" : "innerHTML",
          length: htmlContent.length,
          checkpointId: await getCurrentCheckpointId(browserStatus.page)
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resultMessage, null, 2)
            },
            {
              type: "text",
              text: htmlContent
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to get element HTML: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get element HTML: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Console logs retrieval tool
  server.tool(
    "get-console-logs",
    "Retrieves console logs from the development server",
    {
      checkpoint: z.string().optional().describe("If specified, returns only logs recorded at this checkpoint"),
      limit: z.number().optional().describe("Number of logs to return, starting from the most recent log")
    },
    async ({ checkpoint, limit }) => {
      try {
        const logPath = checkpoint
          ? path.join(path.dirname(LOG_FILE_PATH), `browser-console.${checkpoint}.log`)
          : LOG_FILE_PATH;

        Logger.info(`Reading logs from: ${logPath}`);

        // 체크포인트별 로그 매니저 생성
        const logManager = new LogManager(logPath);
        
        // 로그 읽기
        const { logs } = await logManager.readLogs(limit);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                logs,
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        Logger.error(`Failed to read console logs: ${error}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to read console logs: ${error}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Browser command execution tool
  server.tool(
    "execute-browser-commands",
    `Executes a sequence of predefined browser commands safely. Available commands:

- click: Clicks on an element matching the selector or at specified coordinates
- type: Types text into an input element
- wait: Waits for an element, a specified time period, or a condition
- navigate: Navigates to a specified URL
- select: Selects an option in a dropdown
- check: Checks or unchecks a checkbox
- hover: Hovers over an element
- focus: Focuses an element
- blur: Removes focus from an element
- keypress: Simulates pressing a keyboard key
- scroll: Scrolls the page or an element
- getAttribute: Gets an attribute value from an element
- getProperty: Gets a property value from an element
- drag: Performs a drag operation from one position to another
- refresh: Refreshes the current page

Note on coordinates: For all mouse-related commands (click, drag, etc.), coordinates are relative to the browser viewport
where (0,0) is the top-left corner. X increases to the right, Y increases downward.

Examples are available in the schema definition.`,
    {
      commands: z.array(
        z.discriminatedUnion("command", [
          z.object({
            command: z.literal("click"),
            selector: z.string().optional().describe("CSS selector of element to click (required unless x,y coordinates are provided)"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button to use (default: left)"),
              clickCount: z.number().optional().describe("Number of clicks (default: 1)"),
              delay: z.number().optional().describe("Delay between mousedown and mouseup in ms (default: 0)"),
              x: z.number().optional().describe("X coordinate to click (used instead of selector)"),
              y: z.number().describe("Y coordinate to click (used instead of selector)"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            }).optional()
          }),
          z.object({
            command: z.literal("type"),
            selector: z.string().describe("CSS selector of input element to type into"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              text: z.string().describe("Text to type into the element"),
              delay: z.number().optional().describe("Delay between keystrokes in ms (default: 0)"),
              clearFirst: z.boolean().optional().describe("Whether to clear the input field before typing (default: false)"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            }).optional()
          }),
          z.object({
            command: z.literal("wait"),
            selector: z.string().optional().describe("CSS selector to wait for"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              time: z.number().optional().describe("Time to wait in milliseconds (use this or selector)"),
              visible: z.boolean().optional().describe("Wait for element to be visible (default: true)"),
              timeout: z.number().optional().describe("Maximum time to wait in ms (default: 5000)"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            }).optional()
          }),
          z.object({
            command: z.literal("navigate"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              url: z.string().describe("URL to navigate to"),
              waitUntil: z.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"]).optional()
                .describe("Navigation wait condition (default: networkidle0)"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            })
          }),
          z.object({
            command: z.literal("drag"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              sourceX: z.number().describe("X coordinate to start the drag from (distance from left edge of viewport)"),
              sourceY: z.number().describe("Y coordinate to start the drag from (distance from top edge of viewport)"),
              offsetX: z.number().describe("Horizontal distance to drag (positive for right, negative for left)"),
              offsetY: z.number().describe("Vertical distance to drag (positive for down, negative for up)"),
              smoothDrag: z.boolean().optional().describe("Whether to perform a smooth, gradual drag movement (default: false)"),
              steps: z.number().optional().describe("Number of intermediate steps for smooth drag (default: 10)"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            })
          }),
          z.object({
            command: z.literal("select"),
            selector: z.string().describe("CSS selector of select element"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              value: z.string().describe("Value of the option to select"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            })
          }),
          z.object({
            command: z.literal("check"),
            selector: z.string().describe("CSS selector of checkbox element"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              checked: z.boolean().optional().describe("Whether to check or uncheck the box (default: true)"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            }).optional()
          }),
          z.object({
            command: z.literal("hover"),
            selector: z.string().describe("CSS selector of element to hover over"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            }).optional()
          }),
          z.object({
            command: z.literal("focus"),
            selector: z.string().describe("CSS selector of element to focus"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            }).optional()
          }),
          z.object({
            command: z.literal("blur"),
            selector: z.string().describe("CSS selector of element to blur"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            }).optional()
          }),
          z.object({
            command: z.literal("keypress"),
            selector: z.string().optional().describe("CSS selector of element to target (optional)"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'ArrowDown')"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            })
          }),
          z.object({
            command: z.literal("scroll"),
            selector: z.string().optional().describe("CSS selector of element to scroll (scrolls page if not provided)"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              x: z.number().optional().describe("Horizontal scroll amount in pixels (default: 0)"),
              y: z.number().optional().describe("Vertical scroll amount in pixels (default: 0)"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            }).optional()
          }),
          z.object({
            command: z.literal("getAttribute"),
            selector: z.string().describe("CSS selector of element"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              name: z.string().describe("Name of the attribute to retrieve"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            })
          }),
          z.object({
            command: z.literal("getProperty"),
            selector: z.string().describe("CSS selector of element"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              name: z.string().describe("Name of the property to retrieve"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            })
          }),
          z.object({
            command: z.literal("refresh"),
            description: z.string().optional().describe("Description of this command step"),
            args: z.object({
              waitUntil: z.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"]).optional()
                .describe("Navigation wait condition (default: networkidle0)"),
              continueOnError: z.boolean().optional().describe("Whether to continue executing commands if this command fails")
            }).optional()
          })
        ])
      ).describe("Array of commands to execute in sequence"),
      timeout: z.number().optional().describe("Overall timeout in milliseconds (default: 30000)")
    },
    async ({ commands, timeout = 30000 }) => {
      try {
        // Check browser status
        const browserStatus = ensureBrowserStarted();
        if (!browserStatus.isStarted) {
          return browserStatus.error;
        }
        
        // Get current checkpoint ID
        const checkpointId = await getCurrentCheckpointId(browserStatus.page);
        
        // Define command handler type
        type CommandArgs = Record<string, any>;
        type CommandHandler = (page: puppeteer.Page, selector: string | undefined, args: CommandArgs) => Promise<string | Record<string, any>>;
        
        // Command handler mapping
        const commandHandlers: Record<string, CommandHandler> = {
          click: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!selector) throw new Error("Selector is required for click command");
            await page.waitForSelector(selector, { 
              visible: true, 
              timeout: args.timeout as number || 5000 
            });
            await page.click(selector, {
              button: (args.button as puppeteer.MouseButton) || 'left',
              clickCount: args.clickCount as number || 1,
              delay: args.delay as number || 0
            });
            return `Clicked on ${selector}`;
          },
          
          type: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!selector) throw new Error("Selector is required for type command");
            if (!args.text) throw new Error("Text is required for type command");
            
            await page.waitForSelector(selector, { 
              visible: true, 
              timeout: args.timeout as number || 5000 
            });
            
            if (args.clearFirst) {
              await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                if (element) {
                  (element as HTMLInputElement).value = '';
                }
              }, selector);
            }
            
            await page.type(selector, args.text as string, { 
              delay: args.delay as number || 0 
            });
            
            return `Typed "${args.text}" into ${selector}`;
          },
          
          wait: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (selector) {
              await page.waitForSelector(selector, { 
                visible: args.visible !== false, 
                timeout: args.timeout as number || 5000 
              });
              return `Waited for element ${selector}`;
            } else if (args.time) {
              await new Promise(resolve => setTimeout(resolve, args.time as number));
              return `Waited for ${args.time}ms`;
            } else if (args.function) {
              // 대기 조건만 한정적으로 허용
              await page.waitForFunction(
                `document.querySelectorAll('${args.functionSelector}').length ${args.functionOperator || '>'} ${args.functionValue || 0}`,
                { timeout: args.timeout as number || 5000 }
              );
              return `Waited for function condition on ${args.functionSelector}`;
            } else {
              throw new Error("Either selector, time, or function parameters are required for wait command");
            }
          },
          
          navigate: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!args.url) throw new Error("URL is required for navigate command");
            
            await page.goto(args.url as string, { 
              waitUntil: args.waitUntil as puppeteer.WaitForOptions['waitUntil'] || 'networkidle0',
              timeout: args.timeout as number || 30000
            });
            
            return `Navigated to ${args.url}`;
          },
          
          select: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!selector) throw new Error("Selector is required for select command");
            if (!args.value) throw new Error("Value is required for select command");
            
            await page.waitForSelector(selector, { 
              visible: true, 
              timeout: args.timeout as number || 5000 
            });
            
            await page.select(selector, args.value as string);
            
            return `Selected value "${args.value}" in ${selector}`;
          },
          
          check: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!selector) throw new Error("Selector is required for check command");
            
            await page.waitForSelector(selector, { 
              visible: true, 
              timeout: args.timeout as number || 5000 
            });
            
            const checked = args.checked !== false;
            
            await page.evaluate((sel, check) => {
              const element = document.querySelector(sel);
              if (element && 'type' in element && (element as HTMLInputElement).type === 'checkbox') {
                (element as HTMLInputElement).checked = check;
              }
            }, selector, checked);
            
            return `${checked ? 'Checked' : 'Unchecked'} checkbox ${selector}`;
          },
          
          hover: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!selector) throw new Error("Selector is required for hover command");
            
            await page.waitForSelector(selector, { 
              visible: true, 
              timeout: args.timeout as number || 5000 
            });
            
            await page.hover(selector as string);
            
            return `Hovered over ${selector}`;
          },
          
          focus: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!selector) throw new Error("Selector is required for focus command");
            
            await page.waitForSelector(selector, { 
              visible: true, 
              timeout: args.timeout as number || 5000 
            });
            
            await page.focus(selector as string);
            
            return `Focused on ${selector}`;
          },
          
          blur: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!selector) throw new Error("Selector is required for blur command");
            
            await page.evaluate((sel) => {
              const element = document.querySelector(sel);
              if (element && 'blur' in element) {
                (element as HTMLElement).blur();
              }
            }, selector as string);
            
            return `Removed focus from ${selector}`;
          },
          
          keypress: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!args.key) throw new Error("Key is required for keypress command");
            
            if (selector) {
              await page.waitForSelector(selector, { 
                visible: true, 
                timeout: args.timeout as number || 5000 
              });
              await page.focus(selector as string);
            }
            
            await page.keyboard.press(args.key as puppeteer.KeyInput);
            
            return `Pressed key ${args.key}${selector ? ` on ${selector}` : ''}`;
          },
          
          scroll: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            const x = args.x as number || 0;
            const y = args.y as number || 0;
            
            if (selector) {
              await page.waitForSelector(selector, { 
                visible: true, 
                timeout: args.timeout as number || 5000 
              });
              
              await page.evaluate((sel, xPos, yPos) => {
                const element = document.querySelector(sel);
                if (element) {
                  element.scrollBy(xPos, yPos);
                }
              }, selector, x, y);
              
              return `Scrolled element ${selector} by (${x}, ${y})`;
            } else {
              await page.evaluate((xPos, yPos) => {
                window.scrollBy(xPos, yPos);
              }, x, y);
              
              return `Scrolled window by (${x}, ${y})`;
            }
          },
          
          getAttribute: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!selector) throw new Error("Selector is required for getAttribute command");
            if (!args.name) throw new Error("Attribute name is required for getAttribute command");
            
            await page.waitForSelector(selector, { 
              visible: args.visible !== false, 
              timeout: args.timeout as number || 5000 
            });
            
            const attributeValue = await page.evaluate((sel, attr) => {
              const element = document.querySelector(sel);
              return element ? element.getAttribute(attr) : null;
            }, selector, args.name);
            
            return {
              selector,
              attribute: args.name,
              value: attributeValue
            };
          },
          
          getProperty: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            if (!selector) throw new Error("Selector is required for getProperty command");
            if (!args.name) throw new Error("Property name is required for getProperty command");
            
            await page.waitForSelector(selector, { 
              visible: args.visible !== false, 
              timeout: args.timeout as number || 5000 
            });
            
            const propertyValue = await page.evaluate((sel, prop) => {
              const element = document.querySelector(sel);
              return element ? (element as any)[prop] : null;
            }, selector, args.name);
            
            return {
              selector,
              property: args.name,
              value: propertyValue
            };
          },
          
          refresh: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            await page.reload({ 
              waitUntil: args.waitUntil as puppeteer.WaitForOptions['waitUntil'] || 'networkidle0',
              timeout: args.timeout as number || 30000
            });
            
            return `Refreshed current page`;
          },
          
          drag: async (page: puppeteer.Page, selector: string | undefined, args: CommandArgs = {}) => {
            // Validate required arguments
            const { sourceX, sourceY, offsetX, offsetY } = args;
            if (sourceX === undefined || sourceY === undefined) {
              throw new Error("sourceX and sourceY are required for drag command");
            }
            
            if (offsetX === undefined || offsetY === undefined) {
              throw new Error("offsetX and offsetY are required for drag command");
            }
            
            const smoothDrag = args.smoothDrag === true;
            const steps = args.steps as number || 10;
            
            // Calculate target coordinates
            const targetX = sourceX + offsetX;
            const targetY = sourceY + offsetY;
            
            // Perform the drag operation
            await page.mouse.move(sourceX, sourceY);
            await page.mouse.down();
            
            // Optional: Implement a gradual movement for more realistic drag
            if (smoothDrag) {
              const stepX = offsetX / steps;
              const stepY = offsetY / steps;
              
              for (let i = 1; i <= steps; i++) {
                await page.mouse.move(
                  sourceX + stepX * i,
                  sourceY + stepY * i,
                  { steps: 1 }
                );
                // Small delay between steps for more natural movement
                await new Promise(resolve => setTimeout(resolve, 10));
              }
            } else {
              // Direct movement
              await page.mouse.move(targetX, targetY);
            }
            
            // Release the mouse button
            await page.mouse.up();
            
            return `Dragged from (${sourceX}, ${sourceY}) to (${targetX}, ${targetY}) with offset (${offsetX}, ${offsetY})`;
          }
        };
        
        // Execute commands sequentially
        const startTime = Date.now();
        const results = [];
        for (const [index, cmd] of commands.entries()) {
          // Check overall timeout
          if (Date.now() - startTime > timeout) {
            results.push({
              commandIndex: index,
              command: cmd.command,
              description: cmd.description,
              status: "error",
              error: "Execution timed out"
            });
            break;
          }
          
          try {
            if (!commandHandlers[cmd.command]) {
              throw new Error(`Unknown command: ${cmd.command}`);
            }
            
            // Handle selector and args for all commands
            const selector = 'selector' in cmd ? cmd.selector : undefined;
            const args = cmd.args || {};
            
            const result = await commandHandlers[cmd.command](
              browserStatus.page, 
              selector, 
              args
            );
            
            results.push({
              commandIndex: index,
              command: cmd.command,
              description: cmd.description,
              status: "success",
              result
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`Command execution failed: ${errorMessage}`);
            
            results.push({
              commandIndex: index,
              command: cmd.command,
              description: cmd.description,
              status: "error",
              error: errorMessage
            });
            
            // Determine whether to continue based on option
            // Check continueOnError property
            const continueOnError = cmd.args && 'continueOnError' in cmd.args ? 
                                  (cmd.args as any).continueOnError === true : false;
            if (!continueOnError) {
              break;
            }
          }
        }
        
        // Return results
        const resultMessage = {
          totalCommands: commands.length,
          executedCommands: results.length,
          successCount: results.filter(r => r.status === "success").length,
          failureCount: results.filter(r => r.status === "error").length,
          elapsedTime: Date.now() - startTime,
          results,
          checkpointId
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resultMessage, null, 2)
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to execute browser commands: ${errorMessage}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to execute browser commands: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );
}