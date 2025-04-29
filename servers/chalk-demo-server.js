import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Now we can use chalk since it's installed
import chalk from "chalk";

// Create an MCP server
const server = new McpServer({
  name: "Chalk Demo Server",
  version: "1.0.0",
  description: "A server that demonstrates the use of chalk to color text",
});

// Add a tool that uses chalk to color text
server.tool(
  "colorText",
  {
    text: z.string(),
    color: z.string(),
  },
  async ({ text, color }) => {
    try {
      // Using chalk to color the text based on the provided color
      let coloredText = text;

      // Check if chalk has the requested color method
      if (color in chalk) {
        coloredText = `Colored with chalk: ${chalk[color](text)}`;
      } else {
        coloredText = `Color "${color}" not available in chalk. Available colors include: red, green, blue, yellow, etc.`;
      }

      return {
        content: [
          {
            type: "text",
            text: coloredText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
