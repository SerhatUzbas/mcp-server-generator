import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server with metadata
const server = new McpServer({
  name: "AdvancedDemo",
  version: "1.0.0",
  description: "An advanced MCP server with multiple tools and resources",
});

// Tool 1: Addition
server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }],
}));

// Tool 2: Multiplication
server.tool("multiply", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a * b) }],
}));

// Tool 3: String manipulation - converts text to uppercase
server.tool("toUpperCase", { text: z.string() }, async ({ text }) => ({
  content: [{ type: "text", text: text.toUpperCase() }],
}));

// Tool 4: Weather forecast (mock)
server.tool("getWeather", { location: z.string() }, async ({ location }) => {
  // This is a mock implementation - in a real app, you'd call a weather API
  const conditions = ["Sunny", "Cloudy", "Rainy", "Snowy"];
  const temperatures = [15, 20, 25, 30];
  const randomCondition =
    conditions[Math.floor(Math.random() * conditions.length)];
  const randomTemp =
    temperatures[Math.floor(Math.random() * temperatures.length)];

  return {
    content: [
      {
        type: "text",
        text: `Weather for ${location}: ${randomCondition}, ${randomTemp}°C`,
      },
    ],
  };
});

// Resource 1: Greeting with name parameter
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Hello, ${name}! Welcome to our MCP server.`,
      },
    ],
  })
);

// Resource 2: Product information with ID parameter
server.resource(
  "product",
  new ResourceTemplate("product://{id}", { list: undefined }),
  async (uri, { id }) => {
    // Mock product database
    const products: Record<
      string,
      { name: string; price: number; description: string }
    > = {
      "1": {
        name: "Laptop",
        price: 999,
        description: "Powerful laptop with 16GB RAM",
      },
      "2": {
        name: "Smartphone",
        price: 699,
        description: "Latest smartphone with 5G",
      },
      "3": {
        name: "Tablet",
        price: 499,
        description: "10-inch tablet with long battery life",
      },
    };

    const product = products[id as string] || {
      name: "Unknown",
      price: 0,
      description: "Product not found",
    };

    return {
      contents: [
        {
          uri: uri.href,
          text: `Product: ${product.name}\nPrice: $${product.price}\nDescription: ${product.description}`,
        },
      ],
    };
  }
);

// Resource 3: List of all products
server.resource(
  "productList",
  new ResourceTemplate("product://list", { list: undefined }),
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          text: "Available Products:\n1: Laptop\n2: Smartphone\n3: Tablet",
          links: [
            { href: "product://1", rel: "item" },
            { href: "product://2", rel: "item" },
            { href: "product://3", rel: "item" },
          ],
        },
      ],
    };
  }
);

// Resource 4: Documentation
server.resource(
  "docs",
  new ResourceTemplate("docs://main", { list: undefined }),
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          text: "MCP Server Documentation:\n\nTools:\n- add: Adds two numbers\n- multiply: Multiplies two numbers\n- toUpperCase: Converts text to uppercase\n- getWeather: Provides weather forecast for a location\n\nResources:\n- greeting://{name}: Personalized greeting\n- product://{id}: Product information\n- product://list: List of all products\n- docs://main: This documentation",
          links: [{ href: "product://list", rel: "related" }],
        },
      ],
    };
  }
);

// Wrap the server connection in an immediately invoked async function
(async () => {
  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  console.log("Starting MCP server...");

  // Connect the server to the transport
  await server.connect(transport);
  console.log("Server connected");
})().catch((error) => {
  console.error("Error running MCP server:", error);
  process.exit(1);
});
