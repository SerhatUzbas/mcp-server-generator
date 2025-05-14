// template.ts
// This file contains a template to show LLMs how to structure an MCP server

export const TEMPLATE_MCP_SERVER = `
// Example MCP Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Initialize the MCP server with metadata
const server = new McpServer({
  name: "ExampleServer",
  version: "1.0.0",
  description: "An example MCP server showing basic structure"
});

// Example of accessing an API key from environment variables
// These should be configured in the Claude Desktop config
const API_KEY = process.env.EXAMPLE_API_KEY;

// Display warning if required environment variable is missing
if (!API_KEY) {
  console.warn("Warning: EXAMPLE_API_KEY environment variable is not set.");
  console.warn("Please configure this in the Claude Desktop config.");
}

// Add a tool capability - tools let AI perform actions
server.tool(
  "exampleTool",  // tool name
  {              // parameter schema using zod
    message: z.string().describe("A message to echo back")
  },
  async ({ message }) => {  // implementation
    return {
      content: [{ type: "text", text: \`You said: \${message}\` }]
    };
  }
);

// Add a resource capability - resources let AI access data
// This uses the API key from environment variables
server.resource(
  "exampleApiResource",  // resource name
  "example-api://{path}",  // URI template (no need for apiKey in URL)
  async (uri, params) => {
    const { path } = params;
    
    // Validate API key from environment variable
    if (!API_KEY) {
      return {
        contents: [{
          uri: uri.href,
          text: "Error: API key is not configured in environment variables. Please add EXAMPLE_API_KEY to your Claude Desktop config."
        }],
        isError: true
      };
    }
    
    try {
      // Example of using the API key from environment variables to fetch data
      // In a real implementation, you would use the API key to authenticate
      // with an external service and fetch the requested data
      
      return {
        contents: [{
          uri: uri.href,
          text: \`Successfully fetched data for \${path} using the API key from environment variables\`
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: \`Error fetching data: \${error instanceof Error ? error.message : String(error)}\`
        }],
        isError: true
      };
    }
  }
);

// Connect the server to the stdio transport
const transport = new StdioServerTransport();
server.connect(transport);
`;
