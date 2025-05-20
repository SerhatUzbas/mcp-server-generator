# MCP Server Creator

A tool for creating and managing Model Context Protocol (MCP) servers for Claude Desktop.

## Overview

The MCP Server Creator helps you create, manage, and register custom MCP servers with Claude Desktop. This tool provides an interface for:

- Creating new MCP servers
- Updating existing servers
- Registering servers with Claude Desktop

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [Claude Desktop](https://claude.ai/download) installed

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/SerhatUzbas/mcp-server-generator.git
   cd mcprotocol
   ```

2. Install dependencies (only first installation):

   ```bash
   npm install
   ```

3. Register the creator server with Claude Desktop:

- Macos:
   ```bash
   open ~/Library/"Application Support"/Claude/claude_desktop_config.json
   ``` 
- Windows: %APPDATA%\Claude\claude_desktop_config.json

- Or from Claude Desktop: Settings > Developer > Edit Config

example:

```json
{
  "mcpServers": {
    "serverGenerator": {
      "command": "node",
      "args": ["/Users/username/Documents/GitHub/mcprotocol/creator-server.js"]
    }
  }
}
```

## Using the MCP Server Creator

Once registered, you can use the MCP Server Creator through Claude Desktop:

1. Open Claude Desktop
2. Select resources and prompts from choose an integration dropdown
3. Ask Claude to create or manage your MCP servers

### Creating a New Server

Ask Claude to create a server for your specific needs:

```
Create an MCP server that integrates with the OpenWeather API to provide weather forecasts.
```

or try more higher level explanation:

```
Create an MCP server that retrieves the weather forecast that i request.
```

Claude will (probably):

1. Check the server list if it exist
2. Generate the server code
3. Save it to the `servers` directory
4. Register it with Claude Desktop
5. Identify and install required dependencies

## Available Tools

The MCP Server Creator provides several tools for managing your servers:

- `listServers` - List all available servers
- `getServerContent` - View the code of an existing server
- `createMcpServer` - Create a new server
- `updateMcpServer` - Update an existing server
- `analyzeServerDependencies` - Identify required npm packages
- `installServerDependencies` - Install required packages
- `getClaudeConfig` - View current Claude Desktop configuration
- `updateClaudeConfig` - Update Claude Desktop configuration
- `runServerDirectly` - Checks if any error appears when running

## Troubleshooting

### Server Not Appearing in Claude

- Verify the server was registered correctly in the Claude Desktop config
- Check for any JavaScript syntax errors in your server code
- Restart Claude Desktop after registering new servers

### Dependency Issues

If dependencies aren't installing correctly:

- Try installing them manually: `npm install [package-name]`
- Check for compatibility issues between packages
- Ensure your Node.js version is compatible with the packages

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
