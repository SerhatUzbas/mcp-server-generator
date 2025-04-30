# MCP Server Creator

A tool for creating and managing Model Context Protocol (MCP) servers for Claude Desktop.

## Overview

The MCP Server Creator helps you create, manage, and register custom MCP servers with Claude Desktop. This tool provides an interface for:

- Creating new MCP servers
- Updating existing servers
- Managing dependencies
- Registering servers with Claude Desktop

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [Claude Desktop](https://claude.ai/desktop) installed
- TypeScript SDK for Model Context Protocol

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/SerhatUzbas/mcp-server-generator.git
   cd mcprotocol
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Register the creator server with Claude Desktop:

   Macos: ~/Library/Application Support/Claude/claude_desktop_config.json for macos users
   Windows: %APPDATA%\Claude\claude_desktop_config.json

   example:

   ```json
   {
     "mcpServers": {
       "serverGenerator": {
         "command": "npx",
         "args": [
           "tsx",
           "/Users/username/Documents/GitHub/mcprotocol/creator-server.ts"
         ]
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

Claude will:

1. Generate the server code
2. Save it to the `servers` directory
3. Register it with Claude Desktop
4. Identify and install required dependencies

### Managing Existing Servers

#### Listing Servers

```
List all available MCP servers.
```

#### Viewing Server Code

```
Show me the code for [server name].
```

#### Updating a Server

```
Update the [server name] server to add [new functionality].
```

### Working with Dependencies

#### Analyzing Dependencies

```
Analyze the dependencies for [server name].
```

#### Installing Dependencies

```
Install dependencies for [server name].
```

## Available Tools

The MCP Server Creator provides several tools for managing your servers:

- `listServers` - List all available servers
- `getServerContent` - View the code of an existing server
- `createMcpServer` - Create a new server
- `updateServer` - Update an existing server
- `analyzeServerDependencies` - Identify required npm packages
- `installServerDependencies` - Install required packages
- `getClaudeConfig` - View current Claude Desktop configuration
- `updateClaudeConfig` - Update Claude Desktop configuration

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
