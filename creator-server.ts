// creator-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { TEMPLATE_MCP_SERVER } from "./template.js";

// Path to the Claude desktop config file
const CLAUDE_CONFIG_PATH = path.join(
  os.homedir(),
  "Library/Application Support/Claude/claude_desktop_config.json"
);

// Path where our server and generated servers will live
const CURRENT_DIR = import.meta.url
  ? path.dirname(new URL(import.meta.url).pathname)
  : __dirname;

const SERVERS_DIR = path.join(CURRENT_DIR, "servers");

// Initialize our MCP server
const server = new McpServer({
  name: "MCP Server Generator",
  version: "1.0.0",
  description: "Create custom MCP servers with AI assistance",
});

// Tool to get the template
server.tool("getTemplate", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: TEMPLATE_MCP_SERVER,
      },
    ],
  };
});

// Tool to create a new MCP server from code
server.tool(
  "createServer",
  {
    serverName: z.string().min(1),
    serverCode: z.string().min(1),
    registerWithClaude: z.boolean().default(true),
  },
  async ({ serverName, serverCode, registerWithClaude }) => {
    try {
      // Make sure the servers directory exists
      await fs.mkdir(SERVERS_DIR, { recursive: true });

      // Sanitize the server name for use as a filename
      const sanitizedName = serverName.replace(/[^a-zA-Z0-9-_]/g, "_");
      const filename = `${sanitizedName}.js`;
      const filePath = path.join(SERVERS_DIR, filename);

      // Write the server file
      await fs.writeFile(filePath, serverCode);

      // Register with Claude Desktop config if requested
      let registrationMessage = "";
      if (registerWithClaude) {
        try {
          registrationMessage = await registerServerWithClaude(
            sanitizedName,
            filePath
          );
        } catch (error) {
          registrationMessage = `Could not register with Claude Desktop: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully created MCP server "${serverName}" at ${filePath}.\n${registrationMessage}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating server: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool to list all created servers
server.tool("listServers", {}, async () => {
  try {
    await fs.mkdir(SERVERS_DIR, { recursive: true });
    const files = await fs.readdir(SERVERS_DIR);
    const jsFiles = files.filter((file) => file.endsWith(".js"));

    return {
      content: [
        {
          type: "text",
          text:
            jsFiles.length > 0
              ? `Available MCP servers:\n${jsFiles.join("\n")}`
              : "No MCP servers found.",
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error listing servers: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

// Tool to get Claude desktop config
server.tool("getClaudeConfig", {}, async () => {
  try {
    const configExists = await fileExists(CLAUDE_CONFIG_PATH);
    if (!configExists) {
      return {
        content: [
          {
            type: "text",
            text: `Claude Desktop config not found at ${CLAUDE_CONFIG_PATH}`,
          },
        ],
      };
    }

    const configData = await fs.readFile(CLAUDE_CONFIG_PATH, "utf-8");
    return {
      content: [
        {
          type: "text",
          text: configData,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error reading Claude config: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

// Tool to update Claude desktop config
server.tool(
  "updateClaudeConfig",
  {
    configData: z.string(),
  },
  async ({ configData }) => {
    try {
      // Validate the config is valid JSON
      JSON.parse(configData);

      await fs.writeFile(CLAUDE_CONFIG_PATH, configData);

      return {
        content: [
          {
            type: "text",
            text: `Successfully updated Claude Desktop config.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating Claude config: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool to provide help
server.tool("getHelp", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: `
MCP Server Creator Help:

This tool helps you create custom MCP servers and register them with Claude Desktop.

Available tools:

1. getTemplate
   - Returns an example MCP server template to help guide development
   
2. createServer
   - Creates a new MCP server from provided code
   - Parameters:
     - serverName: Name of your server (used for the filename)
     - serverCode: The complete TypeScript/JavaScript code for your server
     - registerWithClaude: Whether to register with Claude Desktop (default: true)
   
3. listServers
   - Lists all servers created with this tool
   
4. getClaudeConfig
   - Retrieves the current Claude Desktop configuration
   
5. updateClaudeConfig
   - Updates the Claude Desktop configuration file
   - Parameters:
     - configData: Complete JSON configuration
     
6. getHelp
   - Shows this help message

Workflow:
1. Use getTemplate to see how an MCP server is structured
2. Ask me to create a custom server for your needs
3. Use createServer to save the server and register it with Claude Desktop
`,
      },
    ],
  };
});

// Connect the server
const transport = new StdioServerTransport();
server.connect(transport);

// Utility function to register a server with Claude Desktop
async function registerServerWithClaude(
  serverName: string,
  serverPath: string
): Promise<string> {
  // Check if config file exists
  const configExists = await fileExists(CLAUDE_CONFIG_PATH);

  // Create default config if it doesn't exist
  if (!configExists) {
    await fs.writeFile(
      CLAUDE_CONFIG_PATH,
      JSON.stringify({ mcpServers: {} }, null, 2)
    );
  }

  // Read the current config
  const configData = await fs.readFile(CLAUDE_CONFIG_PATH, "utf-8");
  const config = JSON.parse(configData);

  // Ensure mcpServers section exists
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // Add the new server
  config.mcpServers[serverName] = {
    command: "node",
    args: [serverPath],
  };

  // Write the updated config
  await fs.writeFile(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));

  return `Server registered with Claude Desktop as "${serverName}".`;
}

// Utility function to check if a file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
