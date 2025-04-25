import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as XLSX from 'xlsx';

// Mock in-memory storage for Excel files
const excelStorage = new Map();

// Create an MCP server
const server = new McpServer({
  name: "Excel Processor",
  version: "1.0.0",
  description: "A server that processes Excel files and performs operations on them"
});

// Tool to load an Excel file from base64 data
server.tool(
  "loadExcelFile",
  {
    fileName: z.string().describe("Name to save the Excel file as"),
    base64Content: z.string().describe("Base64-encoded content of the Excel file")
  },
  async ({ fileName, base64Content }) => {
    try {
      // Convert base64 to buffer
      const buffer = Buffer.from(base64Content, 'base64');
      
      // Parse Excel file
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      // Store in memory
      excelStorage.set(fileName, workbook);
      
      const sheetNames = workbook.SheetNames;
      
      return {
        content: [{ 
          type: "text", 
          text: `Excel file "${fileName}" loaded successfully. Available sheets: ${sheetNames.join(', ')}`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error loading Excel file: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to list all loaded Excel files
server.tool(
  "listExcelFiles",
  {},
  async () => {
    const fileNames = Array.from(excelStorage.keys());
    
    if (fileNames.length === 0) {
      return {
        content: [{ type: "text", text: "No Excel files are currently loaded." }]
      };
    }
    
    return {
      content: [{ 
        type: "text", 
        text: `Loaded Excel files: ${fileNames.join(', ')}`
      }]
    };
  }
);

// Resource to get information about a specific Excel file
server.resource(
  "excel-info",
  new ResourceTemplate("excel://{fileName}/info", { list: undefined }),
  async (uri, { fileName }) => {
    const workbook = excelStorage.get(fileName);
    
    if (!workbook) {
      return {
        contents: [{
          uri: uri.href,
          text: `Excel file "${fileName}" not found.`
        }]
      };
    }
    
    const sheetInfo = workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      return {
        name,
        rows: range.e.r + 1,
        cols: range.e.c + 1
      };
    });
    
    return {
      contents: [{
        uri: uri.href,
        text: `Excel file: ${fileName}\nSheets: ${workbook.SheetNames.length}\n\n` +
              sheetInfo.map(info => `Sheet: ${info.name}\nRows: ${info.rows}\nColumns: ${info.cols}`).join('\n\n')
      }]
    };
  }
);

// Resource to get sheet data
server.resource(
  "excel-sheet",
  new ResourceTemplate("excel://{fileName}/sheet/{sheetName}", { list: undefined }),
  async (uri, { fileName, sheetName }) => {
    const workbook = excelStorage.get(fileName);
    
    if (!workbook) {
      return {
        contents: [{
          uri: uri.href,
          text: `Excel file "${fileName}" not found.`
        }]
      };
    }
    
    if (!workbook.SheetNames.includes(sheetName)) {
      return {
        contents: [{
          uri: uri.href,
          text: `Sheet "${sheetName}" not found in file "${fileName}".`
        }]
      };
    }
    
    // Convert sheet to JSON
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    const formattedData = data.map(row => 
      Array.isArray(row) ? row.map(cell => cell?.toString() || '').join('\t') : ''
    ).join('\n');
    
    return {
      contents: [{
        uri: uri.href,
        text: formattedData
      }]
    };
  }
);

// Resource to list all sheets in an Excel file
server.resource(
  "excel-sheets",
  new ResourceTemplate("excel://{fileName}/sheets", { list: undefined }),
  async (uri, { fileName }) => {
    const workbook = excelStorage.get(fileName);
    
    if (!workbook) {
      return {
        contents: [{
          uri: uri.href,
          text: `Excel file "${fileName}" not found.`
        }]
      };
    }
    
    return {
      contents: [{
        uri: uri.href,
        text: `Sheets in "${fileName}":\n${workbook.SheetNames.join('\n')}`
      }]
    };
  }
);

// Tool to filter data in an Excel sheet
server.tool(
  "filterExcelData",
  {
    fileName: z.string().describe("Name of the Excel file"),
    sheetName: z.string().describe("Name of the sheet to filter"),
    column: z.string().describe("Column to filter on (e.g., 'A' or column name)"),
    value: z.string().describe("Value to filter for"),
    operator: z.enum(['equals', 'contains', 'greater', 'less', 'not']).describe("Filtering operator")
  },
  async ({ fileName, sheetName, column, value, operator }) => {
    try {
      const workbook = excelStorage.get(fileName);
      
      if (!workbook) {
        return {
          content: [{ type: "text", text: `Excel file "${fileName}" not found.` }],
          isError: true
        };
      }
      
      if (!workbook.SheetNames.includes(sheetName)) {
        return {
          content: [{ type: "text", text: `Sheet "${sheetName}" not found in file "${fileName}".` }],
          isError: true
        };
      }
      
      // Convert sheet to JSON with headers
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);
      
      // If column is a letter, convert to a header name
      const colIndex = column.match(/^[A-Z]+$/) ? column : null;
      const colName = colIndex ? getHeaderNameFromColumnLetter(data, colIndex) : column;
      
      // Apply filter
      let filteredData;
      switch (operator) {
        case 'equals':
          filteredData = data.filter(row => row[colName]?.toString() === value);
          break;
        case 'contains':
          filteredData = data.filter(row => row[colName]?.toString().includes(value));
          break;
        case 'greater':
          filteredData = data.filter(row => parseFloat(row[colName]) > parseFloat(value));
          break;
        case 'less':
          filteredData = data.filter(row => parseFloat(row[colName]) < parseFloat(value));
          break;
        case 'not':
          filteredData = data.filter(row => row[colName]?.toString() !== value);
          break;
        default:
          return {
            content: [{ type: "text", text: `Unknown operator: ${operator}` }],
            isError: true
          };
      }
      
      // Format the result
      const formattedResult = formatJsonData(filteredData);
      
      return {
        content: [{ 
          type: "text", 
          text: `Filtered results for "${fileName}" - "${sheetName}" where ${colName} ${operator} "${value}":\n\n${formattedResult}`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error filtering data: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to sort data in an Excel sheet
server.tool(
  "sortExcelData",
  {
    fileName: z.string().describe("Name of the Excel file"),
    sheetName: z.string().describe("Name of the sheet to sort"),
    column: z.string().describe("Column to sort by (e.g., 'A' or column name)"),
    order: z.enum(['asc', 'desc']).describe("Sort order: 'asc' for ascending, 'desc' for descending")
  },
  async ({ fileName, sheetName, column, order }) => {
    try {
      const workbook = excelStorage.get(fileName);
      
      if (!workbook) {
        return {
          content: [{ type: "text", text: `Excel file "${fileName}" not found.` }],
          isError: true
        };
      }
      
      if (!workbook.SheetNames.includes(sheetName)) {
        return {
          content: [{ type: "text", text: `Sheet "${sheetName}" not found in file "${fileName}".` }],
          isError: true
        };
      }
      
      // Convert sheet to JSON with headers
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);
      
      // If column is a letter, convert to a header name
      const colIndex = column.match(/^[A-Z]+$/) ? column : null;
      const colName = colIndex ? getHeaderNameFromColumnLetter(data, colIndex) : column;
      
      // Sort data
      const sortedData = [...data].sort((a, b) => {
        const valA = a[colName];
        const valB = b[colName];
        
        // Handle numeric values
        if (!isNaN(valA) && !isNaN(valB)) {
          return order === 'asc' 
            ? parseFloat(valA) - parseFloat(valB) 
            : parseFloat(valB) - parseFloat(valA);
        }
        
        // Handle strings
        const strA = String(valA || '');
        const strB = String(valB || '');
        
        return order === 'asc' 
          ? strA.localeCompare(strB) 
          : strB.localeCompare(strA);
      });
      
      // Format the result
      const formattedResult = formatJsonData(sortedData);
      
      return {
        content: [{ 
          type: "text", 
          text: `Sorted results for "${fileName}" - "${sheetName}" by ${colName} (${order === 'asc' ? 'ascending' : 'descending'}):\n\n${formattedResult}`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error sorting data: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to calculate summary statistics for a column
server.tool(
  "calculateStats",
  {
    fileName: z.string().describe("Name of the Excel file"),
    sheetName: z.string().describe("Name of the sheet to analyze"),
    column: z.string().describe("Column to calculate statistics for (e.g., 'A' or column name)")
  },
  async ({ fileName, sheetName, column }) => {
    try {
      const workbook = excelStorage.get(fileName);
      
      if (!workbook) {
        return {
          content: [{ type: "text", text: `Excel file "${fileName}" not found.` }],
          isError: true
        };
      }
      
      if (!workbook.SheetNames.includes(sheetName)) {
        return {
          content: [{ type: "text", text: `Sheet "${sheetName}" not found in file "${fileName}".` }],
          isError: true
        };
      }
      
      // Convert sheet to JSON with headers
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);
      
      // If column is a letter, convert to a header name
      const colIndex = column.match(/^[A-Z]+$/) ? column : null;
      const colName = colIndex ? getHeaderNameFromColumnLetter(data, colIndex) : column;
      
      // Extract numerical values from the column
      const values = data
        .map(row => row[colName])
        .filter(val => val !== undefined && !isNaN(parseFloat(val)))
        .map(val => parseFloat(val));
      
      if (values.length === 0) {
        return {
          content: [{ type: "text", text: `No numerical values found in column "${colName}".` }]
        };
      }
      
      // Calculate statistics
      const sum = values.reduce((acc, val) => acc + val, 0);
      const mean = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      // Calculate median
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
      
      // Calculate standard deviation
      const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      return {
        content: [{ 
          type: "text", 
          text: `Statistics for column "${colName}" in "${fileName}" - "${sheetName}":\n\n` +
                `Count: ${values.length}\n` +
                `Sum: ${sum.toFixed(2)}\n` +
                `Mean: ${mean.toFixed(2)}\n` +
                `Median: ${median.toFixed(2)}\n` +
                `Min: ${min.toFixed(2)}\n` +
                `Max: ${max.toFixed(2)}\n` +
                `Standard Deviation: ${stdDev.toFixed(2)}`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error calculating statistics: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to export sheet as CSV
server.tool(
  "exportAsCsv",
  {
    fileName: z.string().describe("Name of the Excel file"),
    sheetName: z.string().describe("Name of the sheet to export")
  },
  async ({ fileName, sheetName }) => {
    try {
      const workbook = excelStorage.get(fileName);
      
      if (!workbook) {
        return {
          content: [{ type: "text", text: `Excel file "${fileName}" not found.` }],
          isError: true
        };
      }
      
      if (!workbook.SheetNames.includes(sheetName)) {
        return {
          content: [{ type: "text", text: `Sheet "${sheetName}" not found in file "${fileName}".` }],
          isError: true
        };
      }
      
      // Get the worksheet
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to CSV
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      
      return {
        content: [{ 
          type: "text", 
          text: `CSV export of "${fileName}" - "${sheetName}":\n\n${csv}`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error exporting as CSV: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to create a new Excel file with provided data
server.tool(
  "createExcelFile",
  {
    fileName: z.string().describe("Name for the new Excel file"),
    sheetName: z.string().describe("Name for the first sheet"),
    data: z.string().describe("Data in CSV format or tab-separated format")
  },
  async ({ fileName, sheetName, data }) => {
    try {
      // Parse the data (assuming CSV format)
      const rows = data.split('\n').map(line => line.split(/[,\t]/));
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      
      // Store in memory
      excelStorage.set(fileName, workbook);
      
      return {
        content: [{ 
          type: "text", 
          text: `Excel file "${fileName}" created successfully with sheet "${sheetName}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error creating Excel file: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to add a new sheet to an existing Excel file
server.tool(
  "addSheet",
  {
    fileName: z.string().describe("Name of the Excel file"),
    sheetName: z.string().describe("Name for the new sheet"),
    data: z.string().describe("Data in CSV format or tab-separated format")
  },
  async ({ fileName, sheetName, data }) => {
    try {
      const workbook = excelStorage.get(fileName);
      
      if (!workbook) {
        return {
          content: [{ type: "text", text: `Excel file "${fileName}" not found.` }],
          isError: true
        };
      }
      
      if (workbook.SheetNames.includes(sheetName)) {
        return {
          content: [{ type: "text", text: `Sheet "${sheetName}" already exists in file "${fileName}".` }],
          isError: true
        };
      }
      
      // Parse the data (assuming CSV format)
      const rows = data.split('\n').map(line => line.split(/[,\t]/));
      
      // Create and add the new worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      
      return {
        content: [{ 
          type: "text", 
          text: `Sheet "${sheetName}" added to "${fileName}" successfully.`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error adding sheet: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to perform a VLOOKUP-like operation across sheets or files
server.tool(
  "lookupValue",
  {
    sourceFileName: z.string().describe("Name of the source Excel file"),
    sourceSheetName: z.string().describe("Name of the source sheet"),
    sourceColumn: z.string().describe("Column in source sheet containing lookup values"),
    lookupValue: z.string().describe("Value to look up"),
    targetFileName: z.string().describe("Name of the target Excel file (can be the same as source)"),
    targetSheetName: z.string().describe("Name of the target sheet to look up in"),
    targetLookupColumn: z.string().describe("Column in target sheet to match against lookup value"),
    targetReturnColumn: z.string().describe("Column in target sheet to return value from")
  },
  async ({ sourceFileName, sourceSheetName, sourceColumn, lookupValue, 
           targetFileName, targetSheetName, targetLookupColumn, targetReturnColumn }) => {
    try {
      // Get source workbook
      const sourceWorkbook = excelStorage.get(sourceFileName);
      if (!sourceWorkbook) {
        return {
          content: [{ type: "text", text: `Source Excel file "${sourceFileName}" not found.` }],
          isError: true
        };
      }
      
      // Get target workbook (may be the same as source)
      const targetWorkbook = excelStorage.get(targetFileName);
      if (!targetWorkbook) {
        return {
          content: [{ type: "text", text: `Target Excel file "${targetFileName}" not found.` }],
          isError: true
        };
      }
      
      // Validate sheets exist
      if (!sourceWorkbook.SheetNames.includes(sourceSheetName)) {
        return {
          content: [{ type: "text", text: `Source sheet "${sourceSheetName}" not found in file "${sourceFileName}".` }],
          isError: true
        };
      }
      
      if (!targetWorkbook.SheetNames.includes(targetSheetName)) {
        return {
          content: [{ type: "text", text: `Target sheet "${targetSheetName}" not found in file "${targetFileName}".` }],
          isError: true
        };
      }
      
      // Get data from target sheet
      const targetSheet = targetWorkbook.Sheets[targetSheetName];
      const targetData = XLSX.utils.sheet_to_json(targetSheet);
      
      // If columns are letters, convert to header names
      const sourceLookupColName = sourceColumn.match(/^[A-Z]+$/) 
        ? getHeaderNameFromColumnLetter(targetData, sourceColumn) 
        : sourceColumn;
        
      const targetLookupColName = targetLookupColumn.match(/^[A-Z]+$/) 
        ? getHeaderNameFromColumnLetter(targetData, targetLookupColumn) 
        : targetLookupColumn;
        
      const targetReturnColName = targetReturnColumn.match(/^[A-Z]+$/) 
        ? getHeaderNameFromColumnLetter(targetData, targetReturnColumn) 
        : targetReturnColumn;
      
      // Find matching row in target data
      const matchingRow = targetData.find(row => 
        String(row[targetLookupColName]) === String(lookupValue)
      );
      
      if (!matchingRow) {
        return {
          content: [{ 
            type: "text", 
            text: `No match found for value "${lookupValue}" in column "${targetLookupColName}".`
          }]
        };
      }
      
      const returnValue = matchingRow[targetReturnColName];
      
      return {
        content: [{ 
          type: "text", 
          text: `Lookup result: ${returnValue}`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error during lookup: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to extract data from a specific range in a sheet
server.tool(
  "extractRange",
  {
    fileName: z.string().describe("Name of the Excel file"),
    sheetName: z.string().describe("Name of the sheet"),
    range: z.string().describe("Cell range in Excel format (e.g., 'A1:C10')")
  },
  async ({ fileName, sheetName, range }) => {
    try {
      const workbook = excelStorage.get(fileName);
      
      if (!workbook) {
        return {
          content: [{ type: "text", text: `Excel file "${fileName}" not found.` }],
          isError: true
        };
      }
      
      if (!workbook.SheetNames.includes(sheetName)) {
        return {
          content: [{ type: "text", text: `Sheet "${sheetName}" not found in file "${fileName}".` }],
          isError: true
        };
      }
      
      // Get the worksheet
      const worksheet = workbook.Sheets[sheetName];
      
      // Extract the specified range
      const rangeData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        range: range
      });
      
      // Format the result as text
      const formattedRange = rangeData.map(row => 
        Array.isArray(row) ? row.map(cell => cell?.toString() || '').join('\t') : ''
      ).join('\n');
      
      return {
        content: [{ 
          type: "text", 
          text: `Data from range ${range} in "${fileName}" - "${sheetName}":\n\n${formattedRange}`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error extracting range: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to search for text across all sheets in a file
server.tool(
  "searchExcelFile",
  {
    fileName: z.string().describe("Name of the Excel file"),
    searchText: z.string().describe("Text to search for"),
    caseSensitive: z.boolean().optional().describe("Whether the search should be case-sensitive")
  },
  async ({ fileName, searchText, caseSensitive = false }) => {
    try {
      const workbook = excelStorage.get(fileName);
      
      if (!workbook) {
        return {
          content: [{ type: "text", text: `Excel file "${fileName}" not found.` }],
          isError: true
        };
      }
      
      const results = [];
      
      // Search through each sheet
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        // Search through each cell in the sheet
        for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
          const row = data[rowIdx];
          if (!Array.isArray(row)) continue;
          
          for (let colIdx = 0; colIdx < row.length; colIdx++) {
            const cellValue = String(row[colIdx] || '');
            const searchFor = caseSensitive ? searchText : searchText.toLowerCase();
            const cellContent = caseSensitive ? cellValue : cellValue.toLowerCase();
            
            if (cellContent.includes(searchFor)) {
              const colLetter = getExcelColumnName(colIdx);
              results.push({
                sheet: sheetName,
                cell: `${colLetter}${rowIdx + 1}`,
                value: cellValue
              });
            }
          }
        }
      }
      
      if (results.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No matches found for "${searchText}" in file "${fileName}".`
          }]
        };
      }
      
      // Format the results
      const formattedResults = results.map(result => 
        `Sheet: ${result.sheet}, Cell: ${result.cell}, Value: ${result.value}`
      ).join('\n');
      
      return {
        content: [{ 
          type: "text", 
          text: `Search results for "${searchText}" in "${fileName}":\n\n${formattedResults}`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error searching Excel file: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Helper functions
function getExcelColumnName(index) {
  let columnName = '';
  let temp = index;
  
  while (temp >= 0) {
    columnName = String.fromCharCode(65 + (temp % 26)) + columnName;
    temp = Math.floor(temp / 26) - 1;
  }
  
  return columnName;
}

function getHeaderNameFromColumnLetter(data, columnLetter) {
  // Convert column letter to index (0-based)
  let index = 0;
  const letters = columnLetter.split('');
  
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + letters[i].charCodeAt(0) - 64;
  }
  index--; // Convert to 0-based index
  
  // Get the first row which should contain headers
  const headers = Object.keys(data[0] || {});
  
  // Return the header name at the specified index
  return headers[index] || columnLetter;
}

function formatJsonData(data) {
  if (data.length === 0) {
    return 'No data found.';
  }
  
  // Get headers from the first row
  const headers = Object.keys(data[0]);
  
  // Format as ASCII table
  let result = headers.join('\t') + '\n';
  result += data.map(row => 
    headers.map(header => row[header]?.toString() || '').join('\t')
  ).join('\n');
  
  return result;
}

// Start the server
const transport = new StdioServerTransport();
server.connect(transport);
