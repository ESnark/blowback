# Blowback

> Vite MCP Server is now Blowback
>
> Blowback aims to support various FE development servers, not only Vite

Adds a Model Context Protocol (MCP) server to the FE development server to support integration with Cursor.

## Key Features

- Integration of FE development server with MCP server
- Browser console log capture and transmission via MCP
- Checkpoint-based log management

## Installation

Add the server to your Cursor MCP configuration:

```json
{
  "blowback": {
    "command": "npx",
    "args": ["-y", "blowback"]
  }
}
```

## Resources

### ~~console-logs~~

A resource for retrieving browser console logs.

Note: The MCP Resource feature is not supported by Cursor at the moment. Please use the `get-console-logs` tool instead.

## Tools

### HMR Tools

| Tool Name | Description |
|-----------|-------------|
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

### How to use Tools

| Tool Name | Description |
|-----------|-------------|
| `how-to-use` | Provides instructions on how to use the tool |

## Log Management System

### Log Management Method

- All browser console logs are stored in log files
- You can query logs for specific checkpoints using the `get-console-logs` tool

## Checkpoint System

### Checkpoint Operation Method
- Checkpoints are used to manage snapshots, logs, screenshots, etc. of specific versions
- When `<meta name="__mcp_checkpoint" data-id="">` is inserted into the `head`, data is recorded separately using the data-id attribute as an identifier

## Architecture and Data Flow

### Core Components

1. **MCP Server**: A central module based on the Model Context Protocol SDK that provides tools to MCP Client.

2. **Browser Automation**: Controls Chrome using Puppeteer to visually inspect changes.

3. **Checkpoint System**: Maintains snapshots of browser states for comparison and testing.

### Data Sources and State Management

The server maintains several important data stores:

- **HMR Event Records**: Tracks recent HMR events (updates, errors) from Vite.
- **Console Message Logs**: Captures browser console output for debugging.
- **Checkpoint Storage**: Stores named snapshots of browser states including DOM snapshots.

### Communication Flow

1. **MCP Client → Development Server**:
   - MCP Client changes the source code and Development Server detects the change
   - Development Server updates the browser or emits HMR events automatically

2. **Web Browser → MCP Server**:
   - HMR events and console logs are captured through Puppeteer.
   - MCP Server queries the current state of the browser or captures a screenshot

3. **MCP Server → MCP Client**:
   - The server converts HMR events into structured responses.
   - Provides tools for MCP Client to query HMR status and capture screenshots.

### State Maintenance

The server maintains reference objects for:
- Current browser and page instances
- Recent HMR events
