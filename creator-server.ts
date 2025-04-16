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

// TypeScript SDK information
const TYPESCRIPT_SDK_URL =
  "https://github.com/modelcontextprotocol/typescript-sdk";
const TYPESCRIPT_SDK_README_URL =
  "https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md";

// Initialize our MCP server
const server = new McpServer({
  name: "MCP Server Generator",
  version: "1.0.0",
  description: "Create custom MCP servers with AI assistance",
});

// Tool to fetch TypeScript SDK information from GitHub
server.tool("getSdkInfo", {}, async () => {
  try {
    // Dynamically import node-fetch
    const { default: fetch } = await import("node-fetch");

    // Fetch the README content from the raw GitHub URL
    const response = await fetch(TYPESCRIPT_SDK_README_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch from GitHub: ${response.status} ${response.statusText}`
      );
    }

    // Get the README content
    const readmeContent = await response.text();

    // Add a header with link to the repository
    const contentWithHeader = `# TypeScript SDK for Model Context Protocol

Retrieved from: ${TYPESCRIPT_SDK_URL}

${readmeContent}`;

    return {
      content: [
        {
          type: "text",
          text: contentWithHeader,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error fetching SDK info: ${
            error instanceof Error ? error.message : String(error)
          }\n\nPlease visit ${TYPESCRIPT_SDK_URL} directly to view the documentation.`,
        },
      ],
      isError: true,
    };
  }
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

// Tool to create a new MCP server or update an existing one
server.tool(
  "createServer",
  {
    serverName: z.string().min(1),
    serverCode: z.string().min(1),
    registerWithClaude: z.boolean().default(true),
    overwriteExisting: z
      .boolean()
      .default(false)
      .describe("Whether to overwrite an existing server with the same name"),
  },
  async ({ serverName, serverCode, registerWithClaude, overwriteExisting }) => {
    try {
      // Make sure the servers directory exists
      await fs.mkdir(SERVERS_DIR, { recursive: true });

      // Sanitize the server name for use as a filename
      const sanitizedName = serverName.replace(/[^a-zA-Z0-9-_]/g, "_");
      const filename = `${sanitizedName}.js`;
      const filePath = path.join(SERVERS_DIR, filename);

      // Check if the server already exists
      const exists = await fileExists(filePath);

      // Handle existing server case
      if (exists && !overwriteExisting) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Server "${serverName}" already exists at ${filePath}. Use 'updateServer' to update it, or set 'overwriteExisting' to true to replace it.`,
            },
          ],
          isError: true,
        };
      }

      // Write the server file (no backup)
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

      const action = exists ? "updated" : "created";
      return {
        content: [
          {
            type: "text",
            text: `Successfully ${action} JavaScript MCP server "${serverName}" at ${filePath}.\n${registrationMessage}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating/updating server: ${
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
MCP Server Generator Help:

This tool helps you create and update custom JavaScript MCP servers and register them with Claude Desktop.

Available tools:

1. getSdkInfo
   - Fetches the latest documentation from the TypeScript SDK GitHub repository
   
2. getTemplate
   - Returns an example MCP server template to help guide development
   
3. createServer
   - Creates a new JavaScript MCP server or updates an existing one
   - Parameters:
     - serverName: Name of your server (used for the filename)
     - serverCode: The complete JavaScript code for your server
     - registerWithClaude: Whether to register with Claude Desktop (default: true)
     - overwriteExisting: Whether to overwrite an existing server (default: false)
   
4. updateServer
   - Updates an existing JavaScript MCP server directly
   - Parameters:
     - serverName: Name of the server to update
     - serverCode: The updated JavaScript code for your server
   
5. listServers
   - Lists all servers created with this tool
   
6. getClaudeConfig
   - Retrieves the current Claude Desktop configuration
   
7. updateClaudeConfig
   - Updates the Claude Desktop configuration file
   - Parameters:
     - configData: Complete JSON configuration

8. getServerContent
   - Retrieves the current content of a server file
   - Parameters:
     - serverName: Name of the server to get content for
     
9. getHelp
   - Shows this help message

Workflow for creating a new server:
1. Use getSdkInfo to learn about the TypeScript SDK
2. Use getTemplate to see how an MCP server is structured
3. Ask to create a custom server for your needs
4. Use createServer to save the server and register it with Claude Desktop
5. To make changes later, use updateServer or createServer with overwriteExisting=true

Workflow for updating servers:
1. Use listServers to find the exact name of the server you want to update
2. Use getServerContent with the exact server name to retrieve its current code
3. Make your modifications to the code
4. Use updateServer with the server name and modified code to save changes
`,
      },
    ],
  };
});

// Tool to update an existing MCP server
server.tool(
  "updateServer",
  {
    serverName: z.string().min(1),
    serverCode: z.string().min(1),
  },
  async ({ serverName, serverCode }) => {
    try {
      // Strip .js extension if it's already included in the serverName
      const nameWithoutExtension = serverName.endsWith(".js")
        ? serverName.slice(0, -3)
        : serverName;

      // Sanitize the server name for use as a filename
      const sanitizedName = nameWithoutExtension.replace(
        /[^a-zA-Z0-9-_]/g,
        "_"
      );
      const filename = `${sanitizedName}.js`;
      const filePath = path.join(SERVERS_DIR, filename);

      // Check if the server exists
      const exists = await fileExists(filePath);
      if (!exists) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Server "${nameWithoutExtension}" does not exist. Please use 'listServers' first to see available servers, then use 'createServer' to create a new server if needed.`,
            },
          ],
          isError: true,
        };
      }

      // Read the existing file content before updating
      const existingCode = await fs.readFile(filePath, "utf-8");
      console.log(
        `Reading existing code for ${nameWithoutExtension} before update`
      );

      // Update the server file
      await fs.writeFile(filePath, serverCode);

      return {
        content: [
          {
            type: "text",
            text: `Successfully updated MCP server "${nameWithoutExtension}" at ${filePath}.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating server: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Add a new tool to handle partial updates

// Tool to get the content of an existing MCP server
server.tool(
  "getServerContent",
  {
    serverName: z.string().min(1),
  },
  async ({ serverName }) => {
    try {
      // Strip .js extension if it's already included in the serverName
      const nameWithoutExtension = serverName.endsWith(".js")
        ? serverName.slice(0, -3)
        : serverName;

      // Sanitize the server name for use as a filename
      const sanitizedName = nameWithoutExtension.replace(
        /[^a-zA-Z0-9-_]/g,
        "_"
      );
      const filename = `${sanitizedName}.js`;
      const filePath = path.join(SERVERS_DIR, filename);

      // Check if the server exists
      const exists = await fileExists(filePath);
      if (!exists) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Server "${nameWithoutExtension}" does not exist. Please use 'listServers' first to see available servers.`,
            },
          ],
          isError: true,
        };
      }

      // Read the server file content
      const serverCode = await fs.readFile(filePath, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `Server "${nameWithoutExtension}" content:\n\n${serverCode}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading server content: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

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
