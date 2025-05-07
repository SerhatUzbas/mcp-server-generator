// creator-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TEMPLATE_MCP_SERVER } from "./template.ts";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { z } from "zod";
import path from "path";
import os from "os";

const CLAUDE_CONFIG_PATH = path.join(
  os.homedir(),
  "Library/Application Support/Claude/claude_desktop_config.json"
);

const CURRENT_DIR = import.meta.url
  ? path.dirname(new URL(import.meta.url).pathname)
  : __dirname;

const SERVERS_DIR = path.join(CURRENT_DIR, "servers");

const TYPESCRIPT_SDK_URL =
  "https://github.com/modelcontextprotocol/typescript-sdk";

const TYPESCRIPT_SDK_README_URL =
  "https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md";

const server = new McpServer({
  name: "MCP Server Creator",
  version: "1.0.0",
  description: "Create custom MCP servers with AI assistance",
});

const execAsync = promisify(exec);

server.resource("template", "mcp-template://default", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: TEMPLATE_MCP_SERVER,
    },
  ],
}));

server.prompt("system prompt", {}, () => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `# MCP Server Creator Assistant

## YOUR ROLE AND BEHAVIOR
- You are an expert JavaScript developer specializing in MCP (Model Context Protocol) servers
- Be friendly and confident in your responses, starting with a brief greeting
- Explain your process step-by-step to help users understand what you're doing
- Make decisions autonomously without asking for additional input when possible
- Favor creating complete, working solutions rather than partial examples
- Write clean, modern JavaScript code with proper error handling and comments
- Always use ES modules (import/export) syntax, not CommonJS (require)

## SCENARIOS

### SCENARIO 1: CREATING A NEW MCP SERVER
When a user asks for a new MCP server:
1. Begin by acknowledging their request and confirming the server's purpose
2. Create a complete, production-ready JavaScript file following MCP standards
3. Include all essential components:
   - Proper imports from "@modelcontextprotocol/sdk/server/mcp.js"
   - Server definition with meaningful name, version, and description
   - Resources for static/dynamic data when appropriate
   - Well-designed tools with proper parameter validation using Zod
   - Prompts if the server needs to guide LLM interactions
   - Connection setup with StdioServerTransport
4. Automatically identify necessary npm dependencies
5. Install dependencies using the installServerDependencies tool
6. Register the server with Claude Desktop

### SCENARIO 2: UPDATING AN EXISTING MCP SERVER
When a user wants to update an existing server or if there is already a server with same functionality:
1. Use listServers to show available servers
2. Retrieve the current code with getServerContent
3. Analyze the existing structure before making changes
4. Preserve existing functionality while adding new features
5. Follow the same code standards as the original
6. Install any new dependencies needed
7. Clearly explain what changes you made

## CODE IMPLEMENTATION REQUIREMENTS
- All servers must use the TypeScript SDK
- Structure server code in this order: imports → server definition → resources → tools → prompts → transport/connection
- Every tool must use Zod validation for parameters
- Include thorough error handling in async functions
- Add descriptive comments for complex logic
- Keep responses under 30,000 characters
- NO placeholder code - everything must be fully implemented

## HANDLING API KEYS AND AUTHENTICATION
- If an API requires authentication, explain this requirement to the user
- API keys should ALWAYS be handled using environment variables loaded from a .env file
- The .env file should be located at the project root (same level as the servers folder)
- Include the dotenv package to load environment variables
- Add clear validation for environment variables and helpful error messages if they're missing
- Explain to users that they need to manually create or edit the .env file with their API keys
- Provide the exact environment variable names the user needs to add to their .env file
- For services that offer free tiers or trials, mention this and provide signup links
- When possible, suggest free/open alternatives that don't require authentication
- NEVER store API keys in the server code itself

## TOOLS TO USE
- listServers: To show available servers
- getServerContent: To retrieve existing server code
- getTemplate: To see example MCP server structure
- createMcpServer: To save a new server and register with Claude
- updateServer: To modify an existing server
- analyzeServerDependencies: To identify required packages
- installServerDependencies: To install npm packages
- getClaudeConfig: To get the current Claude Desktop configuration
- updateClaudeConfig: To update the Claude Desktop configuration

After creating or updating a server, provide a brief summary of what the server does and how to use it. Remind users to:
1. Manually create or edit the .env file in the project root with their API keys
2. Make sure dotenv is installed (npm install dotenv)
3. Restart Claude Desktop after updating the server to apply changes
4. Format of .env file entries should be: KEY=value (no quotes)`,
      },
    },
  ],
}));

server.resource("sdk-info", "mcp-docs://typescript-sdk", async (uri) => {
  try {
    const { default: fetch } = await import("node-fetch");

    const response = await fetch(TYPESCRIPT_SDK_README_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch from GitHub: ${response.status} ${response.statusText}`
      );
    }

    const readmeContent = await response.text();

    const contentWithHeader = `# TypeScript SDK for Model Context Protocol

    Retrieved from: ${TYPESCRIPT_SDK_README_URL}

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

server.tool(
  "createMcpServer",
  {
    serverName: z.string().min(1),
    serverCode: z.string().min(1),
    registerWithClaude: z.boolean().default(true),
  },
  async ({ serverName, serverCode, registerWithClaude }) => {
    try {
      await fs.mkdir(SERVERS_DIR, { recursive: true });

      const sanitizedName = serverName.replace(/[^a-zA-Z0-9-_]/g, "_");
      const filename = `${sanitizedName}.js`;
      const filePath = path.join(SERVERS_DIR, filename);

      const exists = await fileExists(filePath);

      if (exists) {
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

      await fs.writeFile(filePath, serverCode);

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
            text: `Successfully created JavaScript MCP server "${serverName}" at ${filePath}.\n${registrationMessage}`,
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

server.tool(
  "updateClaudeConfig",
  {
    configData: z.string(),
  },
  async ({ configData }) => {
    try {
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
   
3. createMcpServer
   - Creates a new JavaScript MCP server or updates an existing one
   - Parameters:
     - serverName: Name of your server (used for the filename)
     - serverCode: The complete JavaScript code for your server
     - registerWithClaude: Whether to register with Claude Desktop (default: true)
   
4. updateMcpServer
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
1. Ask to create a custom server for your needs
2. Use createMcpServer to save the server and register it with Claude Desktop
3. Use analyzeServerDependencies to detect required packages
4. Use installServerDependencies to install the required packages

Workflow for updating servers:
1. Use listServers to find the exact name of the server you want to update
2. Use getServerContent with the exact server name to retrieve its current code
3. Make your modifications to the code
4. Use updateMcpServer with the server name and modified code to save changes
5. If you added new dependencies, use analyzeServerDependencies and installServerDependencies
`,
      },
    ],
  };
});

server.tool(
  "updateMcpServer",
  {
    serverName: z.string().min(1),
    serverCode: z.string().min(1),
  },
  async ({ serverName, serverCode }) => {
    try {
      const nameWithoutExtension = serverName.endsWith(".js")
        ? serverName.slice(0, -3)
        : serverName;

      const sanitizedName = nameWithoutExtension.replace(
        /[^a-zA-Z0-9-_]/g,
        "_"
      );
      const filename = `${sanitizedName}.js`;
      const filePath = path.join(SERVERS_DIR, filename);

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

server.tool(
  "getServerContent",
  {
    serverName: z.string().min(1),
  },
  async ({ serverName }) => {
    try {
      const nameWithoutExtension = serverName.endsWith(".js")
        ? serverName.slice(0, -3)
        : serverName;

      const sanitizedName = nameWithoutExtension.replace(
        /[^a-zA-Z0-9-_]/g,
        "_"
      );
      const filename = `${sanitizedName}.js`;
      const filePath = path.join(SERVERS_DIR, filename);

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

server.tool(
  "installServerDependencies",
  {
    dependencies: z
      .array(z.string())
      .describe("List of npm packages to install"),
  },
  async ({ dependencies }) => {
    const log = (msg: string) =>
      process.stdout.write(`[installServerDependencies] ${msg}\n`);

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

      let dependencyString = "";

      const currentDir = process.cwd();
      log(`Current working directory: ${currentDir}`);

      const projectDir = CURRENT_DIR;
      log(`Project directory: ${projectDir}`);

      const tempDir = path.join(os.tmpdir(), `mcp-npm-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });
      log(`Created temporary directory: ${tempDir}`);

      const projectPackageJsonPath = path.join(projectDir, "package.json");

      const projectPackageJsonStr = await fs.readFile(
        projectPackageJsonPath,
        "utf-8"
      );

      let projectPackageJson;

      try {
        projectPackageJson = JSON.parse(projectPackageJsonStr);
      } catch (err) {
        log(`Could not parse project package.json, creating a new one`);
        projectPackageJson = {
          name: "mcp-project",
          version: "1.0.0",
          type: "module",
          dependencies: {},
        };
      }

      if (!projectPackageJson.dependencies) {
        projectPackageJson.dependencies = {};
      }

      const projectPackageDependencies = projectPackageJson.dependencies;

      const NonExistingDependencies = dependencies.filter(
        (dep) => !projectPackageDependencies[dep]
      );

      if (NonExistingDependencies.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `All dependencies are already installed.`,
            },
          ],
          isError: false,
        };
      } else {
        dependencyString = NonExistingDependencies.join(" ");
      }

      const tempPackageJson = {
        name: "mcp-temp-install",
        version: "1.0.0",
        private: true,
      };

      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(tempPackageJson, null, 2)
      );

      try {
        const originalDir = process.cwd();
        process.chdir(tempDir);
        log(`Changed working directory to: ${tempDir}`);

        const { stdout, stderr } = await execAsync(
          `npm install ${dependencyString} --no-package-lock --no-audit --no-fund`
        );

        process.chdir(originalDir);
        log(`Returned to working directory: ${originalDir}`);

        if (stderr && !stderr.includes("npm WARN")) {
          log(`Installation stderr: ${stderr}`);
        }

        log(`Installation stdout: ${stdout}`);

        const projectNodeModules = path.join(projectDir, "node_modules");
        log(`Project node_modules path: ${projectNodeModules}`);
        await fs.mkdir(projectNodeModules, { recursive: true });

        for (const dep of NonExistingDependencies) {
          const baseDep = dep.split("@")[0];
          const srcPath = path.join(tempDir, "node_modules", baseDep);
          const destPath = path.join(projectNodeModules, baseDep);

          try {
            // Check if directory exists before copying
            await fs.access(srcPath);
            log(`Found dependency at ${srcPath}`);

            // Remove existing directory if it exists
            try {
              await fs.access(destPath);
              await fs.rm(destPath, { recursive: true, force: true });
              log(`Removed existing ${destPath}`);
            } catch (err) {
              // Ignore if directory doesn't exist
              log(`No existing directory at ${destPath}`);
            }

            // Create parent directory if needed
            await fs.mkdir(path.dirname(destPath), { recursive: true });

            // Copy recursively using fs instead of exec
            log(`Copying from ${srcPath} to ${destPath}`);
            await copyRecursive(srcPath, destPath);
            log(`Copied ${baseDep} to project node_modules`);
          } catch (err) {
            log(`Error copying ${baseDep}: ${err}`);
          }
        }

        // Update the package.json file with the new dependencies
        log(`Updating package.json with new dependencies`);
        //const projectPackageJsonPath = path.join(projectDir, "package.json");
        try {
          // Read the package.json from the temp directory to get the installed versions
          const tempPackageJsonPath = path.join(tempDir, "package.json");
          const tempPackageJsonStr = await fs.readFile(
            tempPackageJsonPath,
            "utf-8"
          );
          const tempPackageJson = JSON.parse(tempPackageJsonStr);

          // Get the versions of the installed packages
          const installedDeps = tempPackageJson.dependencies || {};

          // Read the project's package.json
          // let projectPackageJson;
          // try {
          //   const projectPackageJsonStr = await fs.readFile(
          //     projectPackageJsonPath,
          //     "utf-8"
          //   );
          //   projectPackageJson = JSON.parse(projectPackageJsonStr);
          //   projectPackageJson = projectPackageJsonStr;
          // } catch (err) {
          //   log(`Could not read project package.json, creating a new one`);
          //   projectPackageJson = {
          //     name: "mcp-project",
          //     version: "1.0.0",
          //     type: "module",
          //     dependencies: {},
          //   };
          // }

          // Ensure dependencies section exists
          // if (!projectPackageJson.dependencies) {
          //   projectPackageJson.dependencies = {};
          // }

          // Add the new dependencies with their versions
          let dependenciesAdded = false;
          for (const dep of NonExistingDependencies) {
            const baseDep = dep.split("@")[0]; // Handle version specifiers
            if (installedDeps[baseDep]) {
              projectPackageJson.dependencies[baseDep] = installedDeps[baseDep];
              dependenciesAdded = true;
              log(`Added ${baseDep}@${installedDeps[baseDep]} to package.json`);
            }
          }

          if (dependenciesAdded) {
            // Write the updated package.json
            await fs.writeFile(
              projectPackageJsonPath,
              JSON.stringify(projectPackageJson, null, 2)
            );
            log(`Updated package.json successfully`);
          } else {
            log(`No dependencies were added to package.json`);
          }
        } catch (packageJsonErr) {
          log(`Error updating package.json: ${packageJsonErr}`);
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully installed dependencies: ${dependencyString}`,
            },
          ],
        };
      } catch (error) {
        log(`Installation error: ${error}`);

        // Attempt to return to original directory if needed
        try {
          process.chdir(currentDir);
          log(`Ensured return to original directory: ${currentDir}`);
        } catch (cdErr) {
          log(`Error returning to original directory: ${cdErr}`);
        }

        return {
          content: [
            {
              type: "text",
              text: `Error installing dependencies: ${
                error instanceof Error ? error.message : String(error)
              }\n\nPlease try installing manually by running: npm install ${dependencies.join(
                " "
              )}`,
            },
          ],
          isError: true,
        };
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
          log(`Cleaned up temporary directory`);
        } catch (cleanError) {
          log(`Error cleaning up temporary directory: ${cleanError}`);
        }
      }
    } catch (outerError) {
      log(`Outer installation error: ${outerError}`);
      return {
        content: [
          {
            type: "text",
            text: `Error installing dependencies: ${
              outerError instanceof Error
                ? outerError.message
                : String(outerError)
            }\n\nPlease try installing manually by running: npm install ${dependencies.join(
              " "
            )}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Helper function to recursively copy directories
async function copyRecursive(src: string, dest: string) {
  const stats = await fs.stat(src);

  if (stats.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      await copyRecursive(srcPath, destPath);
    }
  } else {
    await fs.copyFile(src, dest);
  }
}

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

const transport = new StdioServerTransport();
server.connect(transport);

async function registerServerWithClaude(
  serverName: string,
  serverPath: string
): Promise<string> {
  const configExists = await fileExists(CLAUDE_CONFIG_PATH);

  if (!configExists) {
    await fs.writeFile(
      CLAUDE_CONFIG_PATH,
      JSON.stringify({ mcpServers: {} }, null, 2)
    );
  }

  const configData = await fs.readFile(CLAUDE_CONFIG_PATH, "utf-8");
  const config = JSON.parse(configData);

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  config.mcpServers[serverName] = {
    command: "node",
    args: [serverPath],
  };

  await fs.writeFile(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));

  return `Server registered with Claude Desktop as "${serverName}".`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
