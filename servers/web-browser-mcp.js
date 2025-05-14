import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import puppeteer from "puppeteer";

// Create the MCP server
const server = new McpServer({
  name: "web-browser-mcp",
  version: "1.0.0",
  description: "An MCP server that performs web browsing tasks using Puppeteer"
});

// Global browser instance to reuse
let browser;
let currentPage;

// Initialize browser with optional headless mode
async function getBrowser() {
  if (!browser) {
    console.log("Launching browser...");
    browser = await puppeteer.launch({ 
      headless: false, // Default to visible browser window
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log("Browser launched successfully");
  }
  return browser;
}

// Get the current page or create a new one
async function getPage() {
  const activeBrowser = await getBrowser();
  if (!currentPage) {
    console.log("Creating new page...");
    currentPage = await activeBrowser.newPage();
    await currentPage.setViewport({ width: 1280, height: 800 });
  }
  return currentPage;
}

// Clean up resources when done
process.on('exit', async () => {
  if (browser) {
    await browser.close();
  }
});

// Tool to navigate to a URL
server.tool(
  "browse",
  {
    url: z.string().url("Please provide a valid URL including http:// or https://"),
    headless: z.boolean().optional()
  },
  async ({ url, headless }) => {
    try {
      // If headless mode was specified, restart browser with that setting
      if (headless !== undefined) {
        // Close existing browser if it exists
        if (browser) {
          console.log("Closing existing browser...");
          await browser.close();
          browser = null;
          currentPage = null;
        }
        
        // Launch new browser with specified headless setting
        console.log(`Launching browser in ${headless ? "headless" : "visible"} mode...`);
        browser = await puppeteer.launch({ 
          headless: headless,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      }
      
      const page = await getPage();
      console.log(`Navigating to ${url}...`);
      
      await page.goto(url, { waitUntil: "networkidle2" });
      const title = await page.title();
      const content = await page.content();
      
      // Extract visible text for a better summary
      const visibleText = await page.evaluate(() => {
        return document.body.innerText.slice(0, 2000) + (document.body.innerText.length > 2000 ? "..." : "");
      });
      
      // Take a screenshot
      const screenshot = await page.screenshot({ encoding: "base64" });
      
      return {
        content: [
          { type: "text", text: `Successfully loaded: ${title}\n\nPage content summary:\n${visibleText}` },
          { type: "image", src: `data:image/png;base64,${screenshot}` }
        ]
      };
    } catch (error) {
      console.error("Error during browsing:", error);
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to search for something on the current page
server.tool(
  "searchPage",
  {
    query: z.string().min(1, "Search query cannot be empty")
  },
  async ({ query }) => {
    try {
      const page = await getPage();
      
      const searchResults = await page.evaluate((searchQuery) => {
        // A simple function to find text in the page and highlight the context
        const findTextInPage = (searchText) => {
          searchText = searchText.toLowerCase();
          const bodyText = document.body.innerText.toLowerCase();
          const results = [];
          
          if (bodyText.includes(searchText)) {
            // Find all text nodes that contain the search text
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            
            let node;
            while ((node = walker.nextNode())) {
              const nodeText = node.nodeValue.toLowerCase();
              if (nodeText.includes(searchText)) {
                // Get some context around the found text
                const contextStart = Math.max(0, nodeText.indexOf(searchText) - 50);
                const contextEnd = Math.min(nodeText.length, nodeText.indexOf(searchText) + searchText.length + 50);
                let context = nodeText.substring(contextStart, contextEnd);
                
                // Add ellipsis if we trimmed the text
                if (contextStart > 0) context = "..." + context;
                if (contextEnd < nodeText.length) context = context + "...";
                
                // Add the result with its nearest heading for context
                let parentElement = node.parentElement;
                let headingContext = "";
                
                // Try to find the nearest heading
                while (parentElement && !headingContext) {
                  // Check if this element is a heading or has a heading child
                  const headings = parentElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
                  if (headings.length > 0) {
                    headingContext = headings[0].innerText;
                  }
                  parentElement = parentElement.parentElement;
                }
                
                results.push({
                  context: context,
                  heading: headingContext || "No heading found"
                });
                
                if (results.length >= 5) break; // Limit to 5 results
              }
            }
          }
          
          return results;
        };
        
        return findTextInPage(searchQuery);
      }, query);
      
      if (searchResults.length === 0) {
        return {
          content: [{ type: "text", text: `No results found for "${query}" on the current page.` }]
        };
      }
      
      // Format the search results
      const formattedResults = searchResults.map((result, index) => 
        `Result ${index + 1} (Section: ${result.heading}):\n${result.context}`
      ).join("\n\n");
      
      return {
        content: [{ 
          type: "text", 
          text: `Found ${searchResults.length} matches for "${query}" on the current page:\n\n${formattedResults}` 
        }]
      };
    } catch (error) {
      console.error("Error during page search:", error);
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to click a link or button on the page
server.tool(
  "clickElement",
  {
    text: z.string().min(1, "Element text cannot be empty"),
    elementType: z.enum(["link", "button", "any"]).default("any")
  },
  async ({ text, elementType }) => {
    try {
      const page = await getPage();
      
      // Find and click the element
      const clicked = await page.evaluate(async (targetText, targetType) => {
        // Helper function to check if element is visible
        const isVisible = (element) => {
          const style = window.getComputedStyle(element);
          return style && 
                 style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 element.offsetWidth > 0 &&
                 element.offsetHeight > 0;
        };
        
        // Search for elements containing the text
        const allElements = document.querySelectorAll(
          targetType === "link" ? 'a' : 
          targetType === "button" ? 'button, input[type="button"], input[type="submit"]' : 
          'a, button, input[type="button"], input[type="submit"], [role="button"], [onclick]'
        );
        
        let matchingElements = [];
        
        for (const element of allElements) {
          if (isVisible(element) && 
              (element.innerText.includes(targetText) || 
               element.textContent.includes(targetText) ||
               element.value?.includes(targetText) ||
               element.getAttribute('aria-label')?.includes(targetText))) {
            matchingElements.push({
              element,
              text: element.innerText || element.textContent || element.value || element.getAttribute('aria-label')
            });
          }
        }
        
        if (matchingElements.length === 0) {
          return { success: false, message: `No visible ${targetType} elements containing "${targetText}" found` };
        }
        
        // Sort by closest match (shortest containing the text)
        matchingElements.sort((a, b) => a.text.length - b.text.length);
        
        try {
          matchingElements[0].element.click();
          return { 
            success: true, 
            message: `Clicked on ${targetType === "any" ? "element" : targetType}: "${matchingElements[0].text}"` 
          };
        } catch (err) {
          return { success: false, message: `Found element but failed to click: ${err}` };
        }
      }, text, elementType);
      
      if (!clicked.success) {
        return {
          content: [{ type: "text", text: clicked.message }],
          isError: true
        };
      }
      
      // Wait for navigation if it occurs
      try {
        await page.waitForNavigation({ timeout: 5000 });
      } catch (e) {
        // Ignore timeout - the click might not have caused navigation
      }
      
      // Take a screenshot after click
      const screenshot = await page.screenshot({ encoding: "base64" });
      const title = await page.title();
      
      return {
        content: [
          { type: "text", text: `${clicked.message}\nCurrent page: ${title}` },
          { type: "image", src: `data:image/png;base64,${screenshot}` }
        ]
      };
    } catch (error) {
      console.error("Error during element click:", error);
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to fill a form field
server.tool(
  "fillForm",
  {
    fieldIdentifier: z.string().min(1, "Field identifier cannot be empty"),
    value: z.string(),
    identifierType: z.enum(["label", "placeholder", "name", "id"]).default("label")
  },
  async ({ fieldIdentifier, value, identifierType }) => {
    try {
      const page = await getPage();
      
      const result = await page.evaluate(async (identifier, inputValue, idType) => {
        // Find the form field based on the identifier type
        let element = null;
        
        if (idType === "label") {
          // Find by label text
          const labels = Array.from(document.querySelectorAll('label'));
          const label = labels.find(l => l.innerText.includes(identifier) || l.textContent.includes(identifier));
          
          if (label) {
            // Try to find the input using for attribute
            if (label.htmlFor) {
              element = document.getElementById(label.htmlFor);
            }
            
            // If not found by ID, check if input is a child of label
            if (!element) {
              element = label.querySelector('input, textarea, select');
            }
            
            // Last resort: find closest input
            if (!element) {
              const labelParent = label.parentElement;
              element = labelParent.querySelector('input, textarea, select');
            }
          }
        } else if (idType === "placeholder") {
          // Find by placeholder text
          element = document.querySelector(`input[placeholder*="${identifier}"], textarea[placeholder*="${identifier}"]`);
        } else if (idType === "name") {
          // Find by name attribute
          element = document.querySelector(`[name="${identifier}"]`);
        } else if (idType === "id") {
          // Find by id attribute
          element = document.getElementById(identifier);
        }
        
        if (!element) {
          return { success: false, message: `Could not find field matching "${identifier}" (by ${idType})` };
        }
        
        // Determine the type of element
        if (element.tagName.toLowerCase() === 'select') {
          // Handle dropdown lists
          const options = Array.from(element.options);
          const option = options.find(opt => opt.text.includes(inputValue) || inputValue === opt.value);
          
          if (option) {
            element.value = option.value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, message: `Selected option "${option.text}" in dropdown` };
          } else {
            return { success: false, message: `Could not find option matching "${inputValue}" in dropdown` };
          }
        } else {
          // Handle text inputs, textareas, etc.
          element.value = inputValue;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, message: `Filled "${identifier}" field with "${inputValue}"` };
        }
      }, fieldIdentifier, value, identifierType);
      
      if (!result.success) {
        return {
          content: [{ type: "text", text: result.message }],
          isError: true
        };
      }
      
      return {
        content: [{ type: "text", text: result.message }]
      };
    } catch (error) {
      console.error("Error filling form:", error);
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to take a screenshot of the current page
server.tool(
  "screenshot",
  {
    fullPage: z.boolean().default(false)
  },
  async ({ fullPage }) => {
    try {
      const page = await getPage();
      const screenshot = await page.screenshot({ 
        encoding: "base64",
        fullPage: fullPage
      });
      
      return {
        content: [
          { type: "text", text: `Screenshot captured${fullPage ? ' (full page)' : ''}:` },
          { type: "image", src: `data:image/png;base64,${screenshot}` }
        ]
      };
    } catch (error) {
      console.error("Error taking screenshot:", error);
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool to extract structured data from the page
server.tool(
  "extractData",
  {
    dataType: z.enum(["links", "images", "table", "list", "headings"]),
    selector: z.string().optional()
  },
  async ({ dataType, selector }) => {
    try {
      const page = await getPage();
      
      let data;
      switch (dataType) {
        case "links":
          data = await page.evaluate((customSelector) => {
            const links = Array.from(document.querySelectorAll(customSelector || 'a[href]'));
            return links.slice(0, 20).map(link => ({
              text: link.innerText.trim() || link.getAttribute('aria-label') || '[No text]',
              href: link.href
            })).filter(link => link.text && link.text !== '[No text]');
          }, selector);
          break;
          
        case "images":
          data = await page.evaluate((customSelector) => {
            const images = Array.from(document.querySelectorAll(customSelector || 'img'));
            return images.slice(0, 15).map(img => ({
              alt: img.alt || '[No description]',
              src: img.src,
              dimensions: `${img.width}x${img.height}`
            }));
          }, selector);
          break;
          
        case "table":
          data = await page.evaluate((customSelector) => {
            const table = document.querySelector(customSelector || 'table');
            if (!table) return null;
            
            const rows = Array.from(table.querySelectorAll('tr'));
            
            // Extract headers
            let headers = [];
            const headerRow = rows[0]?.querySelectorAll('th');
            if (headerRow && headerRow.length > 0) {
              headers = Array.from(headerRow).map(th => th.innerText.trim());
            } else {
              // Try to use first row as header if no <th> elements
              const firstRow = rows[0]?.querySelectorAll('td');
              if (firstRow) {
                headers = Array.from(firstRow).map(td => td.innerText.trim());
                rows.shift(); // Remove first row as we're using it for headers
              }
            }
            
            // Extract data
            const tableData = rows.slice(0, 10).map(row => {
              const cells = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
              return cells;
            });
            
            return { headers, data: tableData };
          }, selector);
          break;
          
        case "list":
          data = await page.evaluate((customSelector) => {
            const list = document.querySelector(customSelector || 'ul, ol');
            if (!list) return null;
            
            const items = Array.from(list.querySelectorAll('li')).slice(0, 15);
            return items.map(item => item.innerText.trim());
          }, selector);
          break;
          
        case "headings":
          data = await page.evaluate((customSelector) => {
            const headings = Array.from(document.querySelectorAll(customSelector || 'h1, h2, h3, h4, h5, h6')).slice(0, 20);
            return headings.map(heading => ({
              level: parseInt(heading.tagName.substring(1)),
              text: heading.innerText.trim()
            }));
          }, selector);
          break;
      }
      
      if (!data || (Array.isArray(data) && data.length === 0)) {
        return {
          content: [{ type: "text", text: `No ${dataType} found on the page${selector ? ` matching selector: ${selector}` : ''}` }]
        };
      }
      
      return {
        content: [{ type: "text", text: `Extracted ${dataType} from page:\n\n${JSON.stringify(data, null, 2)}` }]
      };
    } catch (error) {
      console.error(`Error extracting ${dataType}:`, error);
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);
// Tool to toggle headless mode
server.tool(
  "toggleHeadless",
  {
    headless: z.boolean().default(false)
  },
  async ({ headless }) => {
    try {
      // Close existing browser if it exists
      if (browser) {
        console.log("Closing existing browser...");
        await browser.close();
        browser = null;
        currentPage = null;
      }
      
      // Launch new browser with specified headless setting
      console.log(`Launching browser in ${headless ? "headless" : "visible"} mode...`);
      browser = await puppeteer.launch({ 
        headless: headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      // Create a new page
      currentPage = await browser.newPage();
      await currentPage.setViewport({ width: 1280, height: 800 });
      
      return {
        content: [{ 
          type: "text", 
          text: `Browser restarted in ${headless ? "headless" : "visible"} mode` 
        }]
      };
    } catch (error) {
      console.error("Error toggling headless mode:", error);
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
