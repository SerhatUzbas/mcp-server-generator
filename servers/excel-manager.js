import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as XLSX from 'xlsx';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Excel Manager MCP Server
 * 
 * This server provides tools for reading and modifying Excel files.
 * It uses the SheetJS library to manipulate Excel files.
 */

// Create an MCP server
const server = new McpServer({
  name: "ExcelManager",
  version: "1.0.0",
  description: "Server for reading and modifying Excel files"
});

// Helper function to read Excel file
async function readExcelFile(filePath) {
  try {
    // Use Node's native fs module to read the file
    const fileData = await fs.readFile(filePath);
    
    // Set global variables for XLSX to avoid window reference issues
    global.Buffer = global.Buffer || Buffer;
    
    // Use binary string format which doesn't rely on browser APIs
    const workbook = XLSX.read(fileData, {
      type: 'buffer',
      cellStyles: true,
      cellFormulas: true,
      cellDates: true,
      cellNF: true,
      sheetStubs: true
    });
    return { success: true, workbook };
  } catch (error) {
    console.error(`File reading error: ${error.message}`);
    return { 
      success: false, 
      error: `Error reading Excel file: ${error.message}`
    };
  }
}

// Helper function to write Excel file
async function writeExcelFile(workbook, filePath) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    
    // Set global variables for XLSX to avoid window reference issues
    global.Buffer = global.Buffer || Buffer;
    
    // Write the file using Node's native fs module
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer',
      bookType: 'xlsx'
    });
    
    await fs.writeFile(filePath, excelBuffer);
    return { success: true };
  } catch (error) {
    console.error(`File writing error: ${error.message}`);
    return { 
      success: false, 
      error: `Error writing Excel file: ${error.message}`
    };
  }
}

// Tool 1: Read Excel file and get sheet information
server.tool(
  "readExcelInfo",
  {
    filePath: z.string().describe("Path to the Excel file")
  },
  async ({ filePath }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      const sheetNames = workbook.SheetNames;
      const info = {
        fileName: filePath.split('/').pop(),
        sheetNames,
        sheetInfo: {}
      };
      
      // Get basic info about each sheet
      for (const sheetName of sheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
        
        info.sheetInfo[sheetName] = {
          rowCount: range.e.r + 1,
          columnCount: range.e.c + 1,
          usedRange: sheet['!ref']
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(info, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error processing Excel file: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 2: Read sheet data as JSON
server.tool(
  "readSheetData",
  {
    filePath: z.string().describe("Path to the Excel file"),
    sheetName: z.string().optional().describe("Name of the sheet (defaults to first sheet)"),
    range: z.string().optional().describe("Cell range to read (e.g., 'A1:D10', defaults to all data)")
  },
  async ({ filePath, sheetName, range }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Use first sheet if not specified
      const targetSheetName = sheetName || workbook.SheetNames[0];
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(targetSheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${targetSheetName}" not found in workbook.`
          }],
          isError: true
        };
      }
      
      const sheet = workbook.Sheets[targetSheetName];
      
      // If range is specified, adjust sheet reference
      if (range) {
        const originalRef = sheet['!ref'];
        try {
          // Temporarily change the sheet ref to read only the specified range
          sheet['!ref'] = range;
          const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          // Restore original ref
          sheet['!ref'] = originalRef;
          
          return {
            content: [{ 
              type: "text", 
              text: JSON.stringify(data, null, 2)
            }]
          };
        } catch (rangeError) {
          // Restore original ref if there was an error
          sheet['!ref'] = originalRef;
          return {
            content: [{ 
              type: "text", 
              text: `Invalid range format: ${rangeError.message}`
            }],
            isError: true
          };
        }
      }
      
      // Convert sheet to JSON (using header:1 to get array of arrays)
      const data = XLSX.utils.sheet_to_json(sheet, { 
        header: 1,
        raw: false // Convert everything to strings for consistent output
      });
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error extracting sheet data: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 3: Update cell values
server.tool(
  "updateCells",
  {
    filePath: z.string().describe("Path to the Excel file"),
    sheetName: z.string().optional().describe("Name of the sheet (defaults to first sheet)"),
    updates: z.array(z.object({
      cell: z.string().describe("Cell reference (e.g., 'A1')"),
      value: z.union([z.string(), z.number(), z.boolean()]).describe("New value for the cell")
    })).describe("Array of cell updates"),
    saveAs: z.string().optional().describe("Save to a different file path (optional)")
  },
  async ({ filePath, sheetName, updates, saveAs }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Use first sheet if not specified
      const targetSheetName = sheetName || workbook.SheetNames[0];
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(targetSheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${targetSheetName}" not found in workbook.`
          }],
          isError: true
        };
      }
      
      const sheet = workbook.Sheets[targetSheetName];
      
      // Apply updates
      for (const update of updates) {
        const cellRef = update.cell.toUpperCase();
        sheet[cellRef] = { v: update.value, t: XLSX.utils.getType(update.value) };
      }
      
      // Recalculate formula cells
      XLSX.utils.book_append_sheet(workbook, sheet, targetSheetName, true);
      
      // Save file
      const outputPath = saveAs || filePath;
      const writeResult = await writeExcelFile(workbook, outputPath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully updated ${updates.length} cell(s) in sheet "${targetSheetName}" and saved to "${outputPath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error updating cells: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 4: Add a new sheet
server.tool(
  "addSheet",
  {
    filePath: z.string().describe("Path to the Excel file"),
    sheetName: z.string().describe("Name for the new sheet"),
    data: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .optional()
      .describe("Initial data for the sheet (array of arrays, optional)"),
    saveAs: z.string().optional().describe("Save to a different file path (optional)")
  },
  async ({ filePath, sheetName, data, saveAs }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Check if sheet already exists
      if (workbook.SheetNames.includes(sheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${sheetName}" already exists in workbook.`
          }],
          isError: true
        };
      }
      
      // Create a new worksheet
      const newSheet = XLSX.utils.aoa_to_sheet(data || [[]]);
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(workbook, newSheet, sheetName);
      
      // Save file
      const outputPath = saveAs || filePath;
      const writeResult = await writeExcelFile(workbook, outputPath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully added sheet "${sheetName}" to workbook and saved to "${outputPath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error adding sheet: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 5: Delete a sheet
server.tool(
  "deleteSheet",
  {
    filePath: z.string().describe("Path to the Excel file"),
    sheetName: z.string().describe("Name of the sheet to delete"),
    saveAs: z.string().optional().describe("Save to a different file path (optional)")
  },
  async ({ filePath, sheetName, saveAs }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(sheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${sheetName}" not found in workbook.`
          }],
          isError: true
        };
      }
      
      // Check if it's the only sheet
      if (workbook.SheetNames.length === 1) {
        return {
          content: [{ 
            type: "text", 
            text: `Cannot delete sheet "${sheetName}" as it is the only sheet in the workbook.`
          }],
          isError: true
        };
      }
      
      // Get the index of the sheet to remove
      const sheetIndex = workbook.SheetNames.indexOf(sheetName);
      
      // Remove the sheet
      workbook.SheetNames.splice(sheetIndex, 1);
      delete workbook.Sheets[sheetName];
      
      // Save file
      const outputPath = saveAs || filePath;
      const writeResult = await writeExcelFile(workbook, outputPath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully deleted sheet "${sheetName}" from workbook and saved to "${outputPath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error deleting sheet: ${error.message}`
        }],
        isError: true
      };
    }
  }
);
// Tool 6: Apply formatting to cells
server.tool(
  "formatCells",
  {
    filePath: z.string().describe("Path to the Excel file"),
    sheetName: z.string().optional().describe("Name of the sheet (defaults to first sheet)"),
    formats: z.array(z.object({
      range: z.string().describe("Cell range to format (e.g., 'A1:B5' or 'A1')"),
      format: z.object({
        bold: z.boolean().optional().describe("Set text to bold"),
        italic: z.boolean().optional().describe("Set text to italic"),
        underline: z.boolean().optional().describe("Set text to underline"),
        fontSize: z.number().optional().describe("Set font size"),
        fontColor: z.string().optional().describe("Set font color (hex code, e.g., 'FF0000' for red)"),
        fillColor: z.string().optional().describe("Set cell background color (hex code)"),
        horizontalAlignment: z.enum(['left', 'center', 'right']).optional().describe("Set horizontal alignment"),
        verticalAlignment: z.enum(['top', 'middle', 'bottom']).optional().describe("Set vertical alignment"),
        wrapText: z.boolean().optional().describe("Enable/disable text wrapping"),
        numberFormat: z.string().optional().describe("Number format code (e.g., '0.00%' for percentage)")
      }).describe("Format options to apply")
    })).describe("Array of formatting instructions"),
    saveAs: z.string().optional().describe("Save to a different file path (optional)")
  },
  async ({ filePath, sheetName, formats, saveAs }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Use first sheet if not specified
      const targetSheetName = sheetName || workbook.SheetNames[0];
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(targetSheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${targetSheetName}" not found in workbook.`
          }],
          isError: true
        };
      }
      
      const sheet = workbook.Sheets[targetSheetName];
      
      // Initialize cell styles if not present
      if (!sheet['!cols']) sheet['!cols'] = [];
      if (!sheet['!rows']) sheet['!rows'] = [];
      
      // Process each format instruction
      for (const formatInstruction of formats) {
        const { range, format } = formatInstruction;
        
        // Parse the range
        let startCell, endCell;
        if (range.includes(':')) {
          [startCell, endCell] = range.split(':').map(ref => ref.toUpperCase());
        } else {
          startCell = endCell = range.toUpperCase();
        }
        
        // Decode cell references to get row/column indices
        const startRef = XLSX.utils.decode_cell(startCell);
        const endRef = XLSX.utils.decode_cell(endCell);
        
        // Apply formatting to each cell in the range
        for (let r = startRef.r; r <= endRef.r; r++) {
          for (let c = startRef.c; c <= endRef.c; c++) {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            
            // Ensure the cell exists
            if (!sheet[cellRef]) {
              sheet[cellRef] = { v: '', t: 's' };
            }
            
            // Create or update cell style
            if (!sheet[cellRef].s) sheet[cellRef].s = {};
            
            // Apply formats based on provided options
            if (format.bold !== undefined) {
              if (!sheet[cellRef].s.font) sheet[cellRef].s.font = {};
              sheet[cellRef].s.font.bold = format.bold;
            }
            
            if (format.italic !== undefined) {
              if (!sheet[cellRef].s.font) sheet[cellRef].s.font = {};
              sheet[cellRef].s.font.italic = format.italic;
            }
            
            if (format.underline !== undefined) {
              if (!sheet[cellRef].s.font) sheet[cellRef].s.font = {};
              sheet[cellRef].s.font.underline = format.underline;
            }
            
            if (format.fontSize !== undefined) {
              if (!sheet[cellRef].s.font) sheet[cellRef].s.font = {};
              sheet[cellRef].s.font.sz = format.fontSize;
            }
            
            if (format.fontColor !== undefined) {
              if (!sheet[cellRef].s.font) sheet[cellRef].s.font = {};
              sheet[cellRef].s.font.color = { rgb: format.fontColor };
            }
            
            if (format.fillColor !== undefined) {
              if (!sheet[cellRef].s.fill) sheet[cellRef].s.fill = {};
              sheet[cellRef].s.fill.fgColor = { rgb: format.fillColor };
              sheet[cellRef].s.fill.patternType = 'solid';
            }
            
            if (format.horizontalAlignment !== undefined) {
              if (!sheet[cellRef].s.alignment) sheet[cellRef].s.alignment = {};
              sheet[cellRef].s.alignment.horizontal = format.horizontalAlignment;
            }
            
            if (format.verticalAlignment !== undefined) {
              if (!sheet[cellRef].s.alignment) sheet[cellRef].s.alignment = {};
              sheet[cellRef].s.alignment.vertical = format.verticalAlignment;
            }
            
            if (format.wrapText !== undefined) {
              if (!sheet[cellRef].s.alignment) sheet[cellRef].s.alignment = {};
              sheet[cellRef].s.alignment.wrapText = format.wrapText;
            }
            
            if (format.numberFormat !== undefined) {
              sheet[cellRef].z = format.numberFormat;
            }
          }
        }
      }
      
      // Save file
      const outputPath = saveAs || filePath;
      const writeResult = await writeExcelFile(workbook, outputPath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully applied formatting to sheet "${targetSheetName}" and saved to "${outputPath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error applying formatting: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 7: Add formulas to cells
server.tool(
  "addFormulas",
  {
    filePath: z.string().describe("Path to the Excel file"),
    sheetName: z.string().optional().describe("Name of the sheet (defaults to first sheet)"),
    formulas: z.array(z.object({
      cell: z.string().describe("Cell reference (e.g., 'C5')"),
      formula: z.string().describe("Excel formula (e.g., '=SUM(A1:B4)')")
    })).describe("Array of formulas to add"),
    saveAs: z.string().optional().describe("Save to a different file path (optional)")
  },
  async ({ filePath, sheetName, formulas, saveAs }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Use first sheet if not specified
      const targetSheetName = sheetName || workbook.SheetNames[0];
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(targetSheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${targetSheetName}" not found in workbook.`
          }],
          isError: true
        };
      }
      
      const sheet = workbook.Sheets[targetSheetName];
      
      // Add each formula
      for (const { cell, formula } of formulas) {
        const cellRef = cell.toUpperCase();
        
        // Add the formula to the cell
        // Formula cells in SheetJS have both a formula string and calculated value
        sheet[cellRef] = { 
          f: formula.startsWith('=') ? formula.substring(1) : formula, 
          t: 'n' // Assume numeric result, SheetJS will adjust as needed
        };
      }
      
      // Save file
      const outputPath = saveAs || filePath;
      const writeResult = await writeExcelFile(workbook, outputPath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully added ${formulas.length} formula(s) to sheet "${targetSheetName}" and saved to "${outputPath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error adding formulas: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 8: Create a new Excel file
server.tool(
  "createExcelFile",
  {
    filePath: z.string().describe("Path where the Excel file should be saved"),
    sheets: z.array(z.object({
      name: z.string().describe("Name for the sheet"),
      data: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
        .describe("Data for the sheet (array of arrays)")
    })).describe("Array of sheets to create")
  },
  async ({ filePath, sheets }) => {
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Add each sheet
      for (const sheetInfo of sheets) {
        const { name, data } = sheetInfo;
        
        // Validate sheet name
        if (name.length > 31) {
          return {
            content: [{ 
              type: "text", 
              text: `Sheet name "${name}" is too long. Excel limits sheet names to 31 characters.`
            }],
            isError: true
          };
        }
        
        // Create a new worksheet
        const sheet = XLSX.utils.aoa_to_sheet(data || [[]]);
        
        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(workbook, sheet, name);
      }
      
      // Save file
      const writeResult = await writeExcelFile(workbook, filePath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully created Excel file with ${sheets.length} sheet(s) at "${filePath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error creating Excel file: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 9: Merge cells
server.tool(
  "mergeCells",
  {
    filePath: z.string().describe("Path to the Excel file"),
    sheetName: z.string().optional().describe("Name of the sheet (defaults to first sheet)"),
    merges: z.array(z.string().describe("Cell range to merge (e.g., 'A1:C3')"))
      .describe("Array of cell ranges to merge"),
    saveAs: z.string().optional().describe("Save to a different file path (optional)")
  },
  async ({ filePath, sheetName, merges, saveAs }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Use first sheet if not specified
      const targetSheetName = sheetName || workbook.SheetNames[0];
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(targetSheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${targetSheetName}" not found in workbook.`
          }],
          isError: true
        };
      }
      
      const sheet = workbook.Sheets[targetSheetName];
      
      // Initialize !merges array if it doesn't exist
      if (!sheet['!merges']) {
        sheet['!merges'] = [];
      }
      
      // Process each merge range
      for (const mergeRange of merges) {
        if (!mergeRange.includes(':')) {
          return {
            content: [{ 
              type: "text", 
              text: `Invalid merge range: "${mergeRange}". Must be in format "A1:B2".`
            }],
            isError: true
          };
        }
        
        const [startCell, endCell] = mergeRange.split(':').map(ref => ref.toUpperCase());
        const startRef = XLSX.utils.decode_cell(startCell);
        const endRef = XLSX.utils.decode_cell(endCell);
        
        // Create merge object
        const mergeObj = {
          s: { r: startRef.r, c: startRef.c },
          e: { r: endRef.r, c: endRef.c }
        };
        
        // Add to merges array
        sheet['!merges'].push(mergeObj);
      }
      
      // Save file
      const outputPath = saveAs || filePath;
      const writeResult = await writeExcelFile(workbook, outputPath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully merged ${merges.length} cell range(s) in sheet "${targetSheetName}" and saved to "${outputPath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error merging cells: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 10: Auto-fit columns (best estimate based on content length)
server.tool(
  "adjustColumnWidths",
  {
    filePath: z.string().describe("Path to the Excel file"),
    sheetName: z.string().optional().describe("Name of the sheet (defaults to first sheet)"),
    columns: z.array(z.object({
      column: z.string().describe("Column letter (e.g., 'A', 'B')"),
      width: z.number().describe("Width in characters")
    })).describe("Array of column width specifications"),
    saveAs: z.string().optional().describe("Save to a different file path (optional)")
  },
  async ({ filePath, sheetName, columns, saveAs }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Use first sheet if not specified
      const targetSheetName = sheetName || workbook.SheetNames[0];
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(targetSheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${targetSheetName}" not found in workbook.`
          }],
          isError: true
        };
      }
      
      const sheet = workbook.Sheets[targetSheetName];
      
      // Initialize cols array if it doesn't exist
      if (!sheet['!cols']) {
        sheet['!cols'] = [];
      }
      
      // Process each column width specification
      for (const colSpec of columns) {
        const colIndex = XLSX.utils.decode_col(colSpec.column);
        
        // Ensure the cols array is long enough
        while (sheet['!cols'].length <= colIndex) {
          sheet['!cols'].push({ wpx: 64 }); // Default width
        }
        
        // Set column width
        sheet['!cols'][colIndex] = { wch: colSpec.width };
      }
      
      // Save file
      const outputPath = saveAs || filePath;
      const writeResult = await writeExcelFile(workbook, outputPath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully adjusted column widths in sheet "${targetSheetName}" and saved to "${outputPath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error adjusting column widths: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 11: Convert CSV to Excel
server.tool(
  "convertCsvToExcel",
  {
    csvFilePath: z.string().describe("Path to the CSV file"),
    excelFilePath: z.string().describe("Path where the Excel file should be saved"),
    sheetName: z.string().optional().describe("Name for the sheet (defaults to 'Sheet1')"),
    delimiter: z.string().optional().describe("CSV delimiter (defaults to ',')"),
    skipEmptyLines: z.boolean().optional().describe("Skip empty lines (defaults to true)")
  },
  async ({ csvFilePath, excelFilePath, sheetName, delimiter, skipEmptyLines }) => {
    try {
      // Read the CSV file using Node's fs module
      const csvData = await fs.readFile(csvFilePath, { encoding: 'utf8' });
      
      // Parse CSV options
      const parseOptions = {
        header: false,
        delimiter: delimiter || ',',
        skipEmptyLines: skipEmptyLines !== false
      };
      
      // Parse CSV to array of arrays
      const parsedData = XLSX.utils.csv_to_aoa(csvData, parseOptions);
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Create a new worksheet from the parsed data
      const sheet = XLSX.utils.aoa_to_sheet(parsedData);
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName || 'Sheet1');
      
      // Save the workbook
      const writeResult = await writeExcelFile(workbook, excelFilePath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully converted CSV file "${csvFilePath}" to Excel file "${excelFilePath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error converting CSV to Excel: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 12: Convert Excel to CSV
server.tool(
  "convertExcelToCsv",
  {
    filePath: z.string().describe("Path to the Excel file"),
    csvFilePath: z.string().describe("Path where the CSV file should be saved"),
    sheetName: z.string().optional().describe("Name of the sheet to convert (defaults to first sheet)"),
    delimiter: z.string().optional().describe("CSV delimiter (defaults to ',')"),
    includeHeader: z.boolean().optional().describe("Treat first row as header (defaults to true)")
  },
  async ({ filePath, csvFilePath, sheetName, delimiter, includeHeader }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Use first sheet if not specified
      const targetSheetName = sheetName || workbook.SheetNames[0];
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(targetSheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${targetSheetName}" not found in workbook.`
          }],
          isError: true
        };
      }
      
      const sheet = workbook.Sheets[targetSheetName];
      
      // Convert sheet to CSV
      const csvOptions = {
        FS: delimiter || ',',
        blankrows: false
      };
      
      let csvString;
      
      if (includeHeader !== false) {
        // Use sheet_to_csv directly
        csvString = XLSX.utils.sheet_to_csv(sheet, csvOptions);
      } else {
        // Get data as array of arrays and skip first row
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const dataWithoutHeader = data.slice(1);
        
        // Convert back to CSV
        const tempSheet = XLSX.utils.aoa_to_sheet(dataWithoutHeader);
        csvString = XLSX.utils.sheet_to_csv(tempSheet, csvOptions);
      }
      
      // Write CSV to file using Node's fs module
      await fs.writeFile(csvFilePath, csvString, { encoding: 'utf8' });
      return {
        content: [{ 
          type: "text", 
          text: `Successfully converted Excel sheet "${targetSheetName}" to CSV file "${csvFilePath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error converting Excel to CSV: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 13: Add conditional formatting (basic implementation)
server.tool(
  "addConditionalFormatting",
  {
    filePath: z.string().describe("Path to the Excel file"),
    sheetName: z.string().optional().describe("Name of the sheet (defaults to first sheet)"),
    rules: z.array(z.object({
      range: z.string().describe("Cell range to apply formatting (e.g., 'A1:D10')"),
      type: z.enum(['greaterThan', 'lessThan', 'equal', 'between', 'contains']).describe("Type of condition"),
      values: z.array(z.union([z.string(), z.number()])).describe("Values for the condition (one or two values based on type)"),
      format: z.object({
        fillColor: z.string().describe("Background color for matching cells (hex code)")
      }).describe("Format to apply")
    })).describe("Array of conditional formatting rules"),
    saveAs: z.string().optional().describe("Save to a different file path (optional)")
  },
  async ({ filePath, sheetName, rules, saveAs }) => {
    try {
      const { success, workbook, error } = await readExcelFile(filePath);
      
      if (!success) {
        return {
          content: [{ type: "text", text: error }],
          isError: true
        };
      }
      
      // Use first sheet if not specified
      const targetSheetName = sheetName || workbook.SheetNames[0];
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(targetSheetName)) {
        return {
          content: [{ 
            type: "text", 
            text: `Sheet "${targetSheetName}" not found in workbook.`
          }],
          isError: true
        };
      }
      
      const sheet = workbook.Sheets[targetSheetName];
      
      // Process each conditional formatting rule
      for (const rule of rules) {
        // Parse the range
        if (!rule.range.includes(':')) {
          return {
            content: [{ 
              type: "text", 
              text: `Invalid range: "${rule.range}". Must be in format "A1:B2".`
            }],
            isError: true
          };
        }
        
        const [startCell, endCell] = rule.range.split(':').map(ref => ref.toUpperCase());
        const startRef = XLSX.utils.decode_cell(startCell);
        const endRef = XLSX.utils.decode_cell(endCell);
        
        // Ensure the values array has correct number of elements
        if (['between'].includes(rule.type) && rule.values.length !== 2) {
          return {
            content: [{ 
              type: "text", 
              text: `Rule type "${rule.type}" requires exactly 2 values.`
            }],
            isError: true
          };
        } else if (!['between'].includes(rule.type) && rule.values.length !== 1) {
          return {
            content: [{ 
              type: "text", 
              text: `Rule type "${rule.type}" requires exactly 1 value.`
            }],
            isError: true
          };
        }
        
        // Apply conditional formatting by evaluating each cell
        for (let r = startRef.r; r <= endRef.r; r++) {
          for (let c = startRef.c; c <= endRef.c; c++) {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            
            // Skip if cell doesn't exist
            if (!sheet[cellRef]) continue;
            
            const cellValue = sheet[cellRef].v;
            
            // Skip if no value
            if (cellValue === undefined) continue;
            
            let conditionMet = false;
            
            // Evaluate condition
            switch (rule.type) {
              case 'greaterThan':
                conditionMet = cellValue > rule.values[0];
                break;
              case 'lessThan':
                conditionMet = cellValue < rule.values[0];
                break;
              case 'equal':
                conditionMet = cellValue == rule.values[0]; // Use loose equality for flexibility
                break;
              case 'between':
                conditionMet = cellValue >= rule.values[0] && cellValue <= rule.values[1];
                break;
              case 'contains':
                conditionMet = String(cellValue).includes(String(rule.values[0]));
                break;
            }
            
            // Apply formatting if condition is met
            if (conditionMet) {
              if (!sheet[cellRef].s) sheet[cellRef].s = {};
              if (!sheet[cellRef].s.fill) sheet[cellRef].s.fill = {};
              
              sheet[cellRef].s.fill.fgColor = { rgb: rule.format.fillColor };
              sheet[cellRef].s.fill.patternType = 'solid';
            }
          }
        }
      }
      
      // Save file
      const outputPath = saveAs || filePath;
      const writeResult = await writeExcelFile(workbook, outputPath);
      
      if (!writeResult.success) {
        return {
          content: [{ type: "text", text: writeResult.error }],
          isError: true
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully applied ${rules.length} conditional formatting rule(s) to sheet "${targetSheetName}" and saved to "${outputPath}".`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error applying conditional formatting: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
