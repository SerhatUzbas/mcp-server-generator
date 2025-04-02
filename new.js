import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pg from "pg";
import { z } from "zod";

// Create PostgreSQL client
// const client = new pg.Client({
//   connectionString:
//     process.env.DATABASE_URL ||
//     "postgresql://postgres:postgres@localhost:5432/postgres",
// });

// // Connect to the database
// await client.connect().catch((err) => {
//   console.error("Failed to connect to PostgreSQL:", err);
//   process.exit(1);
// });

const server = new McpServer({
  name: "postgres-mcp-server",
  version: "0.1.0",
});

server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }],
  a,
}));

// server.tool("subtract", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
//   content: [{ type: "text", text: String(a - b) }],
//   a,
// }));

// // Tool to get database schema information
// server.tool(
//   "getSchema",
//   {
//     table: z.string().optional(),
//   },
//   async ({ table }) => {
//     try {
//       let query;
//       let result;

//       if (table) {
//         // Get schema for a specific table
//         query = `
//         SELECT column_name, data_type, is_nullable
//         FROM information_schema.columns
//         WHERE table_name = $1
//         ORDER BY ordinal_position;
//       `;
//         result = await client.query(query, [table]);

//         return {
//           content: [
//             {
//               type: "text",
//               text: `Schema for table ${table}:\n${JSON.stringify(
//                 result.rows,
//                 null,
//                 2
//               )}`,
//             },
//           ],
//         };
//       } else {
//         // Get list of all tables
//         query = `
//         SELECT table_name
//         FROM information_schema.tables
//         WHERE table_schema = 'public'
//         ORDER BY table_name;
//       `;
//         result = await client.query(query);

//         return {
//           content: [
//             {
//               type: "text",
//               text: `Available tables:\n${JSON.stringify(
//                 result.rows,
//                 null,
//                 2
//               )}`,
//             },
//           ],
//         };
//       }
//     } catch (error) {
//       return {
//         content: [
//           { type: "text", text: `Error getting schema: ${error.message}` },
//         ],
//       };
//     }
//   }
// );

// // Tool to query data from tables
// server.tool("queryData", {}, async ({ table, columns, limit, where }) => {
//   try {
//     // Build a safe query with parameters
//     const selectedColumns = columns ? columns.join(", ") : "*";
//     let query = `SELECT ${selectedColumns} FROM ${table}`;
//     const params = [];

//     if (where) {
//       query += ` WHERE ${where}`;
//     }

//     query += ` LIMIT $1`;
//     params.push(limit);

//     const result = await client.query(query, params);

//     return {
//       content: [
//         {
//           type: "text",
//           text: `Query results from ${table}:\n${JSON.stringify(
//             result.rows,
//             null,
//             2
//           )}`,
//         },
//       ],
//     };
//   } catch (error) {
//     return {
//       content: [
//         { type: "text", text: `Error querying data: ${error.message}` },
//       ],
//     };
//   }
// });

// const transport = new StdioServerTransport();

// // Handle cleanup on exit
// process.on("SIGINT", async () => {
//   console.log("Closing database connection...");
//   await client.end();
//   process.exit(0);
// });

// await server.connect(transport);

// console.log("PostgreSQL MCP Server started");
