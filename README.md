# Vite MCP Server

A Model Context Protocol (MCP) server that integrates Cursor with Vite Dev server, allowing Cursor agents to modify code and observe live updates through the Vite Hot Module Replacement system.

## Features

- 🔄 Connect to a running Vite dev server's HMR system
- 🔍 Monitor HMR events and update status
- 🌐 Automated browser integration for visual feedback and debugging
- 🤖 Enable Cursor AI agents to modify code and see the results in real-time

## Installation

```bash
npm install -g vite-mcp-server
```

Or use it directly with npx:

```bash
npx vite-mcp-server
```

## Usage with Cursor

### 1. Configure in Cursor

Add the server to your Cursor MCP configuration:

```json
{
  "vite-hmr": {
    "command": "npx",
    "args": ["-y", "vite-mcp-server"]
  }
}
```

### 2. Initialize the connection

First, initialize the connection to your Vite dev server:

```
Please connect to my Vite HMR server at ws://localhost:5173/__hmr and set the project root to /path/to/my/project
```

Cursor will execute the `init-vite-connection` tool to establish the connection.

### 3. Update files and monitor changes

Now you can ask Cursor to modify files and check the HMR status:

```
Please update the file src/App.jsx to change the heading to "Hello MCP and Vite!"
```

Cursor will:
1. Read the current file content
2. Update the file
3. Check the HMR status using `check-hmr-status`

### 4. Using Browser Automation

You can use the browser automation features to directly see and interact with the browser:

```
Please start a browser session for my Vite app at http://localhost:5173 and capture a screenshot of the page after it loads.
```

Cursor will:
1. Start an automated Chrome browser using `start-browser`
2. Navigate to your Vite app
3. Capture a screenshot using `capture-screenshot`
4. Show you the result

### 5. Using Checkpoints for State Verification

You can use checkpoint tools to capture and verify browser states during development:

```
Please set a checkpoint of the current browser state with the name "initial-state" and include a DOM snapshot for detailed comparison.
```

Later, after making changes, you can verify if the state has changed as expected:

```
Please verify the browser state against the "initial-state" checkpoint and tell me what has changed.
```

Cursor will:
1. Create a checkpoint using `set-checkpoint` with DOM snapshot
2. Make changes to the application
3. Verify changes using `verify-checkpoint` to compare current state with previous checkpoint
4. Report detailed differences between the states

## Available Tools

This MCP server provides the following tools:

| Tool Name | Description |
|-----------|-------------|
| `init-vite-connection` | Connects to the project's development server |
| `get-hmr-events` | Retrieves recent HMR events |
| `check-hmr-status` | Checks the status of HMR |
| `start-browser` | Launches a browser instance and navigates to the Vite dev server |
| `get-browser-console-logs` | Retrieves console logs from the browser session, with optional filtering |
| `get-browser-console-errors` | Retrieves only error logs from the browser session for easier debugging |
| `monitor-browser-console` | Starts or stops monitoring browser console logs |
| `capture-screenshot` | Captures a screenshot of the current page or a specific element |
| `get-element-properties` | Retrieves properties and state information of a specific element |
| `get-element-styles` | Retrieves style information of a specific element |
| `get-element-dimensions` | Retrieves dimension and position information of a specific element |
| `monitor-network` | Monitors network requests in the browser for a specified duration |
| `update-cursor-tracker` | Creates or updates a meta tag in the browser to track changes |
| `get-element-html` | Retrieves the HTML content of a specific element and its children |
| `execute-browser-commands` | Executes a sequence of predefined browser commands safely |
| `set-checkpoint` | Creates a named checkpoint of the current browser state for later verification |
| `verify-checkpoint` | Verifies if the current browser state matches a previously created checkpoint |

## Requirements

- Node.js 20 or higher
- A running Vite dev server
- Cursor with MCP support
- Chrome browser (for browser automation features)

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/vite-mcp-server.git
cd vite-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

## Troubleshooting

### Connection Issues

1. Make sure your Vite server is running.
2. Verify that the HMR WebSocket URL is correct.
3. Restart Cursor and check your MCP configuration.

### Browser Automation Issues

1. Ensure Chrome is installed on your machine.
2. Check that you have sufficient memory and CPU resources.
3. When capturing screenshots of specific elements, make sure the CSS selector is correct.

## How It Works

1. The MCP server connects to the Vite development server's HMR WebSocket.
2. Cursor communicates with the server via the MCP protocol.
3. When files are modified, Vite's HMR system automatically detects the changes.
4. The MCP server collects and analyzes HMR events.
5. Browser automation features allow you to see how changes appear visually.

## Architecture and Data Flow

The MCP Vite HMR Server follows a modular architecture with several key components that work together:

### Core Components

1. **MCP Server**: The central module built on the Model Context Protocol SDK that exposes tools to Cursor.

2. **Vite HMR Client**: Establishes and maintains a WebSocket connection with the Vite development server, subscribing to HMR events.

3. **Browser Automation**: Uses Puppeteer to control Chrome, allowing visual inspection of changes.

4. **Checkpoint System**: Maintains snapshots of browser state for comparison and testing.

### Data Sources and State Management

The server maintains several important data stores:

- **HMR Event History**: Keeps track of recent HMR events (updates, errors) from Vite.
- **Console Message Log**: Captures browser console output for debugging.
- **Checkpoint Repository**: Stores named snapshots of browser state including DOM snapshots.

### Communication Flow

1. **Vite → MCP Server**: 
   - Vite sends real-time HMR events via WebSocket when files change.
   - Events include updates (successful changes) and errors (compilation failures).

2. **MCP Server → Cursor**:
   - Server translates HMR events into structured responses.
   - Provides tools that allow Cursor to query HMR status, capture screenshots, etc.

3. **Browser → MCP Server**:
   - Visual changes are captured through Puppeteer.
   - Console output and errors are collected for debugging.

### State Persistence

The server maintains reference objects for:
- Current browser and page instances
- Active Vite client connection
- Project root path
- Recent HMR events

This architecture enables seamless integration between Cursor's AI capabilities and Vite's development environment, providing real-time feedback on code changes through both HMR events and visual verification.

### Checkpoint System Internals

The checkpoint system is a powerful feature of the MCP Vite HMR server that allows saving browser state at specific points in time and comparing it later.

#### Checkpoint Structure

Each checkpoint contains the following information:
- **Unique ID**: User-specified or automatically generated identifier
- **Timestamp**: When the checkpoint was created
- **Hash Value**: A unique identifier to track browser state
- **Page URL**: The URL of the current page
- **DOM Snapshot (optional)**: HTML content of the entire or selected DOM elements
- **Description (optional)**: A description of the checkpoint's purpose or content

#### Checkpoint Creation Process

The process of creating a checkpoint works as follows:
1. When the `set-checkpoint` tool is called, a unique UUID hash is generated.
2. A meta tag (`__vite_hmr_cursor`) is added or updated in the browser to store this hash.
3. The current page URL is recorded.
4. If the `captureDOM` option is enabled, a snapshot of the current DOM (HTML) is captured.
5. All this information is stored in an internal Map data structure.
6. For memory management, only the 20 most recent checkpoints are maintained.

#### Checkpoint Verification Mechanism

Checkpoint verification checks three main aspects:

1. **URL Matching**: Verifies if the current page URL is the same as when the checkpoint was created
2. **Hash Verification**: Checks if the hash value in the meta tag matches the checkpoint's hash
3. **DOM Comparison (optional)**: If a DOM snapshot exists, compares the current DOM with the stored snapshot

Any mismatch in these indicates that the state has changed.

#### Selective DOM Verification

DOM verification can be performed in two ways:
- **Whole Page Comparison**: Compares the HTML of the entire document.
- **Specific Element Comparison**: Uses CSS selectors to compare only specific elements.

This allows focusing on areas of interest rather than the entire page.

#### Use Cases for Checkpoints

The checkpoint system is particularly useful in the following situations:

- **UI Regression Testing**: Verifying that UI changes as intended after code modifications
- **Debugging**: Comparing state between problematic and normal functioning times
- **State Tracking**: Visually tracking complex state changes
- **Collaboration**: Sharing specific states with other developers for problem-solving

The checkpoint system provides an additional layer of visual state tracking beyond HMR events, enabling developers to understand the impact of code changes more comprehensively.
