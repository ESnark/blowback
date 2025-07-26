# Blowback

> Vite MCP Server is now Blowback
>
> Blowback aims to support various FE development servers, not only Vite

A Model Context Protocol (MCP) server that integrates FE development servers with AI tools like Claude Desktop and Cursor.

## Key Features

- Integration of local development server with MCP server
- Browser console log capture and transmission via MCP
- Checkpoint-based log management
- Screenshot capture and SQLite database management
- HMR (Hot Module Replacement) event monitoring
- Browser automation and element inspection

## init Prompt

The `init` prompt provides guidance to AI assistants on how to effectively use the following features:

**Cursor Chat** does not support MCP prompt functionality, so this feature is not available. (Claude Code recommended)
If needed, manually input the following prompt:

> You can use checkpoint features by inserting `<meta name="__mcp_checkpoint" data-id="">` into the head to create a named snapshot of the current state.
> The data-id attribute is a unique identifier for the checkpoint.
>
> Console logs generated in the browser while a checkpoint is active are tagged with the checkpoint ID and can be queried individually.
>
> Note: In some development environments, hot reload is triggered when files are saved, so carefully consider the sequence between meta tag changes and the changes you want to observe. Make sure to set the checkpoint meta tag before making the changes you want to track.
>
> You can use the capture-screenshot tool to take screenshots. The captured screenshots are stored in the @.mcp_screenshots/ directory.

## Installation

### Add the server to your Claude Desktop or Cursor's MCP configuration:

```json
{
  "blowback": {
    "command": "npx",
    "args": ["-y", "blowback-context"],
    "env": {
      "PROJECT_ROOT": "/path/to/your/project"
    }
  }
}
```

### Node.js Version Compatibility

Blowback uses `better-sqlite3` which requires native bindings. If you encounter a `NODE_MODULE_VERSION` mismatch error:

1. The package includes a `postinstall` script that automatically rebuilds native modules
2. If the automatic rebuild fails, you can manually rebuild:
   ```bash
   npm rebuild better-sqlite3
   # or
   npx node-gyp rebuild
   ```
3. Ensure your Node.js version is 20.0.0 or higher (as specified in engines)

### Environment Variables

- `PROJECT_ROOT`: Project root path (optional, defaults to current working directory)
- `ENABLE_BASE64`: Include base64 encoded images in tool responses (default: false / affects token usage and context window when enabled)

## Tools

### HMR Tools

| Tool Name | Description |
|-----------|-------------|
| `get-hmr-events` | Retrieves recent HMR events |
| `check-hmr-status` | Checks the HMR status |

> **Note**: HMR connection is optional, not required. HMR event monitoring starts automatically when the browser is launched.

### Browser Tools

| Tool Name | Description |
|-----------|-------------|
| `start-browser` | Starts a browser instance and navigates to the development server. HMR monitoring starts automatically |
| `capture-screenshot` | Captures a screenshot of the current page or a specific element. Returns screenshot ID and resource URI |
| `get-element-properties` | Retrieves properties and state information of a specific element |
| `get-element-styles` | Retrieves style information of a specific element |
| `get-element-dimensions` | Retrieves dimension and position information of a specific element |
| `monitor-network` | Monitors network requests in the browser for a specified duration |
| `get-element-html` | Retrieves the HTML content of a specific element and its children |
| `get-console-logs` | Retrieves console logs from the browser session with optional filtering |
| `execute-browser-commands` | Safely executes predefined browser commands |

### Help Tools

| Tool Name | Description |
|-----------|-------------|
| `how-to-use` | Provides instructions on how to use specific features of the server |

## Resources

### screenshots

A resource for querying all captured screenshots. You can query screenshot reference IDs captured by the `capture-screenshot` tool using various criteria.

Images corresponding to reference IDs are managed in the `{PROJECT_ROOT}/.mcp_screenshot/` directory.

- URI: `screenshot://`
- Returns a list of all screenshots

### screenshot-by-url

A resource for querying specific screenshots based on URL path.

> **Note**: tarting from version 1.0, Blob responses through resources are disabled by default, and file reference information is returned instead

- URI template: `screenshot://{+path}`
- Example: `screenshot://localhost:5173/about`
- Use URL paths without protocol (http://, https://)

## Data Storage Structure

### Screenshot Storage
- Screenshot images: Stored in `{PROJECT_ROOT}/.mcp_screenshot/` directory
- Metadata: Managed in SQLite database in temporary directory
- It's recommended to add `.mcp_screenshot/` directory to `.gitignore`

### Log Management System
- Captures browser console logs and saves them to files for querying
- Checkpoint logs are only saved when checkpoints are active

## Checkpoint System

### How Checkpoints Work
- Checkpoints are used to manage snapshots, logs, screenshots, etc. of specific versions
- When `<meta name="__mcp_checkpoint" data-id="">` is inserted into the `head`, data is recorded separately using the data-id attribute as an identifier

## Architecture and Data Flow

### Core Components

1. **MCP Server**: Central module that exposes tools and resources to AI tools using the Model Context Protocol SDK.

2. **Browser Automation**: Uses Playwright to control Chrome for visual inspection, screenshot capture, and DOM manipulation.

3. **Checkpoint System**: Maintains snapshots of browser states for comparison and testing.

4. **SQLite Database**: Efficiently manages screenshot metadata and enables quick URL-based queries.

### Data Sources and State Management

The server maintains several important data stores:

- **HMR Event Records**: Tracks recent HMR events (updates, errors) from development server.
- **Console Message Logs**: Captures browser console output for debugging.
- **Checkpoint Storage**: Stores named snapshots of browser states including DOM snapshots.
- **Screenshot Storage**: Saves images in project directory and manages metadata with SQLite.

### Communication Flow

1. **MCP Client → Development Server**:
   - MCP Client changes the source code and development server detects the change
   - Development server automatically updates the browser or emits HMR events

2. **Web Browser → MCP Server**:
   - HMR events and console logs are captured through Playwright
   - MCP Server queries the current state of the browser or captures screenshots

3. **MCP Server → MCP Client**:
   - The server converts HMR events into structured responses
   - Provides tools for MCP Client to query HMR status, capture screenshots, and more

### State Maintenance

The server maintains reference objects for:
- Current browser and page instances
- Recent HMR events
