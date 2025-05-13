import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";

// Check if PostgreSQL connection parameters are set in environment variables
const validateEnvVariables = () => {
  const requiredVars = [
    "POSTGRES_CONNECTION_STRING", 
    // Alternative individual parameters if no connection string
    // "POSTGRES_HOST", 
    // "POSTGRES_PORT", 
    // "POSTGRES_DATABASE", 
    // "POSTGRES_USER", 
    // "POSTGRES_PASSWORD"
  ];

  const missingVars = requiredVars.filter(
    varName => !process.env[varName]
  );

  if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(", ")}`);
    console.error("Set these in your Claude Desktop configuration");
    return false;
  }
  return true;
}

// Create PostgreSQL client with connection from environment variables
const createClient = async () => {
  try {
    // Prefer connection string if available
    if (process.env.POSTGRES_CONNECTION_STRING) {
      return new pg.Client({
        connectionString: process.env.POSTGRES_CONNECTION_STRING
      });
    } else {
      // Fall back to individual parameters
      return new pg.Client({
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT || "5432"),
        database: process.env.POSTGRES_DATABASE,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD
      });
    }
  } catch (error) {
    console.error("Error creating PostgreSQL client:", error);
    throw new Error("Failed to create PostgreSQL client");
  }
};

// Helper function to execute PostgreSQL queries safely
const executeQuery = async (query, params = []) => {
  validateEnvVariables();
  const client = await createClient();
  
  try {
    await client.connect();
    const result = await client.query(query, params);
    return result;
  } catch (error) {
    console.error("Query execution error:", error);
    throw error;
  } finally {
    await client.end();
  }
};

// Format query results as a readable string table
const formatResults = (results) => {
  if (!results || !results.rows || results.rows.length === 0) {
    return "Query returned no results.";
  }

  // Format column names
  const columns = results.fields.map(field => field.name);
  const columnWidths = columns.map((col) => col.length);
  
  // Calculate column widths based on actual data
  results.rows.forEach(row => {
    columns.forEach((col, i) => {
      const cellValue = String(row[col] === null ? 'NULL' : row[col]);
      columnWidths[i] = Math.max(columnWidths[i], cellValue.length);
    });
  });
  
  // Build the header row
  const headerRow = columns.map((col, i) => col.padEnd(columnWidths[i])).join(" | ");
  const separatorRow = columns.map((_, i) => "-".repeat(columnWidths[i])).join("-+-");
  
  // Build data rows
  const dataRows = results.rows.map(row => {
    return columns
      .map((col, i) => {
        const value = row[col] === null ? 'NULL' : row[col];
        return String(value).padEnd(columnWidths[i]);
      })
      .join(" | ");
  });
  
  // Combine all parts with row count summary
  return [
    headerRow,
    separatorRow,
    ...dataRows,
    `\n(${results.rowCount} ${results.rowCount === 1 ? 'row' : 'rows'})`
  ].join("\n");
};

// Create MCP server
const server = new McpServer({
  name: "PostgreSQL",
  version: "1.0.0",
  description: "MCP server for interacting with PostgreSQL databases"
});

// Tool: Execute a SQL query (read-only SELECT queries)
server.tool(
  "querySQL",
  { 
    query: z.string().min(1).describe("SQL SELECT query to execute"),
    params: z.array(z.any()).optional().describe("Optional array of parameters for parameterized queries")
  },
  async ({ query, params = [] }) => {
    try {
      // Safety check to ensure only SELECT queries are allowed
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery.startsWith("select") && !trimmedQuery.startsWith("with") && !trimmedQuery.startsWith("explain")) {
        throw new Error("This tool only supports SELECT queries. Use executeSQL for data modification operations.");
      }
      
      const result = await executeQuery(query, params);
      return {
        content: [{ 
          type: "text", 
          text: formatResults(result)
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error executing query: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Execute SQL for data modification (INSERT, UPDATE, DELETE, etc.)
server.tool(
  "executeSQL",
  { 
    query: z.string().min(1).describe("SQL query to execute (INSERT, UPDATE, DELETE, etc.)"),
    params: z.array(z.any()).optional().describe("Optional array of parameters for parameterized queries")
  },
  async ({ query, params = [] }) => {
    try {
      const trimmedQuery = query.trim().toLowerCase();
      
      // Prevent dropping tables/databases or other potentially destructive operations
      if (trimmedQuery.includes("drop table") || 
          trimmedQuery.includes("drop database") ||
          trimmedQuery.includes("truncate table")) {
        throw new Error("Destructive operations like DROP TABLE are not allowed for safety reasons.");
      }
      
      const result = await executeQuery(query, params);
      
      let responseText = "";
      if (result.command) {
        if (result.command === "INSERT" || result.command === "UPDATE" || result.command === "DELETE") {
          responseText = `${result.command} operation successful. ${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'} affected.`;
        } else if (result.command === "CREATE" || result.command === "ALTER") {
          responseText = `${result.command} operation successful.`;
        } else {
          responseText = `Operation successful. Command: ${result.command}, Rows affected: ${result.rowCount}`;
        }
      } else {
        responseText = "Operation completed successfully.";
      }
      
      return {
        content: [{ 
          type: "text", 
          text: responseText
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error executing query: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Resource: Get table schema information
server.resource(
  "table-schema",
  new ResourceTemplate("schema://{table}", { list: undefined }),
  async (uri, { table }) => {
    try {
      // Query to get column information
      const columnQuery = `
        SELECT 
          column_name, 
          data_type, 
          is_nullable, 
          column_default
        FROM 
          information_schema.columns
        WHERE 
          table_name = $1
        ORDER BY 
          ordinal_position;
      `;
      
      // Query to get index information
      const indexQuery = `
        SELECT
          indexname,
          indexdef
        FROM
          pg_indexes
        WHERE
          tablename = $1;
      `;
      
      // Query to get constraints
      const constraintQuery = `
        SELECT
          conname as constraint_name,
          contype as constraint_type,
          pg_get_constraintdef(c.oid) as constraint_definition
        FROM
          pg_constraint c
        JOIN
          pg_class t ON c.conrelid = t.oid
        WHERE
          t.relname = $1;
      `;
      
      // Execute all queries
      const columns = await executeQuery(columnQuery, [table]);
      const indexes = await executeQuery(indexQuery, [table]);
      const constraints = await executeQuery(constraintQuery, [table]);
      
      // Format constraint type for readability
      const formatConstraintType = (type) => {
        switch(type) {
          case 'p': return 'PRIMARY KEY';
          case 'u': return 'UNIQUE';
          case 'f': return 'FOREIGN KEY';
          case 'c': return 'CHECK';
          default: return type;
        }
      };
      
      // Compose the schema information text
      const columnsText = columns.rows.length > 0 
        ? "COLUMNS:\n" + columns.rows.map(col => 
            `- ${col.column_name} (${col.data_type})` + 
            `${col.is_nullable === 'YES' ? ', nullable' : ''}` +
            `${col.column_default ? `, default: ${col.column_default}` : ''}`
          ).join("\n")
        : "No columns found for this table.";
      
      const indexesText = indexes.rows.length > 0
        ? "\n\nINDEXES:\n" + indexes.rows.map(idx => 
            `- ${idx.indexname}: ${idx.indexdef}`
          ).join("\n")
        : "\n\nNo indexes found for this table.";
      
      const constraintsText = constraints.rows.length > 0
        ? "\n\nCONSTRAINTS:\n" + constraints.rows.map(con => 
            `- ${con.constraint_name} (${formatConstraintType(con.constraint_type)}): ${con.constraint_definition}`
          ).join("\n")
        : "\n\nNo constraints found for this table.";
      
      return {
        contents: [{
          uri: uri.href,
          text: columnsText + indexesText + constraintsText
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: `Error retrieving schema for table ${table}: ${error.message}`
        }]
      };
    }
  }
);

// Tool: List all tables in the database
server.tool(
  "listTables",
  { 
    schemaPattern: z.string().optional().describe("Optional schema name pattern (supports SQL LIKE syntax)")
  },
  async ({ schemaPattern = "public" }) => {
    try {
      const query = `
        SELECT 
          table_schema,
          table_name, 
          (SELECT count(*) FROM information_schema.columns WHERE table_schema = t.table_schema AND table_name = t.table_name) as column_count
        FROM 
          information_schema.tables t
        WHERE 
          table_schema LIKE $1
          AND table_type = 'BASE TABLE'
        ORDER BY 
          table_schema, table_name;
      `;
      
      const result = await executeQuery(query, [schemaPattern]);
      
      if (result.rows.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No tables found in schema(s) matching '${schemaPattern}'.`
          }]
        };
      }
      
      // Group tables by schema
      const tablesBySchema = {};
      result.rows.forEach(row => {
        if (!tablesBySchema[row.table_schema]) {
          tablesBySchema[row.table_schema] = [];
        }
        tablesBySchema[row.table_schema].push({
          name: row.table_name,
          columns: row.column_count
        });
      });
      
      // Format the output
      let output = "AVAILABLE TABLES:\n\n";
      
      for (const schema in tablesBySchema) {
        output += `SCHEMA: ${schema}\n`;
        output += tablesBySchema[schema].map(table => 
          `- ${table.name} (${table.columns} columns)`
        ).join("\n");
        output += "\n\n";
      }
      
      output += `Total tables: ${result.rows.length}`;
      
      return {
        content: [{ 
          type: "text", 
          text: output
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error listing tables: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Get database information
server.tool(
  "getDatabaseInfo",
  {},
  async () => {
    try {
      // Query PostgreSQL version
      const versionQuery = "SELECT version();";
      const versionResult = await executeQuery(versionQuery);
      
      // Query database size
      const sizeQuery = "SELECT pg_size_pretty(pg_database_size(current_database())) as db_size;";
      const sizeResult = await executeQuery(sizeQuery);
      
      // Query connection info
      const connQuery = "SELECT current_database() as db_name, current_user as username;";
      const connResult = await executeQuery(connQuery);
      
      // Query schema information
      const schemaQuery = `
        SELECT 
          schema_name,
          COUNT(table_name) as table_count
        FROM 
          information_schema.tables
        GROUP BY 
          schema_name
        ORDER BY 
          schema_name;
      `;
      const schemaResult = await executeQuery(schemaQuery);
      
      // Format the output
      let output = "DATABASE INFORMATION:\n\n";
      
      output += "GENERAL INFO:\n";
      if (versionResult.rows.length > 0) {
        output += `- PostgreSQL version: ${versionResult.rows[0].version.split(",")[0]}\n`;
      }
      if (sizeResult.rows.length > 0) {
        output += `- Database size: ${sizeResult.rows[0].db_size}\n`;
      }
      if (connResult.rows.length > 0) {
        output += `- Current database: ${connResult.rows[0].db_name}\n`;
        output += `- Connected as: ${connResult.rows[0].username}\n`;
      }
      
      output += "\nSCHEMAS:\n";
      if (schemaResult.rows.length > 0) {
        schemaResult.rows.forEach(row => {
          output += `- ${row.schema_name}: ${row.table_count} tables\n`;
        });
      } else {
        output += "No schemas found.\n";
      }
      
      return {
        content: [{ 
          type: "text", 
          text: output
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error retrieving database information: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Get table sample data
server.tool(
  "sampleTable",
  { 
    tableName: z.string().min(1).describe("Name of the table to sample"),
    limit: z.number().min(1).max(1000).default(10).describe("Number of rows to sample (max 1000)"),
    orderBy: z.string().optional().describe("Optional column name to order by")
  },
  async ({ tableName, limit, orderBy }) => {
    try {
      // Validate table name to prevent SQL injection
      // Note: We can't use parameterized queries for table names in PostgreSQL
      // So we'll do basic validation to ensure it's a valid identifier
      if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        throw new Error("Invalid table name. Must contain only letters, numbers, and underscores.");
      }
      
      let query = `SELECT * FROM "${tableName}"`;
      
      // Add ORDER BY if specified
      if (orderBy) {
        // Validate order by column
        if (!/^[a-zA-Z0-9_]+$/.test(orderBy)) {
          throw new Error("Invalid column name. Must contain only letters, numbers, and underscores.");
        }
        query += ` ORDER BY "${orderBy}"`;
      }
      
      // Add LIMIT
      query += ` LIMIT $1`;
      
      const result = await executeQuery(query, [limit]);
      
      return {
        content: [{ 
          type: "text", 
          text: formatResults(result)
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error sampling table: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Create a prompt for exploring the database
server.prompt(
  "explore-database",
  {},
  () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `I'd like to explore my PostgreSQL database. Please help me understand:
1. What tables are available?
2. What's the schema of those tables?
3. How to query data effectively?

Once we have that information, I may need help writing some queries to analyze my data.`
      }
    }]
  })
);

// Create a prompt for writing SQL queries
server.prompt(
  "write-sql-query",
  { 
    objective: z.string().describe("The data analysis objective or question to answer")
  },
  ({ objective }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `I need to write a SQL query for my PostgreSQL database to achieve the following objective:
${objective}

Please help me write a query that:
1. Is efficient and well-optimized
2. Includes appropriate JOINs if needed
3. Has clear column aliases for readability
4. Uses appropriate filtering and sorting

Before writing the query, you may need to explore the database schema to understand the available tables and their relationships.`
      }
    }]
  })
);

// Start the server
try {
  if (!validateEnvVariables()) {
    console.error("Server initialization halted due to missing environment variables");
  } else {
    console.log("Starting PostgreSQL MCP server...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("PostgreSQL MCP server started and connected");
  }
} catch (error) {
  console.error("Failed to start PostgreSQL MCP server:", error);
}