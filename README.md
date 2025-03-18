# Vite MCP Server

Adds a Model Context Protocol (MCP) server to the Vite development server to support integration with Cursor.

## Key Features

- Integration of Vite development server with MCP server
- Browser console log capture and transmission via MCP
- Checkpoint-based log management
- Log storage using circular buffer (up to 1000 lines)
- Checkpoint-specific log file management (maintains up to 2 checkpoints)

## Installation

Add the server to your Cursor MCP configuration:

```json
{
  "vite-hmr": {
    "command": "npx",
    "args": ["-y", "vite-mcp-server"]
  }
}
```

## Resources

### console-logs

A resource for querying browser console logs.

Currently not supported in Cursor, use the `get-console-logs` tool instead.

```typescript
// Query logs
const logs = await mcpServer.resource("console-logs", {
  checkpoint: "checkpoint-1", // Optional: Query logs for a specific checkpoint
  limit: 10 // Optional: Limit the number of logs to return
});
```

## Tools

### HMR Tools

| Tool Name | Description |
|-----------|-------------|
| `init-vite-connection` | Connects to the project's development server |
| `get-hmr-events` | Retrieves recent HMR events |
| `check-hmr-status` | Checks the HMR status |

### Browser Tools

| Tool Name | Description |
|-----------|-------------|
| `start-browser` | Starts a browser instance and navigates to the Vite development server |
| `capture-screenshot` | Captures a screenshot of the current page or a specific element |
| `get-element-properties` | Retrieves properties and state information of a specific element |
| `get-element-styles` | Retrieves style information of a specific element |
| `get-element-dimensions` | Retrieves dimension and position information of a specific element |
| `monitor-network` | Monitors network requests in the browser for a specified duration |
| `get-element-html` | Retrieves the HTML content of a specific element and its children |
| `get-console-logs` | Retrieves console logs from the browser session with optional filtering |
| `execute-browser-commands` | Safely executes predefined browser commands |

## Log Management System

### Log Management Method

- All browser console logs are stored up to 1000 lines using a circular buffer method
- When logs exceed the maximum count, the oldest logs are overwritten
- Logs can only be retrieved when there is an active stream
- Logs are stored in chronological order by timestamp

### Checkpoint Logs

- When a checkpoint is created, logs at that point are stored in a separate file (`browser-console.{checkpointId}.log`)
- Only up to 2 checkpoint log files are maintained, with the oldest file being deleted when a new checkpoint is created
- You can query logs for specific checkpoints using the `get-console-logs` tool

## Checkpoint System

### Checkpoint Operation Method
- Checkpoints are used to manage snapshots, logs, screenshots, etc. of specific versions
- When `<meta name="__mcp_checkpoint" data-id="">` is inserted into the `head`, data is recorded separately using the data-id attribute as an identifier

## Architecture and Data Flow

### Core Components

1. **MCP Server**: A central module based on the Model Context Protocol SDK that provides tools to Cursor.

2. **Vite HMR Client**: Sets up and maintains WebSocket connection with the Vite development server and subscribes to HMR events.

3. **Browser Automation**: Controls Chrome using Puppeteer to visually inspect changes.

4. **Checkpoint System**: Maintains snapshots of browser states for comparison and testing.

### Data Sources and State Management

The server maintains several important data stores:

- **HMR Event Records**: Tracks recent HMR events (updates, errors) from Vite.
- **Console Message Logs**: Captures browser console output for debugging.
- **Checkpoint Storage**: Stores named snapshots of browser states including DOM snapshots.

### Communication Flow

1. **Vite → MCP Server**: 
   - Vite transmits real-time HMR events via WebSocket when files change.
   - Events include updates (successful changes) and errors (compilation failures).

2. **MCP Server → Cursor**:
   - The server converts HMR events into structured responses.
   - Provides tools for Cursor to query HMR status and capture screenshots.

3. **Browser → MCP Server**:
   - Visual changes are captured through Puppeteer.
   - Console output and errors are collected for debugging.

### State Maintenance

The server maintains reference objects for:
- Current browser and page instances
- Active Vite client connection
- Project root path
- Recent HMR events
