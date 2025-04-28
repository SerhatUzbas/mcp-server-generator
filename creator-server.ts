// creator-server.ts
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { TEMPLATE_MCP_SERVER } from "./template.js";
import { exec } from "child_process";
import { promisify } from "util";

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
  name: "MCP Server Creator",
  version: "1.0.0",
  description: "Create custom MCP servers with AI assistance",
});

const execAsync = promisify(exec);

// Add resources for template and SDK info
server.resource("template", "mcp-template://default", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: TEMPLATE_MCP_SERVER,
    },
  ],
}));

server.prompt("create server prompt", {}, () => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `Always start with a "hi" message.
          Your duty is create or update a new mcp server based on user's request. 
          Your output should be a valid mcp server code. 
          You have an access to a template of mcp server and mcp server typescript sdk.
          Do not request any additional information from user, like api key or any other information.
          Your solution should be enough without any additional information and must be free.
          Do not forget to install dependencies with npm.
          Your response maximum length should be 30000 characters.`,
      },
    },
  ],
}));

server.resource("sdk-info", "mcp-docs://typescript-sdk", async (uri) => {
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
      contents: [
        {
          uri: uri.href,
          text: contentWithHeader,
        },
      ],
    };
  } catch (error) {
    return {
      contents: [
        {
          uri: uri.href,
          text: `Error fetching SDK info: ${
            error instanceof Error ? error.message : String(error)
          }\n\nPlease visit ${TYPESCRIPT_SDK_URL} directly to view the documentation.`,
        },
      ],
      isError: true,
    };
  }
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
  "createMcpServer",
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

9. analyzeServerDependencies
   - Analyzes a server file to detect npm dependencies
   - Parameters:
     - serverName: Name of the server to analyze

10. installServerDependencies
   - Installs npm packages required by a server
   - Parameters:
     - dependencies: Array of package names to install
     
11. getHelp
   - Shows this help message

Workflow for creating a new server:
3. Ask to create a custom server for your needs
4. Use createServer to save the server and register it with Claude Desktop
5. Use analyzeServerDependencies to detect required packages
6. Use installServerDependencies to install the required packages
7. To make changes later, use updateServer or createServer with overwriteExisting=true

Workflow for updating servers:
1. Use listServers to find the exact name of the server you want to update
2. Use getServerContent with the exact server name to retrieve its current code
3. Make your modifications to the code
4. Use updateServer with the server name and modified code to save changes
5. If you added new dependencies, use analyzeServerDependencies and installServerDependencies
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

// Tool to install dependencies for a server
server.tool(
  "installServerDependencies",
  {
    dependencies: z
      .array(z.string())
      .describe("List of npm packages to install"),
  },
  async ({ dependencies }) => {
    // Use stderr for logging to avoid interfering with MCP protocol on stdout
    const log = (msg: string) => process.stderr.write(`[installServerDependencies] ${msg}\n`);
    
    try {
      if (!dependencies || dependencies.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No dependencies specified. Please provide a list of npm packages to install.",
            },
          ],
          isError: true,
        };
      }

      const dependencyString = dependencies.join(" ");
      log(`Installing dependencies: ${dependencyString}`);

      // Get current directory for logging
      const currentDir = process.cwd();
      log(`Current working directory: ${currentDir}`);

      // Check for running npm processes
      try {
        const { stdout: psOutput } = await execAsync("ps aux | grep npm");
        log(`Current npm processes: \n${psOutput}`);
      } catch (psError) {
        log(`Error checking npm processes: ${psError}`);
      }

      // Try using yarn first
      try {
        log("Checking if yarn is available...");
        await execAsync("yarn --version");
        log("Yarn is available, using it for installation");
        
        // Use yarn add instead of npm install
        const { stdout, stderr } = await execAsync(
          `yarn add ${dependencyString} --no-lockfile`
        );
        
        if (stderr && !stderr.includes("yarn warn")) {
          log(`Yarn installation stderr: ${stderr}`);
        }
        
        log(`Yarn installation stdout: ${stdout}`);
        return {
          content: [
            {
              type: "text",
              text: `Successfully installed dependencies using yarn: ${dependencyString}`,
            },
          ],
        };
      } catch (yarnError) {
        log(`Yarn not available or failed: ${yarnError}`);
        
        // Fallback to npm if yarn is not available
        log("Falling back to npm with custom cache directory");
        
        // Create a temporary npm cache directory
        const npmCacheDir = path.join(os.tmpdir(), `npm-cache-${Date.now()}`);
        await fs.mkdir(npmCacheDir, { recursive: true });
        log(`Created temporary npm cache directory: ${npmCacheDir}`);
        
        try {
          // Clean npm cache first
          await execAsync("npm cache clean --force");
          log("npm cache cleaned successfully");
          
          // Wait a bit for cache cleaning to complete
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Run npm with environment variables to isolate the cache
          const installEnv = Object.assign({}, process.env, {
            npm_config_cache: npmCacheDir
          });
          
          // Try to install with a custom cache directory
          const { stdout, stderr } = await execAsync(
            `npm install ${dependencyString} --no-package-lock --no-audit --no-fund`,
            { env: installEnv }
          );
          
          // Check for any errors in stderr that aren't just warnings
          if (stderr && !stderr.includes("npm WARN")) {
            log(`Installation stderr: ${stderr}`);
            return {
              content: [
                {
                  type: "text",
                  text: `Warning during installation: ${stderr}\n\nDependencies may have been partially installed: ${dependencyString}`,
                },
              ],
            };
          }
          
          log(`Installation stdout: ${stdout}`);
          return {
            content: [
              {
                type: "text",
                text: `Successfully installed dependencies: ${dependencyString}`,
              },
            ],
          };
        } catch (npmError) {
          log(`Npm installation error: ${npmError}`);
          return {
            content: [
              {
                type: "text",
                text: `Error installing dependencies. Both yarn and npm failed.\n\nPlease try installing manually by running: npm install ${dependencyString}`,
              },
            ],
            isError: true,
          };
        } finally {
          // Clean up temporary npm cache
          try {
            await fs.rm(npmCacheDir, { recursive: true, force: true });
            log(`Cleaned up temporary npm cache directory`);
          } catch (cleanError) {
            log(`Error cleaning up npm cache directory: ${cleanError}`);
          }
        }
      }
    } catch (error) {
      log(`Installation error: ${error}`);
      return {
        content: [
          {
            type: "text",
            text: `Error installing dependencies: ${
              error instanceof Error ? error.message : String(error)
            }\n\nPlease try installing manually by running: npm install ${dependencies.join(" ")}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool to analyze server dependencies
server.tool(
  "analyzeServerDependencies",
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

      // Simple regex to find import statements
      const importRegex = /import\s+(?:[\w\s{},*]+from\s+)?['"]([^'"]+)['"]/g;
      const imports = [];
      let match;

      while ((match = importRegex.exec(serverCode)) !== null) {
        imports.push(match[1]);
      }

      // Filter out built-in Node.js modules and SDK imports
      const nodeBuiltins = [
        "fs",
        "path",
        "http",
        "https",
        "util",
        "os",
        "child_process",
        "crypto",
      ];
      const sdkImports = ["@modelcontextprotocol/sdk"];

      const externalDependencies = imports.filter((imp) => {
        // Check if it's not a relative import, built-in module, or SDK import
        const isRelative =
          imp.startsWith("./") || imp.startsWith("../") || imp.startsWith("/");
        const isBuiltin = nodeBuiltins.some(
          (builtin) => imp === builtin || imp.startsWith(`${builtin}/`)
        );
        const isSdk = sdkImports.some(
          (sdk) => imp === sdk || imp.startsWith(`${sdk}/`)
        );

        return !isRelative && !isBuiltin && !isSdk;
      });

      // Extract package names (remove trailing paths)
      const packageNames = externalDependencies.map((dep) => {
        const parts = dep.split("/");
        if (dep.startsWith("@")) {
          // Handle scoped packages like @org/package
          return `${parts[0]}/${parts[1]}`;
        } else {
          return parts[0];
        }
      });

      // Remove duplicates
      const uniquePackages = [...new Set(packageNames)];

      return {
        content: [
          {
            type: "text",
            text:
              uniquePackages.length > 0
                ? `Server "${nameWithoutExtension}" depends on these packages: ${uniquePackages.join(
                    ", "
                  )}`
                : `Server "${nameWithoutExtension}" does not have external dependencies.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error analyzing server dependencies: ${
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
