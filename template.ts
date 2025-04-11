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
// This is an example of a simple resource template
/*
server.resource(
  "exampleResource",
  new ResourceTemplate("example://{id}", { list: true }),
  async (uri, { id }) => {
    return {
      contents: [{
        uri: uri.href,
        text: \`This is resource \${id}\`
      }]
    };
  }
);
*/

// Connect the server to the stdio transport
const transport = new StdioServerTransport();
server.connect(transport);
`;
