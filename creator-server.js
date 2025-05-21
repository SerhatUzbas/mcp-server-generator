import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TEMPLATE_MCP_SERVER } from "./template.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { z } from "zod";
import path from "path";
import os from "os";

const CLAUDE_CONFIG_PATH = (() => {
  // Detect operating system and set appropriate config path
  if (process.platform === "darwin") {
    // macOS
    return path.join(
      os.homedir(),
      "Library/Application Support/Claude/claude_desktop_config.json"
    );
  } else if (process.platform === "win32") {
    // Windows
    // %APPDATA% resolves to AppData/Roaming
    return path.join(
      process.env.APPDATA,
      "Claude",
      "claude_desktop_config.json"
    );
  } else {
    // Linux and others
    return path.join(
      os.homedir(),
      ".config",
      "Claude",
      "claude_desktop_config.json"
    );
  }
})();

// Fix for file:// URL path handling across platforms
const CURRENT_DIR = (() => {
  if (import.meta.url) {
    const fileUrl = new URL(import.meta.url);
    // Convert URL to proper system path - handles Windows paths correctly
    return path.normalize(
      process.platform === "win32"
        ? fileUrl.pathname.substring(1) // Remove leading slash on Windows
        : fileUrl.pathname
    );
  } else {
    return __dirname;
  }
})();

const SERVERS_DIR = path.join(path.dirname(CURRENT_DIR), "servers");

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
   - Do not use resource template
   - Well-designed tools with proper parameter validation using Zod
   - Prompts if the server needs to guide LLM interactions
   - Connection setup with StdioServerTransport
4. Automatically identify necessary npm dependencies
5. Install dependencies using the installServerDependencies tool
6. Register the server with Claude Desktop
7. Update the Claude Desktop config to include any required environment variables

IMPORTANT: Because of context window limits, you should always start with a minimal server that includes only essential components (resources, tools, prompts, etc).After creating the server, you can use the updateMcpServer tool to add more functionality.

### SCENARIO 2: UPDATING AN EXISTING MCP SERVER
When a user wants to update an existing server or if there is already a server with same functionality:
1. Use listServers to show available servers
2. Retrieve the current code with getServerContent, which will display the code with line numbers
3. Analyze the existing structure before making changes
4. For updates, prefer focused, targeted changes over complete rewrites:
   - Use updateMcpServer with updateType="section" to modify specific parts
   - Use updateMcpServer with updateType="add" to insert new functionality
   - Only use updateMcpServer with updateType="full" when extensive changes are needed
5. When using updateMcpServer with "section" or "add" types:
   - ALWAYS refer to the exact line numbers shown in getServerContent output
   - Double-check that your start/end lines match the correct sections of code
   - Validate that insertAfterLine is the exact line where you want to insert code
6. Follow the same code standards as the original
7. Install any new dependencies needed
8. Explain how to update the Claude Desktop config if new environment variables are needed
9. Clearly explain what changes you made

### SCENARIO 3: DEBUGGING SERVERS THAT DON'T APPEAR IN CLAUDE DESKTOP
When a user reports that a server isn't appearing in Claude Desktop:
1. Use runServerDirectly to test the server and capture any errors
2. Analyze the output for common issues:
   - Syntax errors in the JavaScript code
   - Missing dependencies
   - Issues with environment variables
   - Problems with the server connection to transport
3. Recommend specific fixes based on the errors detected
4. Use updateMcpServer to implement the necessary fixes
5. Verify the Claude Desktop configuration is correct
6. Remind the user to restart Claude Desktop after making changes

## CODE IMPLEMENTATION REQUIREMENTS
- All servers must use the TypeScript SDK
- Structure server code in this order: imports → server definition → resources → tools → prompts → transport/connection
- Every tool must use Zod validation for parameters
- Include thorough error handling in async functions
- Add descriptive comments for complex logic
- Responses should be under 30,000 characters, because context window is 32,000 characters. If you need to add more, you can later use the updateMcpServer tool.
- NO placeholder code - everything must be fully implemented

## HANDLING CONTEXT WINDOW LIMITS
- When creating a large server that might exceed the context window limit (32,000 characters):
  - The server code is saved to disk IMMEDIATELY when createMcpServer is called
  - This happens as the FIRST action, BEFORE any response is returned to you
  - The code is saved to: [Project Directory]/servers/[serverName].js
  - If the conversation is interrupted, the file is ALREADY safely stored on disk
  - To continue working:
    1. Start a new conversation
    2. Verify the server was created with listServers
    3. View the current code with getServerContent
    4. Continue development with updateMcpServer
  - This ensures that progress is never lost when hitting context limits

## HANDLING API KEYS AND AUTHENTICATION
- If you use third party services, you should look for documentation on how to use them.
- If an API requires authentication, explain this requirement to the user
- API keys should ALWAYS be handled using environment variables configured in the Claude Desktop config
- When registering a server that requires API keys, clearly explain what environment variables need to be set in the Claude config
- In your code, access API keys using process.env.KEY_NAME
- Add clear validation for environment variables and helpful error messages if they're missing
- Clearly tell users which environment variables they need to set in the Claude Desktop config
- For services that offer free tiers or trials, mention this and provide signup links
- When possible, suggest free/open alternatives that don't require authentication
- NEVER store API keys in the server code itself

## TOOLS TO USE
- listServers: To show available servers
- getServerContent: To retrieve existing server code with line numbers
- getTemplate: To see example MCP server structure
- createMcpServer: To save a new server and register with Claude
- updateMcpServer: To update an existing server (full rewrite, section update, or add code)
- analyzeServerDependencies: To identify required packages
- installServerDependencies: To install npm packages
- getClaudeConfig: To get the current Claude Desktop configuration
- updateClaudeConfig: To update the Claude Desktop configuration with any environment variables needed
- runServerDirectly: To test a server and debug any issues that prevent it from appearing in Claude Desktop

After creating or updating a server, provide a brief summary of what the server does and how to use it. Remind users to:
1. Update their Claude Desktop config to add actual API keys if needed
2. Install any required npm dependencies
3. Restart Claude Desktop after updating the server and config to apply changes

When explaining how to update the Claude Desktop config for environment variables, provide a specific example that shows the proper structure:

\`\`\`json
{
  "mcpServers": {
    "yourServerName": {
      "command": "node",
      "args": ["/path/to/your/server.js"],
      "env": {
        "YOUR_API_KEY": "actual-api-key-value-here"
      }
    }
  }
}
\`\`\``,
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
              text: `Error: Server "${serverName}" already exists at ${filePath}. Use 'updateMcpServer' to update it.`,
            },
          ],
          isError: true,
        };
      }

      console.log(
        `[createMcpServer] Writing server "${serverName}" to file: ${filePath}`
      );
      await fs.writeFile(filePath, serverCode);
      console.log(
        `[createMcpServer] Server successfully saved to disk at: ${filePath}`
      );

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

      const lines = serverCode.split("\n");
      const numberedLines = lines.map(
        (line, index) => `${(index + 1).toString().padStart(4, " ")}| ${line}`
      );
      const numberedCode = numberedLines.join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Successfully created JavaScript MCP server "${serverName}" at ${filePath}.\n${registrationMessage}\n\nServer content with line numbers:\n\n${numberedCode}\n\nTotal lines: ${lines.length}\n\n*** IMPORTANT: Your server has ALREADY been saved to disk at ${filePath}. ***\nIf this conversation is interrupted due to context limits, you can start a new conversation and continue working on your server using updateMcpServer without losing any progress.`,
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

server.tool(
  "updateMcpServer",
  {
    serverName: z.string().min(1),
    updateType: z.enum(["full", "section", "add"]),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    insertAfterLine: z.number().int().positive().optional(),
    code: z.string().min(1),
    description: z.string().optional(),
  },
  async ({
    serverName,
    updateType,
    startLine,
    endLine,
    insertAfterLine,
    code,
    description,
  }) => {
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

      if (updateType === "full") {
        await fs.writeFile(filePath, code);

        const updateDetails = description
          ? `\nUpdate details: ${description}`
          : "";

        const updatedLines = code.split("\n");
        const numberedLines = updatedLines.map(
          (line, index) => `${(index + 1).toString().padStart(4, " ")}| ${line}`
        );
        const numberedCode = numberedLines.join("\n");

        return {
          content: [
            {
              type: "text",
              text: `Successfully updated entire MCP server "${nameWithoutExtension}".${updateDetails}\n\nUpdated file content with line numbers:\n\n${numberedCode}\n\nTotal lines: ${updatedLines.length}`,
            },
          ],
        };
      }

      const serverCode = await fs.readFile(filePath, "utf-8");
      const lines = serverCode.split("\n");

      if (updateType === "section") {
        if (!startLine || !endLine) {
          return {
            content: [
              {
                type: "text",
                text: `Error: When using updateType "section", both startLine and endLine must be provided.`,
              },
            ],
            isError: true,
          };
        }

        if (startLine > lines.length || endLine > lines.length) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Line numbers out of range. The file has ${lines.length} lines, but you specified lines ${startLine}-${endLine}.`,
              },
            ],
            isError: true,
          };
        }

        if (startLine > endLine) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Start line (${startLine}) cannot be greater than end line (${endLine}).`,
              },
            ],
            isError: true,
          };
        }

        const newLines = code.split("\n");

        const updatedLines = [
          ...lines.slice(0, startLine - 1),
          ...newLines,
          ...lines.slice(endLine),
        ];

        const updatedCode = updatedLines.join("\n");

        await fs.writeFile(filePath, updatedCode);

        const numberedLines = updatedLines.map(
          (line, index) => `${(index + 1).toString().padStart(4, " ")}| ${line}`
        );
        const numberedCode = numberedLines.join("\n");

        const updateDetails = description
          ? `\nUpdate details: ${description}`
          : "";

        return {
          content: [
            {
              type: "text",
              text: `Successfully updated lines ${startLine}-${endLine} of MCP server "${nameWithoutExtension}".${updateDetails}\n\nUpdated file content with line numbers:\n\n${numberedCode}\n\nTotal lines: ${updatedLines.length}`,
            },
          ],
        };
      }

      if (updateType === "add") {
        if (!insertAfterLine) {
          return {
            content: [
              {
                type: "text",
                text: `Error: When using updateType "add", insertAfterLine must be provided.`,
              },
            ],
            isError: true,
          };
        }

        if (insertAfterLine > lines.length) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Line number out of range. The file has ${lines.length} lines, but you specified to insert after line ${insertAfterLine}.`,
              },
            ],
            isError: true,
          };
        }

        const newLines = code.split("\n");

        const updatedLines = [
          ...lines.slice(0, insertAfterLine),
          ...newLines,
          ...lines.slice(insertAfterLine),
        ];

        const updatedCode = updatedLines.join("\n");

        await fs.writeFile(filePath, updatedCode);

        const numberedLines = updatedLines.map(
          (line, index) => `${(index + 1).toString().padStart(4, " ")}| ${line}`
        );
        const numberedCode = numberedLines.join("\n");

        const updateDetails = description
          ? `\nAddition details: ${description}`
          : "";

        return {
          content: [
            {
              type: "text",
              text: `Successfully added new code after line ${insertAfterLine} of MCP server "${nameWithoutExtension}".${updateDetails}\n\nUpdated file content with line numbers:\n\n${numberedCode}\n\nTotal lines: ${updatedLines.length}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Error: Invalid updateType "${updateType}". Must be one of: "full", "section", or "add".`,
          },
        ],
        isError: true,
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

      const lines = serverCode.split("\n");
      const numberedLines = lines.map(
        (line, index) => `${(index + 1).toString().padStart(4, " ")}| ${line}`
      );
      const numberedCode = numberedLines.join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Server "${nameWithoutExtension}" content with line numbers:\n\n${numberedCode}\n\nTotal lines: ${lines.length}`,
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
    const log = (msg) =>
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

      const projectDir = CURRENT_DIR;
      log(`Project directory: ${projectDir}`);

      const packageJsonPath = path.join(projectDir, "package.json");
      let packageJson;

      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
        packageJson = JSON.parse(packageJsonContent);
        log("Found existing package.json");
      } catch (err) {
        log("Creating a new package.json file");
        packageJson = {
          name: "mcp-project",
          version: "1.0.0",
          type: "module",
          dependencies: {},
          devDependencies: {},
        };

        await fs.writeFile(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2)
        );
      }

      if (!packageJson.dependencies) {
        packageJson.dependencies = {};
      }

      if (!packageJson.devDependencies) {
        packageJson.devDependencies = {};
      }

      const missingDependencies = dependencies.filter(
        (dep) => !packageJson.dependencies[dep.split("@")[0]]
      );

      if (missingDependencies.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "All specified dependencies are already installed.",
            },
          ],
        };
      }

      const dependencyString = missingDependencies.join(" ");

      log(
        `Installing dependencies in directory ${projectDir}: ${dependencyString}`
      );

      try {
        const originalDir = process.cwd();
        process.chdir(projectDir);
        log(`Changed working directory to: ${projectDir}`);

        const { stdout, stderr } = await execAsync(
          `npm install ${dependencyString} --save`
        );

        if (stderr && !stderr.includes("npm WARN")) {
          log(`Installation warnings/errors: ${stderr}`);
        }

        log(`Regular dependencies installation output: ${stdout}`);

        log(`Checking for TypeScript type definitions...`);
        let installedTypes = [];

        for (const dep of missingDependencies) {
          const basePackage = dep.split("@")[0];
          const typePackage = `@types/${basePackage}`;

          try {
            log(`Checking if ${typePackage} exists...`);
            const { stdout: typeVersionOutput } = await execAsync(
              `npm view ${typePackage} version`
            );

            if (typeVersionOutput && typeVersionOutput.trim()) {
              log(`Installing ${typePackage} as dev dependency...`);
              await execAsync(`npm install ${typePackage} --save-dev`);
              installedTypes.push(typePackage);
            }
          } catch (typeError) {
            log(`Type definition ${typePackage} not found, skipping`);
          }
        }

        process.chdir(originalDir);
        log(`Returned to original directory: ${originalDir}`);

        const updatedPackageJsonContent = await fs.readFile(
          packageJsonPath,
          "utf-8"
        );
        const updatedPackageJson = JSON.parse(updatedPackageJsonContent);

        const installedDeps = Object.keys(
          updatedPackageJson.dependencies || {}
        ).filter((key) =>
          missingDependencies.some(
            (dep) => dep.startsWith(key + "@") || dep === key
          )
        );

        let successMessage = `Successfully installed dependencies: ${installedDeps.join(
          ", "
        )}`;

        if (installedTypes.length > 0) {
          successMessage += `\nAlso installed TypeScript type definitions: ${installedTypes.join(
            ", "
          )}`;
        }

        return {
          content: [
            {
              type: "text",
              text: successMessage,
            },
          ],
        };
      } catch (installError) {
        try {
          const currentDir = process.cwd();
          if (currentDir !== originalDir) {
            process.chdir(originalDir);
            log(`Returned to original directory after error: ${originalDir}`);
          }
        } catch (cdErr) {
          log(`Error returning to original directory: ${cdErr}`);
        }

        return {
          content: [
            {
              type: "text",
              text: `Error installing dependencies: ${
                installError instanceof Error
                  ? installError.message
                  : String(installError)
              }\n\nPlease try installing manually by going to ${projectDir} and running: npm install ${dependencyString}`,
            },
          ],
          isError: true,
        };
      }
    } catch (outerError) {
      log(`Outer installation error: ${outerError}`);
      return {
        content: [
          {
            type: "text",
            text: `Error in dependency installation process: ${
              outerError instanceof Error
                ? outerError.message
                : String(outerError)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function copyRecursive(src, dest) {
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

server.tool(
  "analyzeServerDependencies",
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

      const importRegex = /import\s+(?:[\w\s{},*]+from\s+)?['"]([^'"]+)['"]/g;
      const imports = [];
      let match;

      while ((match = importRegex.exec(serverCode)) !== null) {
        imports.push(match[1]);
      }

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

      const packageNames = externalDependencies.map((dep) => {
        const parts = dep.split("/");
        if (dep.startsWith("@")) {
          return `${parts[0]}/${parts[1]}`;
        } else {
          return parts[0];
        }
      });

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

server.tool(
  "runServerDirectly",
  {
    serverName: z.string().min(1),
    timeout: z.number().int().positive().default(10000),
  },
  async ({ serverName, timeout }) => {
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

      const { spawn } = await import("child_process");

      const nodeProcess = spawn("node", [filePath], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let hasError = false;

      nodeProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      nodeProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        hasError = true;
      });

      const timeoutId = setTimeout(() => {
        nodeProcess.kill();
      }, timeout);

      await new Promise((resolve) => {
        nodeProcess.on("exit", (code) => {
          clearTimeout(timeoutId);
          if (code !== 0 && code !== null) {
            hasError = true;
          }
          resolve(null);
        });
      });

      let resultText = "";
      if (hasError) {
        resultText = `Server "${nameWithoutExtension}" encountered errors during execution:\n\n`;
        if (stderr) {
          resultText += `STDERR:\n${stderr}\n\n`;
        }
        if (stdout) {
          resultText += `STDOUT:\n${stdout}\n`;
        }
        resultText += `\nCommon issues that might cause this server not to run:
1. Syntax errors in the server code
2. Missing dependencies - use analyzeServerDependencies and installServerDependencies
3. The server not properly connecting to the transport - make sure server.connect(transport) is called`;
      } else {
        resultText = `Server "${nameWithoutExtension}" started successfully and ran for ${timeout}ms.\n\n`;
        if (stdout) {
          resultText += `STDOUT:\n${stdout}\n\n`;
        }
        resultText += `The server appears to be working correctly. If it's not appearing in Claude Desktop:
1. Make sure it's properly registered in the Claude Desktop config
2. Try restarting Claude Desktop
3. Check that the server path in the config is correct`;
      }

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
        isError: hasError,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error running server: ${
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

async function registerServerWithClaude(serverName, serverPath) {
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
    env: {},
  };

  await fs.writeFile(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));

  return `Server registered with Claude Desktop as "${serverName}".`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
