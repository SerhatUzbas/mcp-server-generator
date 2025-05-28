#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from 'pg';
const { Pool } = pkg;

// PostgreSQL connection pool
let pool = null;

// Initialize database connection
function initializePool() {
  if (!pool) {
    pool = new Pool({
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST || 'localhost',
      database: process.env.POSTGRES_DATABASE,
      password: process.env.POSTGRES_PASSWORD,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

// Create MCP server
const server = new McpServer({
  name: "postgresql-server",
  version: "1.0.0",
  description: "PostgreSQL database integration server providing query execution and schema introspection"
});

// Database schema resource
server.resource(
  "database-schema",
  "postgresql://schema",
  async (uri) => {
    try {
      const pool = initializePool();
      const client = await pool.connect();
      
      try {
        const result = await client.query(`
          SELECT 
            table_name,
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position
        `);
        
        const schema = {};
        result.rows.forEach(row => {
          if (!schema[row.table_name]) {
            schema[row.table_name] = [];
          }
          schema[row.table_name].push({
            name: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === 'YES',
            default: row.column_default
          });
        });
        
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(schema, null, 2)
          }]
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `Error retrieving schema: ${error.message}`
        }]
      };
    }
  }
);

// Table list resource
server.resource(
  "tables",
  "postgresql://tables",
  async (uri) => {
    try {
      const pool = initializePool();
      const client = await pool.connect();
      
      try {
        const result = await client.query(`
          SELECT 
            table_name,
            table_type
          FROM information_schema.tables
          WHERE table_schema = 'public'
          ORDER BY table_name
        `);
        
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result.rows, null, 2)
          }]
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `Error retrieving tables: ${error.message}`
        }]
      };
    }
  }
);

// Execute SQL query tool
server.tool(
  "execute-query",
  {
    query: z.string().describe("SQL query to execute"),
    params: z.array(z.any()).optional().describe("Optional parameters for parameterized queries")
  },
  async ({ query, params = [] }) => {
    try {
      // Validate environment variables
      if (!process.env.POSTGRES_USER || !process.env.POSTGRES_DATABASE || !process.env.POSTGRES_PASSWORD) {
        return {
          content: [{
            type: "text",
            text: "Error: PostgreSQL credentials not configured. Please set POSTGRES_USER, POSTGRES_DATABASE, and POSTGRES_PASSWORD environment variables."
          }],
          isError: true
        };
      }
      
      const pool = initializePool();
      const client = await pool.connect();
      
      try {
        const result = await client.query(query, params);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              rows: result.rows,
              rowCount: result.rowCount,
              command: result.command,
              fields: result.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID }))
            }, null, 2)
          }]
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `SQL Error: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Get table info tool
server.tool(
  "describe-table",
  {
    tableName: z.string().describe("Name of the table to describe")
  },
  async ({ tableName }) => {
    try {
      const pool = initializePool();
      const client = await pool.connect();
      
      try {
        const result = await client.query(`
          SELECT 
            column_name,
            data_type,
            character_maximum_length,
            is_nullable,
            column_default,
            ordinal_position
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [tableName]);
        
        if (result.rows.length === 0) {
          return {
            content: [{
              type: "text",
              text: `Table '${tableName}' not found.`
            }],
            isError: true
          };
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result.rows, null, 2)
          }]
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error describing table: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Test connection tool
server.tool(
  "test-connection",
  {},
  async () => {
    try {
      if (!process.env.POSTGRES_USER || !process.env.POSTGRES_DATABASE || !process.env.POSTGRES_PASSWORD) {
        return {
          content: [{
            type: "text",
            text: "Error: PostgreSQL credentials not configured. Please set POSTGRES_USER, POSTGRES_DATABASE, and POSTGRES_PASSWORD environment variables."
          }],
          isError: true
        };
      }
      
      const pool = initializePool();
      const client = await pool.connect();
      
      try {
        const result = await client.query('SELECT version()');
        return {
          content: [{
            type: "text",
            text: `Connection successful! PostgreSQL version: ${result.rows[0].version}`
          }]
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Connection failed: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Database query prompt
server.prompt(
  "query-database",
  {
    question: z.string().describe("Natural language question about the database")
  },
  ({ question }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You are a PostgreSQL expert. Help me write a SQL query to answer this question: ${question}\n\nFirst, examine the database schema using the database-schema resource, then provide a well-formatted SQL query with explanation.`
      }
    }]
  })
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
