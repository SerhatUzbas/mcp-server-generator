import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BigQuery } from '@google-cloud/bigquery';
import { z } from 'zod';

// Create a new MCP server
const server = new McpServer({
  name: "BigQuery Server",
  version: "1.0.0",
  description: "MCP server for handling Google BigQuery operations"
});

// Helper function to initialize BigQuery client
const getBigQueryClient = () => {
  // Check for required environment variables
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable must be set');
  }
  
  try {
    // Create and return a BigQuery client
    return new BigQuery();
  } catch (error) {
    console.error('Error initializing BigQuery client:', error);
    throw new Error(`Failed to initialize BigQuery client: ${error.message}`);
  }
};

// Tool: Execute a SQL query
server.tool(
  "executeQuery",
  {
    query: z.string().min(1, "SQL query cannot be empty"),
    projectId: z.string().optional(),
    maxResults: z.number().int().positive().optional().default(1000),
    useLegacySql: z.boolean().optional().default(false)
  },
  async ({ query, projectId, maxResults, useLegacySql }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {
        query,
        useLegacySql,
        maximumByteBilled: process.env.BQ_MAX_BYTES_BILLED ? 
          BigInt(process.env.BQ_MAX_BYTES_BILLED) : undefined,
      };
      
      if (projectId) {
        options.projectId = projectId;
      }
      
      const [job] = await bigquery.createQueryJob(options);
      const [rows] = await job.getQueryResults({ maxResults });
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            rows,
            totalRows: rows.length,
            jobId: job.id,
            statistics: job.metadata.statistics
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error executing query: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: List datasets in a project
server.tool(
  "listDatasets",
  {
    projectId: z.string().optional()
  },
  async ({ projectId }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {};
      if (projectId) {
        options.projectId = projectId;
      }
      
      const [datasets] = await bigquery.getDatasets(options);
      
      const datasetInfo = datasets.map(dataset => ({
        id: dataset.id,
        name: dataset.name,
        location: dataset.metadata.location,
        creationTime: dataset.metadata.creationTime,
        lastModifiedTime: dataset.metadata.lastModifiedTime
      }));
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            datasets: datasetInfo,
            count: datasetInfo.length
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error listing datasets: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: List tables in a dataset
server.tool(
  "listTables",
  {
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    projectId: z.string().optional()
  },
  async ({ datasetId, projectId }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {};
      if (projectId) {
        options.projectId = projectId;
      }
      
      const dataset = bigquery.dataset(datasetId, options);
      const [tables] = await dataset.getTables();
      
      const tableInfo = tables.map(table => ({
        id: table.id,
        name: table.name,
        type: table.metadata.type,
        creationTime: table.metadata.creationTime,
        lastModifiedTime: table.metadata.lastModifiedTime,
        numRows: table.metadata.numRows,
        numBytes: table.metadata.numBytes
      }));
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            tables: tableInfo,
            count: tableInfo.length
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error listing tables: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Get table schema
server.tool(
  "getTableSchema",
  {
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    tableId: z.string().min(1, "Table ID cannot be empty"),
    projectId: z.string().optional()
  },
  async ({ datasetId, tableId, projectId }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {};
      if (projectId) {
        options.projectId = projectId;
      }
      
      const dataset = bigquery.dataset(datasetId, options);
      const table = dataset.table(tableId);
      const [metadata] = await table.getMetadata();
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            schema: metadata.schema,
            numRows: metadata.numRows,
            numBytes: metadata.numBytes,
            creationTime: metadata.creationTime,
            lastModifiedTime: metadata.lastModifiedTime,
            type: metadata.type,
            description: metadata.description
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error getting table schema: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Create a new dataset
server.tool(
  "createDataset",
  {
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    projectId: z.string().optional(),
    location: z.string().optional().default('US'),
    description: z.string().optional(),
    labels: z.record(z.string()).optional()
  },
  async ({ datasetId, projectId, location, description, labels }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {
        location,
      };
      
      if (description) {
        options.description = description;
      }
      
      if (labels) {
        options.labels = labels;
      }
      
      if (projectId) {
        options.projectId = projectId;
      }
      
      const [dataset] = await bigquery.createDataset(datasetId, options);
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            datasetId: dataset.id,
            name: dataset.name,
            location: dataset.metadata.location,
            creationTime: dataset.metadata.creationTime,
            description: dataset.metadata.description
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error creating dataset: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Export query results to a table
server.tool(
  "exportQueryToTable",
  {
    query: z.string().min(1, "SQL query cannot be empty"),
    destinationDatasetId: z.string().min(1, "Destination dataset ID cannot be empty"),
    destinationTableId: z.string().min(1, "Destination table ID cannot be empty"),
    projectId: z.string().optional(),
    writeDisposition: z.enum(["WRITE_TRUNCATE", "WRITE_APPEND", "WRITE_EMPTY"]).optional().default("WRITE_TRUNCATE"),
    createDisposition: z.enum(["CREATE_IF_NEEDED", "CREATE_NEVER"]).optional().default("CREATE_IF_NEEDED"),
    useLegacySql: z.boolean().optional().default(false)
  },
  async ({ query, destinationDatasetId, destinationTableId, projectId, writeDisposition, createDisposition, useLegacySql }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {
        query,
        useLegacySql,
        destination: bigquery.dataset(destinationDatasetId).table(destinationTableId),
        writeDisposition,
        createDisposition,
        maximumByteBilled: process.env.BQ_MAX_BYTES_BILLED ? 
          BigInt(process.env.BQ_MAX_BYTES_BILLED) : undefined,
      };
      
      if (projectId) {
        options.projectId = projectId;
      }
      
      const [job] = await bigquery.createQueryJob(options);
      await job.promise();
      
      const metadata = job.metadata;
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            status: metadata.status,
            jobId: job.id,
            statistics: metadata.statistics,
            destinationTable: {
              dataset: destinationDatasetId,
              table: destinationTableId
            }
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error exporting query to table: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Delete a table
server.tool(
  "deleteTable",
  {
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    tableId: z.string().min(1, "Table ID cannot be empty"),
    projectId: z.string().optional()
  },
  async ({ datasetId, tableId, projectId }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {};
      if (projectId) {
        options.projectId = projectId;
      }
      
      const dataset = bigquery.dataset(datasetId, options);
      const table = dataset.table(tableId);
      const [exists] = await table.exists();
      
      if (!exists) {
        return {
          content: [{ type: "text", text: `Table ${datasetId}.${tableId} does not exist` }],
          isError: true
        };
      }
      
      await table.delete();
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            success: true,
            message: `Table ${datasetId}.${tableId} successfully deleted`
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error deleting table: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Get job information
server.tool(
  "getJobInfo",
  {
    jobId: z.string().min(1, "Job ID cannot be empty"),
    projectId: z.string().optional()
  },
  async ({ jobId, projectId }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {};
      if (projectId) {
        options.projectId = projectId;
      }
      
      const job = bigquery.job(jobId, options);
      const [metadata] = await job.getMetadata();
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            id: job.id,
            user_email: metadata.user_email,
            status: metadata.status,
            statistics: metadata.statistics,
            configuration: metadata.configuration,
            jobReference: metadata.jobReference,
            selfLink: metadata.selfLink
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error getting job information: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Create a table with schema
server.tool(
  "createTable",
  {
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    tableId: z.string().min(1, "Table ID cannot be empty"),
    schema: z.array(z.object({
      name: z.string().min(1, "Field name cannot be empty"),
      type: z.enum(["STRING", "INTEGER", "FLOAT", "BOOLEAN", "TIMESTAMP", "DATE", "TIME", "DATETIME", "RECORD", "BYTES", "NUMERIC", "BIGNUMERIC", "JSON"]),
      mode: z.enum(["REQUIRED", "NULLABLE", "REPEATED"]).optional().default("NULLABLE"),
      description: z.string().optional()
    })).min(1, "Schema must have at least one field"),
    projectId: z.string().optional(),
    description: z.string().optional(),
    timePartitioning: z.object({
      type: z.enum(["DAY", "HOUR", "MONTH", "YEAR"]),
      field: z.string().optional(),
      expirationMs: z.number().optional()
    }).optional(),
    clustering: z.object({
      fields: z.array(z.string()).min(1).max(4)
    }).optional()
  },
  async ({ datasetId, tableId, schema, projectId, description, timePartitioning, clustering }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {
        schema,
      };
      
      if (projectId) {
        options.projectId = projectId;
      }
      
      if (description) {
        options.description = description;
      }
      
      if (timePartitioning) {
        options.timePartitioning = timePartitioning;
      }
      
      if (clustering) {
        options.clustering = clustering;
      }
      
      const dataset = bigquery.dataset(datasetId);
      const [table] = await dataset.createTable(tableId, options);
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            tableId: table.id,
            datasetId: datasetId,
            metadata: {
              id: table.id,
              type: table.metadata.type,
              creationTime: table.metadata.creationTime,
              description: table.metadata.description,
              schema: table.metadata.schema
            }
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error creating table: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Load data from JSON or CSV
server.tool(
  "loadData",
  {
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    tableId: z.string().min(1, "Table ID cannot be empty"),
    sourceFormat: z.enum(["CSV", "JSON", "AVRO", "PARQUET", "ORC"]),
    sourceUri: z.string().url("Source URI must be a valid URL"),
    projectId: z.string().optional(),
    writeDisposition: z.enum(["WRITE_TRUNCATE", "WRITE_APPEND", "WRITE_EMPTY"]).optional().default("WRITE_APPEND"),
    createDisposition: z.enum(["CREATE_IF_NEEDED", "CREATE_NEVER"]).optional().default("CREATE_IF_NEEDED"),
    schema: z.array(z.object({
      name: z.string().min(1, "Field name cannot be empty"),
      type: z.enum(["STRING", "INTEGER", "FLOAT", "BOOLEAN", "TIMESTAMP", "DATE", "TIME", "DATETIME", "RECORD", "BYTES", "NUMERIC", "BIGNUMERIC", "JSON"]),
      mode: z.enum(["REQUIRED", "NULLABLE", "REPEATED"]).optional().default("NULLABLE"),
      description: z.string().optional()
    })).optional(),
    skipLeadingRows: z.number().int().nonnegative().optional(),
    autodetect: z.boolean().optional().default(false)
  },
  async ({ datasetId, tableId, sourceFormat, sourceUri, projectId, writeDisposition, createDisposition, schema, skipLeadingRows, autodetect }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {
        sourceFormat,
        writeDisposition,
        createDisposition,
        autodetect
      };
      
      if (projectId) {
        options.projectId = projectId;
      }
      
      if (schema) {
        options.schema = schema;
      }
      
      if (skipLeadingRows && sourceFormat === 'CSV') {
        options.skipLeadingRows = skipLeadingRows;
      }
      
      const dataset = bigquery.dataset(datasetId);
      const table = dataset.table(tableId);
      
      const [job] = await table.load(sourceUri, options);
      await job.promise();
      
      const metadata = job.metadata;
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            status: metadata.status,
            jobId: job.id,
            statistics: metadata.statistics,
            destinationTable: {
              dataset: datasetId,
              table: tableId
            }
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error loading data: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Run an analysis query and return results as formatted text
server.tool(
  "analyzeData",
  {
    query: z.string().min(1, "SQL query cannot be empty"),
    projectId: z.string().optional(),
    format: z.enum(["json", "table", "summary"]).optional().default("summary"),
    maxResults: z.number().int().positive().optional().default(1000),
    useLegacySql: z.boolean().optional().default(false)
  },
  async ({ query, projectId, format, maxResults, useLegacySql }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {
        query,
        useLegacySql,
        maximumByteBilled: process.env.BQ_MAX_BYTES_BILLED ? 
          BigInt(process.env.BQ_MAX_BYTES_BILLED) : undefined,
      };
      
      if (projectId) {
        options.projectId = projectId;
      }
      
      const [job] = await bigquery.createQueryJob(options);
      const [rows] = await job.getQueryResults({ maxResults });
      
      if (rows.length === 0) {
        return {
          content: [{ type: "text", text: "Query returned no results" }]
        };
      }
      
      let resultText;
      
      if (format === "json") {
        resultText = JSON.stringify(rows, null, 2);
      } else if (format === "table") {
        // Create a tabular representation
        const headers = Object.keys(rows[0]);
        const separator = headers.map(h => '-'.repeat(h.length)).join(' | ');
        
        const headerRow = headers.join(' | ');
        const dataRows = rows.map(row => {
          return headers.map(header => {
            const value = row[header];
            return value === null ? 'NULL' : String(value);
          }).join(' | ');
        }).join('\n');
        
        resultText = `${headerRow}\n${separator}\n${dataRows}`;
      } else { // summary
        // Create a summary of the data
        const totalRows = rows.length;
        const columns = Object.keys(rows[0]);
        
        const columnStats = columns.map(col => {
          const values = rows.map(row => row[col]);
          const nonNullValues = values.filter(v => v !== null);
          
          let summary = {
            column: col,
            nonNullCount: nonNullValues.length,
            nullCount: totalRows - nonNullValues.length
          };
          
          // Add type-specific statistics
          if (nonNullValues.length > 0) {
            const firstNonNull = nonNullValues[0];
            
            if (typeof firstNonNull === 'number') {
              const numValues = nonNullValues.map(v => Number(v));
              summary.min = Math.min(...numValues);
              summary.max = Math.max(...numValues);
              summary.avg = numValues.reduce((a, b) => a + b, 0) / numValues.length;
              summary.type = 'numeric';
            } else if (typeof firstNonNull === 'string') {
              const stringLengths = nonNullValues.map(v => String(v).length);
              summary.minLength = Math.min(...stringLengths);
              summary.maxLength = Math.max(...stringLengths);
              summary.uniqueValues = new Set(nonNullValues).size;
              summary.type = 'string';
            } else if (firstNonNull instanceof Date) {
              const dates = nonNullValues.filter(v => v instanceof Date).map(v => v.getTime());
              if (dates.length > 0) {
                summary.min = new Date(Math.min(...dates)).toISOString();
                summary.max = new Date(Math.max(...dates)).toISOString();
                summary.type = 'date';
              }
            } else {
              summary.type = typeof firstNonNull;
            }
          }
          
          return summary;
        });
        
        resultText = `Query returned ${totalRows} rows with ${columns.length} columns.\n\n`;
        resultText += 'Column Statistics:\n' + JSON.stringify(columnStats, null, 2);
      }
      
      return {
        content: [{ type: "text", text: resultText }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error analyzing data: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Resources for browsing datasets and tables
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

// Resource: List all datasets
server.resource(
  "datasets",
  "bigquery://datasets",
  async (uri) => {
    try {
      const bigquery = getBigQueryClient();
      const [datasets] = await bigquery.getDatasets();
      
      const datasetInfo = datasets.map(dataset => ({
        id: dataset.id,
        name: dataset.name,
        location: dataset.metadata.location,
        creationTime: new Date(Number(dataset.metadata.creationTime)).toISOString(),
        lastModifiedTime: new Date(Number(dataset.metadata.lastModifiedTime)).toISOString()
      }));
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(datasetInfo, null, 2)
        }]
      };
    } catch (error) {
      console.error('Error listing datasets in resource:', error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error listing datasets: ${error.message}`
        }]
      };
    }
  }
);

// Resource: List all tables in a dataset
server.resource(
  "tables",
  new ResourceTemplate("bigquery://{datasetId}/tables", { list: "bigquery://datasets" }),
  async (uri, { datasetId }) => {
    try {
      const bigquery = getBigQueryClient();
      const dataset = bigquery.dataset(datasetId);
      
      // Check if dataset exists
      const [exists] = await dataset.exists();
      if (!exists) {
        return {
          contents: [{
            uri: uri.href,
            text: `Dataset '${datasetId}' does not exist`
          }]
        };
      }
      
      const [tables] = await dataset.getTables();
      
      const tableInfo = tables.map(table => ({
        id: table.id,
        name: table.name,
        type: table.metadata.type,
        creationTime: new Date(Number(table.metadata.creationTime)).toISOString(),
        lastModifiedTime: new Date(Number(table.metadata.lastModifiedTime)).toISOString(),
        numRows: table.metadata.numRows,
        numBytes: table.metadata.numBytes
      }));
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(tableInfo, null, 2)
        }]
      };
    } catch (error) {
      console.error('Error listing tables in resource:', error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error listing tables in dataset '${datasetId}': ${error.message}`
        }]
      };
    }
  }
);

// Resource: Get table schema and sample data
server.resource(
  "table",
  new ResourceTemplate("bigquery://{datasetId}/table/{tableId}", { list: "bigquery://{datasetId}/tables" }),
  async (uri, { datasetId, tableId }) => {
    try {
      const bigquery = getBigQueryClient();
      const dataset = bigquery.dataset(datasetId);
      const table = dataset.table(tableId);
      
      // Check if table exists
      const [exists] = await table.exists();
      if (!exists) {
        return {
          contents: [{
            uri: uri.href,
            text: `Table '${datasetId}.${tableId}' does not exist`
          }]
        };
      }
      
      // Get table metadata
      const [metadata] = await table.getMetadata();
      
      // Get sample data (first 10 rows)
      const query = `SELECT * FROM \`${datasetId}.${tableId}\` LIMIT 10`;
      const [job] = await bigquery.createQueryJob({ query });
      const [rows] = await job.getQueryResults();
      
      // Combine schema and sample data
      const tableInfo = {
        metadata: {
          schema: metadata.schema,
          numRows: metadata.numRows,
          numBytes: metadata.numBytes,
          description: metadata.description,
          type: metadata.type,
          creationTime: new Date(Number(metadata.creationTime)).toISOString(),
          lastModifiedTime: new Date(Number(metadata.lastModifiedTime)).toISOString()
        },
        sampleData: rows
      };
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(tableInfo, null, 2)
        }]
      };
    } catch (error) {
      console.error('Error getting table info in resource:', error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error getting table '${datasetId}.${tableId}' information: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Copy table data
server.tool(
  "copyTable",
  {
    sourceDatasetId: z.string().min(1, "Source dataset ID cannot be empty"),
    sourceTableId: z.string().min(1, "Source table ID cannot be empty"),
    destinationDatasetId: z.string().min(1, "Destination dataset ID cannot be empty"),
    destinationTableId: z.string().min(1, "Destination table ID cannot be empty"),
    projectId: z.string().optional(),
    writeDisposition: z.enum(["WRITE_TRUNCATE", "WRITE_APPEND", "WRITE_EMPTY"]).optional().default("WRITE_TRUNCATE"),
    createDisposition: z.enum(["CREATE_IF_NEEDED", "CREATE_NEVER"]).optional().default("CREATE_IF_NEEDED")
  },
  async ({ sourceDatasetId, sourceTableId, destinationDatasetId, destinationTableId, projectId, writeDisposition, createDisposition }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {
        writeDisposition,
        createDisposition
      };
      
      if (projectId) {
        options.projectId = projectId;
      }
      
      const sourceTable = bigquery.dataset(sourceDatasetId).table(sourceTableId);
      const destinationTable = bigquery.dataset(destinationDatasetId).table(destinationTableId);
      
      const [job] = await sourceTable.copy(destinationTable, options);
      await job.promise();
      
      const metadata = job.metadata;
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            status: metadata.status,
            jobId: job.id,
            statistics: metadata.statistics,
            sourceTable: `${sourceDatasetId}.${sourceTableId}`,
            destinationTable: `${destinationDatasetId}.${destinationTableId}`
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error copying table: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Export table to Google Cloud Storage
server.tool(
  "exportTableToGCS",
  {
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    tableId: z.string().min(1, "Table ID cannot be empty"),
    destinationUri: z.string().url("Destination URI must be a valid URL").refine(
      url => url.startsWith('gs://'), 
      { message: "Destination URI must be a Google Cloud Storage URL (gs://...)" }
    ),
    format: z.enum(["CSV", "JSON", "AVRO", "PARQUET"]).optional().default("CSV"),
    projectId: z.string().optional(),
    compression: z.enum(["GZIP", "DEFLATE", "SNAPPY", "NONE"]).optional(),
    fieldDelimiter: z.string().max(1).optional(),
    printHeader: z.boolean().optional().default(true)
  },
  async ({ datasetId, tableId, destinationUri, format, projectId, compression, fieldDelimiter, printHeader }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const options = {
        format,
        compression
      };
      
      if (projectId) {
        options.projectId = projectId;
      }
      
      if (format === 'CSV') {
        if (fieldDelimiter) {
          options.fieldDelimiter = fieldDelimiter;
        }
        options.printHeader = printHeader;
      }
      
      const dataset = bigquery.dataset(datasetId);
      const table = dataset.table(tableId);
      
      const [job] = await table.extract(destinationUri, options);
      await job.promise();
      
      const metadata = job.metadata;
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            status: metadata.status,
            jobId: job.id,
            statistics: metadata.statistics,
            sourceTable: `${datasetId}.${tableId}`,
            destinationUri,
            format
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error exporting table to GCS: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Run a scheduled query
server.tool(
  "createScheduledQuery",
  {
    query: z.string().min(1, "SQL query cannot be empty"),
    displayName: z.string().min(1, "Display name cannot be empty"),
    schedule: z.string().min(1, "Schedule cannot be empty").refine(
      sched => /^(everyday|every day|daily|weekly|monthly|\*\/\d+ \* \* \* \*|\d+ \d+ \* \* \*)$/i.test(sched),
      { message: "Schedule must be a valid cron expression or 'daily', 'weekly', 'monthly'" }
    ),
    destinationDatasetId: z.string().min(1, "Destination dataset ID cannot be empty"),
    destinationTableId: z.string().min(1, "Destination table ID cannot be empty"),
    projectId: z.string().optional(),
    writeDisposition: z.enum(["WRITE_TRUNCATE", "WRITE_APPEND", "WRITE_EMPTY"]).optional().default("WRITE_TRUNCATE"),
    createDisposition: z.enum(["CREATE_IF_NEEDED", "CREATE_NEVER"]).optional().default("CREATE_IF_NEEDED"),
    description: z.string().optional()
  },
  async ({ query, displayName, schedule, destinationDatasetId, destinationTableId, projectId, writeDisposition, createDisposition, description }) => {
    try {
      const bigquery = getBigQueryClient();
      
      // Convert friendly schedule formats to cron expressions
      let cronSchedule = schedule;
      if (/^(everyday|every day|daily)$/i.test(schedule)) {
        cronSchedule = '0 0 * * *'; // Run at midnight every day
      } else if (/^weekly$/i.test(schedule)) {
        cronSchedule = '0 0 * * 0'; // Run at midnight every Sunday
      } else if (/^monthly$/i.test(schedule)) {
        cronSchedule = '0 0 1 * *'; // Run at midnight on the first day of every month
      }
      
      // Get destination table reference
      const destinationTable = {
        projectId: projectId || (await bigquery.getProjectId()),
        datasetId: destinationDatasetId,
        tableId: destinationTableId
      };
      
      const options = {
        displayName,
        query,
        schedule: cronSchedule,
        destinationTable,
        writeDisposition,
        createDisposition
      };
      
      if (description) {
        options.description = description;
      }
      
      // The scheduled queries API might need to be accessed differently
      // This is a simplified implementation
      const [response] = await bigquery.createQueryTransferJob(options);
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            name: response.name,
            displayName: response.displayName,
            schedule: response.schedule,
            state: response.state,
            destinationTable: `${destinationDatasetId}.${destinationTableId}`
          }, null, 2) 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error creating scheduled query: ${error.message}
          
Note: Creating scheduled queries requires additional permissions and might require the Data Transfer API to be enabled.` 
        }],
        isError: true
      };
    }
  }
);

// Tool: Generate a query based on a natural language description
server.tool(
  "generateQuery",
  {
    description: z.string().min(1, "Description cannot be empty"),
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    projectId: z.string().optional(),
    includeComments: z.boolean().optional().default(true)
  },
  async ({ description, datasetId, projectId, includeComments }) => {
    try {
      const bigquery = getBigQueryClient();
      
      // Get dataset information
      const dataset = bigquery.dataset(datasetId);
      const [tables] = await dataset.getTables();
      
      // We'll need to gather schema information for all tables
      const tableSchemas = {};
      
      for (const table of tables) {
        const [metadata] = await table.getMetadata();
        tableSchemas[table.id] = metadata.schema;
      }
      
      // Generate SQL query based on description and schema
      // In a real implementation, you would use a more sophisticated approach,
      // possibly integrating with Claude or other AI services to generate the query
      
      // For now, we'll simulate this with a simple approach
      const tableNames = Object.keys(tableSchemas);
      let generatedQuery;
      
      // Look for common patterns in the description
      if (description.match(/count|how many/i)) {
        // Count query
        const tableName = tableNames[0] || 'unknown_table';
        generatedQuery = `-- Count query based on: ${description}\nSELECT COUNT(*) AS count\nFROM \`${datasetId}.${tableName}\``;
        
        // Add filtering if the description mentions it
        if (description.match(/where|filter|condition/i)) {
          const possibleFields = tableSchemas[tableName]?.fields || [];
          if (possibleFields.length > 0) {
            const field = possibleFields[0].name;
            generatedQuery += `\nWHERE ${field} IS NOT NULL`;
          }
        }
      } else if (description.match(/average|avg|mean|sum|total/i)) {
        // Aggregation query
        const tableName = tableNames[0] || 'unknown_table';
        const possibleFields = tableSchemas[tableName]?.fields || [];
        const numericFields = possibleFields.filter(f => 
          ['INTEGER', 'FLOAT', 'NUMERIC', 'BIGNUMERIC'].includes(f.type)
        );
        
        if (numericFields.length > 0) {
          const field = numericFields[0].name;
          const operation = description.match(/sum|total/i) ? 'SUM' : 'AVG';
          generatedQuery = `-- Aggregation query based on: ${description}\nSELECT ${operation}(${field}) AS result\nFROM \`${datasetId}.${tableName}\``;
        } else {
          generatedQuery = `-- Could not generate an aggregation query because no numeric fields were found\n-- Tables: ${tableNames.join(', ')}\n-- Requested: ${description}`;
        }
      } else {
        // Basic select query
        const tableName = tableNames[0] || 'unknown_table';
        const possibleFields = tableSchemas[tableName]?.fields || [];
        const fieldNames = possibleFields.slice(0, 5).map(f => f.name).join(', ');
        
        generatedQuery = `-- Query based on: ${description}\nSELECT ${fieldNames || '*'}\nFROM \`${datasetId}.${tableName}\`\nLIMIT 1000`;
      }
      
      // Add schema comments if requested
      if (includeComments && Object.keys(tableSchemas).length > 0) {
        let schemaComments = '/*\nAvailable tables and schemas:\n\n';
        
        for (const [tableName, schema] of Object.entries(tableSchemas)) {
          schemaComments += `TABLE: ${tableName}\n`;
          if (schema.fields) {
            schema.fields.forEach(field => {
              schemaComments += `  - ${field.name}: ${field.type}${field.mode !== 'NULLABLE' ? ` (${field.mode})` : ''}\n`;
            });
          }
          schemaComments += '\n';
        }
        
        schemaComments += '*/\n\n';
        generatedQuery = schemaComments + generatedQuery;
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Generated SQL query for: "${description}"\n\n${generatedQuery}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error generating query: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Add prompts to help guide Claude's interactions with BigQuery



// Prompt: To help analyze BigQuery data
server.prompt(
  "analyze-bigquery-data",
  {
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    tableId: z.string().optional(),
    projectId: z.string().optional(),
    analysisGoal: z.string().min(1, "Analysis goal cannot be empty"),
  },
  async ({ datasetId, tableId, projectId, analysisGoal }) => {
    try {
      const bigquery = getBigQueryClient();
      
      // Generate context about available datasets and tables
      let contextInfo = `I need to analyze BigQuery data with the following goal: ${analysisGoal}\n\n`;
      
      // If a specific table is requested, get its schema
      if (tableId) {
        const dataset = bigquery.dataset(datasetId);
        const table = dataset.table(tableId);
        
        // Check if table exists
        const [exists] = await table.exists();
        if (exists) {
          const [metadata] = await table.getMetadata();
          
          contextInfo += `Table information for ${datasetId}.${tableId}:\n`;
          contextInfo += `- Row count: ${metadata.numRows || 'unknown'}\n`;
          contextInfo += `- Size: ${metadata.numBytes ? (Number(metadata.numBytes) / 1024 / 1024).toFixed(2) + ' MB' : 'unknown'}\n`;
          
          if (metadata.schema && metadata.schema.fields) {
            contextInfo += `\nSchema:\n`;
            metadata.schema.fields.forEach(field => {
              contextInfo += `- ${field.name}: ${field.type}${field.mode !== 'NULLABLE' ? ` (${field.mode})` : ''}\n`;
              if (field.description) {
                contextInfo += `  Description: ${field.description}\n`;
              }
            });
          }
          
          // Get sample data
          contextInfo += `\nSample data (first 5 rows):\n`;
          try {
            const query = `SELECT * FROM \`${datasetId}.${tableId}\` LIMIT 5`;
            const [job] = await bigquery.createQueryJob({ query });
            const [rows] = await job.getQueryResults();
            
            if (rows.length > 0) {
              contextInfo += JSON.stringify(rows, null, 2) + '\n';
            } else {
              contextInfo += 'No data found in this table.\n';
            }
          } catch (error) {
            contextInfo += `Could not retrieve sample data: ${error.message}\n`;
          }
        } else {
          contextInfo += `Table ${datasetId}.${tableId} does not exist.\n`;
          
          // List available tables instead
          contextInfo += `Here are the available tables in dataset ${datasetId}:\n`;
          const dataset = bigquery.dataset(datasetId);
          const [tables] = await dataset.getTables();
          
          if (tables.length > 0) {
            tables.forEach(table => {
              contextInfo += `- ${table.id}\n`;
            });
          } else {
            contextInfo += 'No tables found in this dataset.\n';
          }
        }
      } else {
        // Just list datasets and tables
        contextInfo += `Available datasets and tables:\n`;
        
        const [datasets] = await bigquery.getDatasets();
        
        if (datasets.length === 0) {
          contextInfo += 'No datasets found.\n';
        } else {
          for (const dataset of datasets) {
            if (datasetId && dataset.id !== datasetId) {
              continue;
            }
            
            contextInfo += `Dataset: ${dataset.id}\n`;
            
            const [tables] = await dataset.getTables();
            if (tables.length === 0) {
              contextInfo += '  No tables found in this dataset.\n';
            } else {
              for (const table of tables) {
                contextInfo += `  - Table: ${table.id}\n`;
              }
            }
          }
        }
      }
      
      // Generate potential analysis approaches
      contextInfo += `\nPotential approaches for the analysis goal: "${analysisGoal}"\n`;
      contextInfo += `1. Explore the data structure and understand the schema\n`;
      contextInfo += `2. Check for data quality issues (null values, duplicates, outliers)\n`;
      contextInfo += `3. Perform descriptive statistics on key columns\n`;
      contextInfo += `4. Look for patterns and relationships between variables\n`;
      contextInfo += `5. Visualize the results of your analysis\n`;
      
      // Generate some example queries tailored for this analysis
      contextInfo += `\nSuggested analysis steps for BigQuery:\n`;
      
      if (tableId) {
        contextInfo += `-- Count total rows\nSELECT COUNT(*) AS row_count FROM \`${datasetId}.${tableId}\`;\n\n`;
        contextInfo += `-- Check for null values\nSELECT\n  COUNT(*) AS total_rows,\n  /* Add columns to check for nulls */\nFROM \`${datasetId}.${tableId}\`;\n\n`;
        contextInfo += `-- Get distribution of values\nSELECT\n  /* column */,\n  COUNT(*) AS count\nFROM \`${datasetId}.${tableId}\`\nGROUP BY 1\nORDER BY count DESC;\n\n`;
      }
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: contextInfo + `\nBased on this information, please help me analyze the BigQuery data to address the goal: "${analysisGoal}". Please suggest specific SQL queries I can run and explain how they'll help with the analysis.`
            }
          }
        ]
      };
    } catch (error) {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I need to analyze BigQuery data with the following goal: ${analysisGoal}\n\nHowever, there was an error retrieving dataset information: ${error.message}\n\nPlease help me understand how to work with BigQuery for this type of analysis. What are some general approaches and SQL patterns I should use?`
            }
          }
        ]
      };
    }
  }
);

// Prompt: To help create a data pipeline
server.prompt(
  "create-bigquery-pipeline",
  {
    sourceType: z.enum(["gcs", "csv", "json", "api", "database", "bigquery"]),
    destinationDatasetId: z.string().min(1, "Destination dataset ID cannot be empty"),
    destinationTableId: z.string().min(1, "Destination table ID cannot be empty"),
    pipelinePurpose: z.string().min(1, "Pipeline purpose cannot be empty"),
    transformations: z.string().optional(),
    schedule: z.string().optional(),
  },
  ({ sourceType, destinationDatasetId, destinationTableId, pipelinePurpose, transformations, schedule }) => {
    let promptText = `I need to create a data pipeline that loads data from ${sourceType} into BigQuery table ${destinationDatasetId}.${destinationTableId}.\n\n`;
    promptText += `Purpose of the pipeline: ${pipelinePurpose}\n\n`;
    
    if (transformations) {
      promptText += `Transformations needed: ${transformations}\n\n`;
    }
    
    if (schedule) {
      promptText += `Schedule: ${schedule}\n\n`;
    }
    
    // Add source-specific guidance
    switch (sourceType) {
      case "gcs":
        promptText += `For Google Cloud Storage sources, I should consider:
- File format (CSV, JSON, Avro, Parquet)
- Schema definition or autodetection
- Frequency of updates
- Partitioning and clustering options
- Using the "loadData" tool with appropriate parameters

Example workflow:
1. Upload data to GCS bucket
2. Define schema in BigQuery
3. Load data using BigQuery load job
4. Schedule recurring loads if needed
`;
        break;
        
      case "csv":
        promptText += `For CSV files, I should consider:
- Header row presence
- Delimiter character
- Escaping and quoting
- Schema definition
- Cleaning requirements before loading
- Using the "loadData" tool with sourceFormat "CSV"

Example workflow:
1. Prepare CSV file (ensure clean format)
2. Define schema in BigQuery
3. Load data using BigQuery load job
4. Schedule recurring loads if needed
`;
        break;
        
      case "json":
        promptText += `For JSON data, I should consider:
- Nested or flattened structure
- Array handling
- Schema definition
- Using the "loadData" tool with sourceFormat "JSON"

Example workflow:
1. Prepare JSON data in a compatible format
2. Define schema in BigQuery (including nested fields)
3. Load data using BigQuery load job
4. Schedule recurring loads if needed
`;
        break;
        
      case "api":
        promptText += `For API data sources, I should consider:
- API authentication
- Request/response format
- Rate limiting
- Incremental loading strategy
- Error handling and retries
- Scheduling and orchestration
- Writing a custom extraction process before loading

Example workflow:
1. Create script to extract data from API
2. Transform data into BigQuery-compatible format
3. Load using BigQuery API
4. Schedule the extraction process
`;
        break;
        
      case "database":
        promptText += `For database sources, I should consider:
- Connection details and credentials
- Table selection/filtering
- Incremental extraction strategy
- Schema mapping
- Using BigQuery Data Transfer Service or writing a custom extraction

Example workflow:
1. Set up connection to source database
2. Create extraction queries
3. Export data to staging format
4. Import to BigQuery
5. Schedule the process
`;
        break;
        
      case "bigquery":
        promptText += `For BigQuery-to-BigQuery pipelines, I should consider:
- Using SQL queries to transform data
- Creating views or materialized views
- Using BigQuery scheduled queries
- Using the "exportQueryToTable" tool

Example workflow:
1. Design transformation SQL query
2. Execute query writing results to destination table
3. Schedule the query using BigQuery scheduled queries
4. Monitor for data quality
`;
        break;
    }
    
    promptText += `\nPlease help me design this data pipeline for loading data from ${sourceType} to BigQuery. Include specific steps, code or SQL examples, and best practices for reliability and efficiency.`;
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: promptText
          }
        }
      ]
    };
  }
);

// Prompt: To visualize BigQuery data
server.prompt(
  "visualize-bigquery-data",
  {
    datasetId: z.string().min(1, "Dataset ID cannot be empty"),
    tableId: z.string().min(1, "Table ID cannot be empty"),
    visualizationType: z.enum(["table", "chart", "dashboard", "report", "map"]).optional(),
    projectId: z.string().optional(),
    visualizationGoal: z.string().min(1, "Visualization goal cannot be empty"),
  },
  async ({ datasetId, tableId, visualizationType, projectId, visualizationGoal }) => {
    try {
      const bigquery = getBigQueryClient();
      
      const dataset = bigquery.dataset(datasetId);
      const table = dataset.table(tableId);
      
      // Check if table exists
      const [exists] = await table.exists();
      if (!exists) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `I need to visualize BigQuery data from table ${datasetId}.${tableId} with the goal: ${visualizationGoal}\n\nHowever, the table doesn't exist. Please help me understand how I should approach visualizing BigQuery data in general, including options for creating visualizations from BigQuery data and best practices.`
              }
            }
          ]
        };
      }
      
      // Get table schema
      const [metadata] = await table.getMetadata();
      
      // Get sample data
      const query = `SELECT * FROM \`${datasetId}.${tableId}\` LIMIT 10`;
      const [job] = await bigquery.createQueryJob({ query });
      const [rows] = await job.getQueryResults();
      
      let promptText = `I need to visualize BigQuery data from table ${datasetId}.${tableId} with the following goal: ${visualizationGoal}\n\n`;
      
      // Add information about the table
      promptText += `Table information:\n`;
      promptText += `- Row count: ${metadata.numRows || 'unknown'}\n`;
      promptText += `- Schema:\n`;
      
      if (metadata.schema && metadata.schema.fields) {
        metadata.schema.fields.forEach(field => {
          promptText += `  - ${field.name}: ${field.type}${field.mode !== 'NULLABLE' ? ` (${field.mode})` : ''}\n`;
        });
      }
      
      // Add sample data
      promptText += `\nSample data (first ${rows.length} rows):\n`;
      promptText += JSON.stringify(rows, null, 2) + '\n\n';
      
      // Add visualization type specific guidance
      if (visualizationType) {
        promptText += `I'm interested in creating a ${visualizationType} visualization.\n\n`;
        
        switch (visualizationType) {
          case "table":
            promptText += `For tabular visualizations, consider:
- Formatting and styling for readability
- Pagination for large datasets
- Sorting and filtering capabilities
- Highlighting important values
- Adding summary rows/columns
- Conditional formatting

You can create tables using HTML/CSS, JavaScript libraries like DataTables, or visualization tools like Looker, Tableau, or Google Data Studio.`;
            break;
            
          case "chart":
            promptText += `For chart visualizations, consider:
- Selecting the appropriate chart type based on the data and goal:
  - Bar/column charts for comparisons
  - Line charts for trends over time
  - Pie/donut charts for composition
  - Scatter plots for correlation
  - Histograms for distribution
- Proper labeling and legends
- Color schemes for clarity
- Handling of outliers
- Interactive elements like tooltips

You can create charts using JavaScript libraries like Chart.js, D3.js, Highcharts, or visualization tools like Looker, Tableau, or Google Data Studio.`;
            break;
            
          case "dashboard":
            promptText += `For dashboard visualizations, consider:
- Combining multiple visualization types
- Layout and organization of components
- Consistent styling across visualizations
- Interactive filters and controls
- Real-time or scheduled refresh
- Mobile vs. desktop display considerations
- Key metrics and KPIs to highlight

You can create dashboards using tools like Looker, Tableau, Power BI, or Google Data Studio, or custom web applications using JavaScript frameworks.`;
            break;
            
          case "report":
            promptText += `For report visualizations, consider:
- Narrative structure and flow
- Combination of text explanations and visual elements
- Executive summary and detailed sections
- Consistent formatting and branding
- Printable vs. interactive formats
- Scheduled delivery options

You can create reports using tools like Looker, Tableau, Power BI, Google Data Studio, or custom formats using document creation tools.`;
            break;
            
          case "map":
            promptText += `For map visualizations, consider:
- Geocoding data points (latitude/longitude)
- Appropriate map projection
- Heat maps vs. markers vs. choropleth
- Regional boundaries and aggregation
- Zoom levels and interactive features
- Handling of densely clustered points

You can create maps using specialized JavaScript libraries like Leaflet, Mapbox, or Google Maps API, or visualization tools with mapping capabilities like Looker, Tableau, or Google Data Studio.`;
            break;
        }
      } else {
        // Suggest appropriate visualization types based on the data
        promptText += `Based on the data structure, here are some visualization types to consider:\n\n`;
        
        // Check if there are date/time fields for time series
        const hasDateFields = metadata.schema?.fields?.some(f => 
          ['TIMESTAMP', 'DATE', 'DATETIME', 'TIME'].includes(f.type)
        );
        
        if (hasDateFields) {
          promptText += `- Time series visualizations (line charts, area charts) for showing trends over time\n`;
        }
        
        // Check if there are numeric fields for quantitative analysis
        const hasNumericFields = metadata.schema?.fields?.some(f => 
          ['INTEGER', 'FLOAT', 'NUMERIC', 'BIGNUMERIC'].includes(f.type)
        );
        
        if (hasNumericFields) {
          promptText += `- Bar charts, histograms, or box plots for numeric distributions\n`;
          promptText += `- Scatter plots for relationships between numeric variables\n`;
        }
        
        // Check if there are categorical fields
        const hasCategoricalFields = metadata.schema?.fields?.some(f => 
          f.type === 'STRING'
        );
        
        if (hasCategoricalFields) {
          promptText += `- Pie charts or treemaps for showing composition of categorical data\n`;
          promptText += `- Bar charts for comparing categories\n`;
        }
        
        // Check for geographic data
        const hasGeoFields = metadata.schema?.fields?.some(f => 
          f.name.toLowerCase().includes('country') || 
          f.name.toLowerCase().includes('state') || 
          f.name.toLowerCase().includes('city') || 
          f.name.toLowerCase().includes('zip') || 
          f.name.toLowerCase().includes('postal') || 
          f.name.toLowerCase().includes('lat') || 
          f.name.toLowerCase().includes('lon') || 
          f.name.toLowerCase().includes('latitude') || 
          f.name.toLowerCase().includes('longitude')
        );
        
        if (hasGeoFields) {
          promptText += `- Maps or geospatial visualizations for geographic data\n`;
        }
      }
      
      // Add information about visualization tools
      promptText += `\nVisualization tools that work well with BigQuery include:
1. Google Data Studio (now Looker Studio) - direct integration with BigQuery
2. Tableau - has a BigQuery connector
3. Power BI - can connect to BigQuery
4. Looker - natively integrates with Google Cloud
5. Custom web applications using JavaScript libraries (Chart.js, D3.js, etc.)

For coding solutions, consider using:
- Google Colab or Jupyter notebooks with BigQuery API
- Python libraries like Matplotlib, Seaborn, or Plotly
- R with ggplot2 or other visualization packages
- JavaScript visualization libraries for web applications\n`;

      promptText += `\nPlease help me create a visualization plan for the data in ${datasetId}.${tableId} that addresses my goal: "${visualizationGoal}". Include specific visualization approaches, the tools or code I should use, and sample queries needed to prepare the data for visualization.`;
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText
            }
          }
        ]
      };
    } catch (error) {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I need to visualize BigQuery data from table ${datasetId}.${tableId} with the goal: ${visualizationGoal}\n\nHowever, there was an error: ${error.message}\n\nPlease help me understand the general process of visualizing BigQuery data and what tools would be most suitable for this type of visualization goal.`
            }
          }
        ]
      };
    }
  }
);

// Prompt: To optimize BigQuery queries and costs
server.prompt(
  "optimize-bigquery",
  {
    query: z.string().min(1, "SQL query cannot be empty"),
    optimizationGoal: z.enum(["performance", "cost", "both"]).default("both"),
    datasetInfo: z.string().optional(),
  },
  async ({ query, optimizationGoal, datasetInfo }) => {
    try {
      const bigquery = getBigQueryClient();
      
      let promptText = `I need to optimize the following BigQuery SQL query for ${optimizationGoal === "both" ? "performance and cost" : optimizationGoal}:\n\n\`\`\`sql\n${query}\n\`\`\`\n\n`;
      
      if (datasetInfo) {
        promptText += `Additional information about the dataset and tables:\n${datasetInfo}\n\n`;
      }
      
      // Try to get query information via dry run
      try {
        const options = {
          query,
          dryRun: true
        };
        
        const [job] = await bigquery.createQueryJob(options);
        const metadata = job.metadata;
        
        // Add query statistics
        promptText += `Query statistics from dry run:\n`;
        
        if (metadata.statistics && metadata.statistics.query) {
          const stats = metadata.statistics.query;
          
          if (stats.estimatedBytesProcessed) {
            const mbProcessed = Number(stats.estimatedBytesProcessed) / 1024 / 1024;
            promptText += `- Estimated data processed: ${mbProcessed.toFixed(2)} MB\n`;
          }
          
          if (stats.referencedTables) {
            promptText += `- Referenced tables: ${stats.referencedTables.length}\n`;
            stats.referencedTables.forEach(table => {
              promptText += `  - ${table.projectId}.${table.datasetId}.${table.tableId}\n`;
            });
          }
          
          if (stats.statementType) {
            promptText += `- Statement type: ${stats.statementType}\n`;
          }
        }
      } catch (error) {
        promptText += `Unable to perform dry run: ${error.message}\n`;
      }
      
      // Add optimization tips based on the goal
      promptText += `\nGeneral BigQuery optimization tips:\n`;
      
      if (optimizationGoal === "performance" || optimizationGoal === "both") {
        promptText += `
Performance optimization tips:
1. Use partitioning and clustering properly
2. Minimize data processed with column selection and filters
3. Avoid SELECT * and only request needed columns
4. Use LIMIT when you don't need all results
5. Optimize JOIN operations (filter before joining, use appropriate join types)
6. Avoid self-joins or complex subqueries when possible
7. Materialize commonly used CTEs
8. Use approximate aggregation functions when appropriate
9. Use ARRAY_AGG and STRUCT functions for nested data
10. Consider caching results for frequent queries
11. Use materialized views for complex aggregate queries
`;
      }
      
      if (optimizationGoal === "cost" || optimizationGoal === "both") {
        promptText += `
Cost optimization tips:
1. Optimize storage costs by using appropriate compression and partitioning
2. Use clustering to reduce query costs
3. Set expiration times for tables and datasets
4. Minimize data processed by selecting only required columns
5. Use appropriate filters and WHERE clauses to reduce data scanned
6. Preview queries with DRY_RUN to estimate costs before execution
7. Monitor query costs and identify expensive queries
8. Cache results when appropriate
9. Consider materialized views for frequent complex queries
10. Set byte limits to prevent unexpectedly expensive queries
11. Use table sampling for exploratory queries
`;
      }
      
      promptText += `\nPlease analyze this query and suggest specific optimizations to improve ${optimizationGoal === "both" ? "performance and reduce costs" : optimizationGoal === "performance" ? "performance" : "cost efficiency"}. Provide a rewritten, optimized version of the query along with an explanation of the changes made and why they'll help.`;
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText
            }
          }
        ]
      };
    } catch (error) {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I need to optimize the following BigQuery SQL query for ${optimizationGoal === "both" ? "performance and cost" : optimizationGoal}:\n\n\`\`\`sql\n${query}\n\`\`\`\n\nHowever, there was an error analyzing the query: ${error.message}\n\nPlease provide general guidance on optimizing BigQuery queries for ${optimizationGoal === "both" ? "performance and cost" : optimizationGoal} and analyze this query to suggest improvements.`
            }
          }
        ]
      };
    }
  }
);




// Start the server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
