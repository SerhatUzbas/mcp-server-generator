import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import puppeteer from "puppeteer";

/**
 * BrowserAutomationServer - An MCP server that provides browser automation capabilities
 * Allows Claude to control a web browser based on user instructions
 */
const server = new McpServer({
  name: "BrowserAutomation",
  version: "1.0.0",
  description: "Browser automation tools for Claude to interact with websites"
});

// Global browser instance to be reused across tool calls
let browser;
let page;

// Initialize browser tool
server.tool(
  "initBrowser",
  { headless: z.boolean().optional().default(false) },
  async ({ headless }) => {
    try {
      // Close any existing browser
      if (browser) {
        await browser.close();
      }
      
      // Launch new browser instance
      browser = await puppeteer.launch({ 
        headless: headless ? "new" : false,
        args: ['--no-sandbox']
      });
      
      // Create a new page
      page = await browser.newPage();
      
      return {
        content: [{ 
          type: "text", 
          text: `Browser initialized successfully with headless mode: ${headless}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error initializing browser: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Navigate to URL tool
server.tool(
  "navigateTo",
  { url: z.string().url() },
  async ({ url }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const title = await page.title();
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully navigated to ${url}\nPage title: ${title}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error navigating to ${url}: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Get page content tool
server.tool(
  "getPageContent",
  {},
  async () => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      const content = await page.content();
      const title = await page.title();
      const url = page.url();
      
      // Extract visible text for better readability
      const bodyText = await page.evaluate(() => {
        return document.body.innerText;
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `URL: ${url}\nTitle: ${title}\n\nVisible Text Content:\n${bodyText.slice(0, 5000)}${bodyText.length > 5000 ? '...(truncated)' : ''}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error getting page content: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Click element tool
server.tool(
  "clickElement",
  { 
    selector: z.string(),
    waitForNavigation: z.boolean().optional().default(true)
  },
  async ({ selector, waitForNavigation }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Wait for the element to be visible
      await page.waitForSelector(selector, { visible: true, timeout: 5000 });
      
      if (waitForNavigation) {
        // Setup navigation promise
        const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        
        // Click the element
        await page.click(selector);
        
        // Wait for navigation to complete
        await navigationPromise;
        
        const newUrl = page.url();
        const newTitle = await page.title();
        
        return {
          content: [{ 
            type: "text", 
            text: `Clicked element with selector "${selector}" and navigation completed.\nNew URL: ${newUrl}\nNew title: ${newTitle}` 
          }]
        };
      } else {
        // Just click without waiting for navigation
        await page.click(selector);
        
        return {
          content: [{ 
            type: "text", 
            text: `Clicked element with selector "${selector}" successfully.` 
          }]
        };
      }
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error clicking element with selector "${selector}": ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Type text tool
server.tool(
  "typeText",
  { 
    selector: z.string(),
    text: z.string(),
    clearFirst: z.boolean().optional().default(true)
  },
  async ({ selector, text, clearFirst }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Wait for the element to be visible
      await page.waitForSelector(selector, { visible: true, timeout: 5000 });
      
      if (clearFirst) {
        // Clear the input field first
        await page.evaluate((sel) => {
          document.querySelector(sel).value = '';
        }, selector);
      }
      
      // Type the text
      await page.type(selector, text);
      
      return {
        content: [{ 
          type: "text", 
          text: `Typed "${text}" into element with selector "${selector}".` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error typing text into element with selector "${selector}": ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Take screenshot tool
server.tool(
  "takeScreenshot",
  {},
  async () => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Take screenshot as base64
      const screenshot = await page.screenshot({ encoding: "base64" });
      
      return {
        content: [
          { 
            type: "text", 
            text: "Screenshot captured successfully." 
          },
          {
            type: "image",
            image: {
              data: screenshot,
              mimeType: "image/png"
            }
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error taking screenshot: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Close browser tool
server.tool(
  "closeBrowser",
  {},
  async () => {
    try {
      if (browser) {
        await browser.close();
        browser = null;
        page = null;
        
        return {
          content: [{ 
            type: "text", 
            text: "Browser closed successfully." 
          }]
        };
      } else {
        return {
          content: [{ 
            type: "text", 
            text: "No browser instance to close." 
          }]
        };
      }
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error closing browser: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);
// Extract elements tool
server.tool(
  "extractElements",
  { 
    selector: z.string(),
    attribute: z.string().optional(),
    limit: z.number().int().positive().max(100).optional().default(10)
  },
  async ({ selector, attribute, limit }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Extract elements based on selector
      const elements = await page.evaluate((sel, attr, lmt) => {
        const elems = Array.from(document.querySelectorAll(sel)).slice(0, lmt);
        
        return elems.map(el => {
          // If attribute is specified, get that attribute
          if (attr) {
            return {
              text: el.textContent?.trim() || "",
              attribute: attr,
              value: el.getAttribute(attr) || "",
              tagName: el.tagName
            };
          }
          
          // Otherwise, return the text content and HTML
          return {
            text: el.textContent?.trim() || "",
            html: el.outerHTML,
            tagName: el.tagName
          };
        });
      }, selector, attribute, limit);
      
      return {
        content: [{ 
          type: "text", 
          text: `Found ${elements.length} element(s) matching selector "${selector}":\n\n${JSON.stringify(elements, null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error extracting elements with selector "${selector}": ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Execute JavaScript tool
server.tool(
  "executeJs",
  { 
    code: z.string()
  },
  async ({ code }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Execute the JavaScript in the browser context
      const result = await page.evaluate((jsCode) => {
        // eslint-disable-next-line no-new-func
        const evaluatedResult = new Function(`return (async () => { 
          try { 
            return { result: await (${jsCode}) }; 
          } catch (e) { 
            return { error: e.toString() }; 
          }
        })();`)();
        return evaluatedResult;
      }, code);
      
      if (result.error) {
        return {
          content: [{ 
            type: "text", 
            text: `Error executing JavaScript: ${result.error}` 
          }],
          isError: true
        };
      }
      
      // Handle different result types
      let resultText;
      if (result.result === undefined) {
        resultText = "undefined";
      } else if (result.result === null) {
        resultText = "null";
      } else if (typeof result.result === 'object') {
        try {
          resultText = JSON.stringify(result.result, null, 2);
        } catch (e) {
          resultText = `[Object that cannot be stringified: ${e.message}]`;
        }
      } else {
        resultText = String(result.result);
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `JavaScript execution result:\n\n${resultText}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error executing JavaScript: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Wait for element tool
server.tool(
  "waitForElement",
  { 
    selector: z.string(),
    timeout: z.number().int().positive().max(60000).optional().default(5000),
    visible: z.boolean().optional().default(true)
  },
  async ({ selector, timeout, visible }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Wait for the element
      await page.waitForSelector(selector, { 
        visible: visible,
        timeout: timeout 
      });
      
      // Count the number of matching elements
      const count = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length;
      }, selector);
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully waited for element(s) with selector "${selector}". Found ${count} matching element(s).` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error waiting for element with selector "${selector}": ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Submit form tool
server.tool(
  "submitForm",
  { 
    formSelector: z.string().optional(),
    waitForNavigation: z.boolean().optional().default(true)
  },
  async ({ formSelector, waitForNavigation }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      if (waitForNavigation) {
        // Setup navigation promise
        const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        
        // Submit the form
        if (formSelector) {
          await page.evaluate((selector) => {
            const form = document.querySelector(selector);
            if (form) {
              form.submit();
            } else {
              throw new Error(`Form with selector "${selector}" not found`);
            }
          }, formSelector);
        } else {
          // Submit the form using keyboard
          await page.keyboard.press('Enter');
        }
        
        // Wait for navigation to complete
        await navigationPromise;
        
        const newUrl = page.url();
        const newTitle = await page.title();
        
        return {
          content: [{ 
            type: "text", 
            text: `Form submitted and navigation completed.\nNew URL: ${newUrl}\nNew title: ${newTitle}` 
          }]
        };
      } else {
        // Submit without waiting for navigation
        if (formSelector) {
          await page.evaluate((selector) => {
            const form = document.querySelector(selector);
            if (form) {
              form.submit();
            } else {
              throw new Error(`Form with selector "${selector}" not found`);
            }
          }, formSelector);
        } else {
          // Submit the form using keyboard
          await page.keyboard.press('Enter');
        }
        
        return {
          content: [{ 
            type: "text", 
            text: `Form submitted successfully.` 
          }]
        };
      }
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error submitting form: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Browser status tool
server.tool(
  "browserStatus",
  {},
  async () => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      const url = page.url();
      const title = await page.title();
      const pages = (await browser.pages()).length;
      
      // Get cookies
      const cookies = await page.cookies();
      
      // Check if there are forms
      const formsCount = await page.evaluate(() => {
        return document.querySelectorAll('form').length;
      });
      
      // Check if there are inputs
      const inputsCount = await page.evaluate(() => {
        return document.querySelectorAll('input').length;
      });
      
      // Check viewport size
      const viewport = page.viewport();
      
      return {
        content: [{ 
          type: "text", 
          text: `Browser Status:\n\n` +
                `Current URL: ${url}\n` +
                `Page Title: ${title}\n` +
                `Open Pages: ${pages}\n` +
                `Forms on Page: ${formsCount}\n` +
                `Input Fields on Page: ${inputsCount}\n` +
                `Viewport Size: ${viewport ? `${viewport.width}x${viewport.height}` : 'Unknown'}\n` +
                `Cookies: ${cookies.length} cookies set`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error getting browser status: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);
// Download file tool
server.tool(
  "downloadFile",
  { 
    url: z.string().url(),
    saveAs: z.string().optional()
  },
  async ({ url, saveAs }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Create a new page for downloading
      const downloadPage = await browser.newPage();
      
      // Set up download behavior
      await downloadPage._client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: process.cwd()
      });
      
      // Navigate to the URL
      await downloadPage.goto(url, { waitUntil: 'domcontentloaded' });
      
      // Get filename from URL if not provided
      const filename = saveAs || url.split('/').pop() || 'downloaded_file';
      
      // Wait a bit for the download to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await downloadPage.close();
      
      return {
        content: [{ 
          type: "text", 
          text: `File download initiated from ${url}. File should be saved to ${process.cwd()}/${filename}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error downloading file: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Get all links tool
server.tool(
  "getAllLinks",
  { 
    filterByText: z.string().optional(),
    limit: z.number().int().positive().max(100).optional().default(20)
  },
  async ({ filterByText, limit }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Extract all links
      const links = await page.evaluate((filter, lmt) => {
        const allLinks = Array.from(document.querySelectorAll('a'));
        let filteredLinks = allLinks;
        
        // Apply text filter if provided
        if (filter) {
          const filterLower = filter.toLowerCase();
          filteredLinks = allLinks.filter(link => 
            link.textContent?.toLowerCase().includes(filterLower) || 
            link.href?.toLowerCase().includes(filterLower)
          );
        }
        
        // Extract link information
        return filteredLinks.slice(0, lmt).map(link => ({
          text: link.textContent?.trim() || "",
          href: link.href,
          title: link.title || "",
          id: link.id || "",
          classes: link.className || ""
        }));
      }, filterByText, limit);
      
      return {
        content: [{ 
          type: "text", 
          text: `Found ${links.length} link(s)${filterByText ? ` matching "${filterByText}"` : ''}:\n\n${JSON.stringify(links, null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error extracting links: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Set viewport size tool
server.tool(
  "setViewport",
  { 
    width: z.number().int().positive().max(3840),
    height: z.number().int().positive().max(2160),
    deviceScaleFactor: z.number().positive().max(3).optional().default(1),
    isMobile: z.boolean().optional().default(false)
  },
  async ({ width, height, deviceScaleFactor, isMobile }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Set viewport size
      await page.setViewport({
        width,
        height,
        deviceScaleFactor,
        isMobile
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Viewport set to ${width}x${height} with scale factor ${deviceScaleFactor} and mobile mode ${isMobile}.` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error setting viewport: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Natural language task tool - This is the main tool for human-like instructions
server.tool(
  "performTask",
  { 
    instruction: z.string()
  },
  async ({ instruction }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Get the current page state to help with task analysis
      const url = page.url();
      const title = await page.title();
      
      // Get basic page structure to understand the context
      const pageStructure = await page.evaluate(() => {
        const forms = document.querySelectorAll('form').length;
        const inputs = document.querySelectorAll('input').length;
        const buttons = document.querySelectorAll('button').length;
        const links = document.querySelectorAll('a').length;
        
        return { forms, inputs, buttons, links };
      });
      
      // Start with a basic acknowledgment
      let resultText = `Task received: "${instruction}"\n\n`;
      resultText += `Current context: URL = ${url}, Title = ${title}\n`;
      resultText += `Page contains: ${pageStructure.forms} forms, ${pageStructure.inputs} inputs, ${pageStructure.buttons} buttons, ${pageStructure.links} links\n\n`;
      
      // Add planning information
      resultText += "Claude should analyze this task and break it down into a sequence of browser automation actions. ";
      resultText += "For each step, Claude can use the appropriate tools like navigateTo, clickElement, typeText, etc. ";
      resultText += "Claude will need to determine CSS selectors for interacting with elements.\n\n";
      
      resultText += "Example approach for a login task:\n";
      resultText += "1. Find the login form and input fields using appropriate selectors\n";
      resultText += "2. Use typeText for username/password fields\n";
      resultText += "3. Use clickElement or submitForm to submit\n\n";
      
      resultText += "Claude, please handle this instruction step by step.";
      
      return {
        content: [{ 
          type: "text", 
          text: resultText
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error performing task: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Open new tab tool
server.tool(
  "openNewTab",
  { 
    url: z.string().url().optional()
  },
  async ({ url }) => {
    try {
      if (!browser) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Create a new page/tab
      const newPage = await browser.newPage();
      
      // Navigate to URL if provided
      if (url) {
        await newPage.goto(url, { waitUntil: "domcontentloaded" });
        const title = await newPage.title();
        
        // Set this as the active page
        page = newPage;
        
        return {
          content: [{ 
            type: "text", 
            text: `Opened new tab and navigated to ${url}\nPage title: ${title}` 
          }]
        };
      } else {
        // Just open a blank page
        page = newPage;
        
        return {
          content: [{ 
            type: "text", 
            text: `Opened new blank tab. Ready for navigation.` 
          }]
        };
      }
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error opening new tab: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);
// Tab management tools
server.tool(
  "listTabs",
  {},
  async () => {
    try {
      if (!browser) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Get all pages/tabs
      const pages = await browser.pages();
      
      // Collect information about each tab
      const tabsInfo = await Promise.all(pages.map(async (p, index) => {
        try {
          const url = p.url();
          const title = await p.title().catch(() => "Unknown");
          const isCurrent = p === page;
          
          return {
            index,
            url,
            title,
            isCurrent
          };
        } catch (err) {
          return {
            index,
            url: "Unknown",
            title: "Error retrieving tab info",
            isCurrent: p === page
          };
        }
      }));
      
      return {
        content: [{ 
          type: "text", 
          text: `Browser Tabs (${pages.length} total):\n\n${JSON.stringify(tabsInfo, null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error listing tabs: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "switchToTab",
  { 
    tabIndex: z.number().int().nonnegative()
  },
  async ({ tabIndex }) => {
    try {
      if (!browser) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Get all pages
      const pages = await browser.pages();
      
      if (tabIndex >= pages.length) {
        return {
          content: [{ 
            type: "text", 
            text: `Error: Tab index ${tabIndex} is out of range. There are ${pages.length} tabs available.` 
          }],
          isError: true
        };
      }
      
      // Set the active page
      page = pages[tabIndex];
      
      // Bring the tab to front
      await page.bringToFront();
      
      const url = page.url();
      const title = await page.title();
      
      return {
        content: [{ 
          type: "text", 
          text: `Switched to tab ${tabIndex}.\nURL: ${url}\nTitle: ${title}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error switching tabs: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "closeTab",
  { 
    tabIndex: z.number().int().nonnegative().optional()
  },
  async ({ tabIndex }) => {
    try {
      if (!browser) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Get all pages
      const pages = await browser.pages();
      
      if (pages.length <= 1) {
        return {
          content: [{ 
            type: "text", 
            text: "Cannot close the last tab. Use closeBrowser instead." 
          }],
          isError: true
        };
      }
      
      // If tabIndex is not provided, close the current tab
      const targetIndex = tabIndex !== undefined ? tabIndex : pages.indexOf(page);
      
      if (targetIndex < 0 || targetIndex >= pages.length) {
        return {
          content: [{ 
            type: "text", 
            text: `Error: Tab index ${targetIndex} is out of range. There are ${pages.length} tabs available.` 
          }],
          isError: true
        };
      }
      
      const targetPage = pages[targetIndex];
      const url = targetPage.url();
      const title = await targetPage.title().catch(() => "Unknown");
      
      // If we're closing the current tab, switch to another tab first
      if (targetPage === page) {
        const newActiveIndex = targetIndex === 0 ? 1 : targetIndex - 1;
        page = pages[newActiveIndex];
        await page.bringToFront();
      }
      
      // Close the tab
      await targetPage.close();
      
      return {
        content: [{ 
          type: "text", 
          text: `Closed tab ${targetIndex} (${title} - ${url}).${targetPage === page ? " Switched to another tab." : ""}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error closing tab: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Web scraping tools
server.tool(
  "scrapeTable",
  { 
    selector: z.string().optional().default("table"),
    includeHeaders: z.boolean().optional().default(true)
  },
  async ({ selector, includeHeaders }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Extract table data
      const tables = await page.evaluate((sel, headers) => {
        const tables = Array.from(document.querySelectorAll(sel));
        
        return tables.map((table, tableIndex) => {
          // Get all rows
          const rows = Array.from(table.querySelectorAll('tr'));
          
          // Handle empty tables
          if (rows.length === 0) {
            return {
              tableIndex,
              headers: [],
              data: []
            };
          }
          
          // Get header row if it exists
          let headerRow = [];
          let dataRows = rows;
          
          // Assume first row is header if it has th elements or if includeHeaders is true
          const firstRowHasTh = rows[0].querySelectorAll('th').length > 0;
          if (firstRowHasTh || headers) {
            const headerCells = rows[0].querySelectorAll(firstRowHasTh ? 'th' : 'td');
            headerRow = Array.from(headerCells).map(cell => cell.textContent.trim());
            dataRows = rows.slice(1);
          }
          
          // Extract data rows
          const data = dataRows.map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            return cells.map(cell => cell.textContent.trim());
          });
          
          return {
            tableIndex,
            headers: headerRow,
            data
          };
        });
      }, selector, includeHeaders);
      
      if (tables.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No tables found matching selector "${selector}".` 
          }]
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Found ${tables.length} tables:\n\n${JSON.stringify(tables, null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error scraping tables: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "scrapeLists",
  { 
    selector: z.string().optional().default("ul, ol")
  },
  async ({ selector }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Extract list data
      const lists = await page.evaluate((sel) => {
        const lists = Array.from(document.querySelectorAll(sel));
        
        return lists.map((list, listIndex) => {
          const listType = list.tagName.toLowerCase();
          const items = Array.from(list.querySelectorAll('li')).map(item => item.textContent.trim());
          
          return {
            listIndex,
            listType,
            items
          };
        });
      }, selector);
      
      if (lists.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No lists found matching selector "${selector}".` 
          }]
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Found ${lists.length} lists:\n\n${JSON.stringify(lists, null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error scraping lists: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Form detection and auto-fill tools
server.tool(
  "detectForms",
  {},
  async () => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Detect forms and their fields
      const forms = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('form')).map((form, formIndex) => {
          // Get form attributes
          const formAttr = {
            id: form.id || '',
            name: form.getAttribute('name') || '',
            action: form.action || '',
            method: form.method || 'get',
            selector: `form${form.id ? `#${form.id}` : formIndex === 0 ? '' : `:nth-of-type(${formIndex + 1})`}`
          };
          
          // Get input fields
          const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map((input, inputIndex) => {
            const inputType = input.tagName.toLowerCase() === 'input' ? input.type : input.tagName.toLowerCase();
            
            return {
              name: input.name || '',
              id: input.id || '',
              type: inputType,
              placeholder: input.placeholder || '',
              value: input.value || '',
              required: input.required || false,
              selector: input.id ? `#${input.id}` : `${formAttr.selector} ${input.tagName.toLowerCase()}${input.name ? `[name="${input.name}"]` : `:nth-of-type(${inputIndex + 1})`}`
            };
          });
          
          // Get submit buttons
          const submitButtons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]')).map((button, buttonIndex) => {
            return {
              type: button.tagName.toLowerCase(),
              text: button.tagName.toLowerCase() === 'button' ? button.textContent.trim() : button.value,
              id: button.id || '',
              selector: button.id ? `#${button.id}` : `${formAttr.selector} ${button.tagName.toLowerCase()}[type="submit"]:nth-of-type(${buttonIndex + 1})`
            };
          });
          
          return {
            ...formAttr,
            inputs,
            submitButtons
          };
        });
      });
      
      if (forms.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: "No forms detected on the current page." 
          }]
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Detected ${forms.length} form(s) on the page:\n\n${JSON.stringify(forms, null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error detecting forms: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "fillForm",
  { 
    formSelector: z.string(),
    fieldValues: z.record(z.string(), z.string()),
    submit: z.boolean().optional().default(false)
  },
  async ({ formSelector, fieldValues, submit }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Fill the form fields
      const result = await page.evaluate((selector, values) => {
        const form = document.querySelector(selector);
        if (!form) {
          return { success: false, error: `Form with selector "${selector}" not found` };
        }
        
        const fieldResults = [];
        
        // Process each field
        for (const [fieldName, value] of Object.entries(values)) {
          // Try to find field by name, id, or placeholder
          let field = form.querySelector(`[name="${fieldName}"]`) || 
                      form.querySelector(`#${fieldName}`) || 
                      form.querySelector(`[placeholder="${fieldName}"]`);
          
          if (!field) {
            // Try to find by label text
            const labels = Array.from(form.querySelectorAll('label'));
            for (const label of labels) {
              if (label.textContent.trim().toLowerCase().includes(fieldName.toLowerCase())) {
                const forAttr = label.getAttribute('for');
                if (forAttr) {
                  field = form.querySelector(`#${forAttr}`);
                  if (field) break;
                }
              }
            }
          }
          
          if (!field) {
            fieldResults.push({ field: fieldName, success: false, error: 'Field not found' });
            continue;
          }
          
          // Handle different field types
          const tagName = field.tagName.toLowerCase();
          const fieldType = tagName === 'input' ? field.type.toLowerCase() : tagName;
          
          try {
            switch (fieldType) {
              case 'text':
              case 'email':
              case 'password':
              case 'number':
              case 'tel':
              case 'url':
              case 'search':
              case 'textarea':
                field.value = value;
                break;
                
              case 'checkbox':
                field.checked = value.toLowerCase() === 'true' || value === '1';
                break;
                
              case 'radio':
                const radioButtons = form.querySelectorAll(`input[type="radio"][name="${field.name}"]`);
                for (const radio of radioButtons) {
                  if (radio.value === value || radio.id === value || radio.id.toLowerCase() === value.toLowerCase()) {
                    radio.checked = true;
                    break;
                  }
                }
                break;
                
              case 'select':
                const options = Array.from(field.options);
                for (const option of options) {
                  if (option.value === value || option.text === value) {
                    field.value = option.value;
                    break;
                  }
                }
                break;
                
              default:
                field.value = value;
            }
            
            // Trigger change event
            const event = new Event('change', { bubbles: true });
            field.dispatchEvent(event);
            
            fieldResults.push({ field: fieldName, success: true });
          } catch (err) {
            fieldResults.push({ field: fieldName, success: false, error: err.toString() });
          }
        }
        
        return { success: true, fields: fieldResults };
      }, formSelector, fieldValues);
      
      if (!result.success) {
        return {
          content: [{ 
            type: "text", 
            text: `Error filling form: ${result.error}` 
          }],
          isError: true
        };
      }
      
      // Submit the form if requested
      if (submit) {
        await page.evaluate((selector) => {
          const form = document.querySelector(selector);
          const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
          
          if (submitButton) {
            submitButton.click();
          } else {
            form.submit();
          }
        }, formSelector);
        
        // Wait for navigation to complete
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {
          // Some forms don't navigate, so ignore timeout errors
        });
        
        const newUrl = page.url();
        const newTitle = await page.title();
        
        return {
          content: [{ 
            type: "text", 
            text: `Form filled with ${Object.keys(fieldValues).length} field(s) and submitted.\n` +
                  `Field results: ${JSON.stringify(result.fields, null, 2)}\n` +
                  `Current URL: ${newUrl}\nTitle: ${newTitle}` 
          }]
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Form filled with ${Object.keys(fieldValues).length} field(s).\n` +
                `Field results: ${JSON.stringify(result.fields, null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error filling form: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Element highlighting tool
server.tool(
  "highlightElement",
  { 
    selector: z.string(),
    duration: z.number().int().positive().max(10000).optional().default(2000)
  },
  async ({ selector, duration }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Highlight the element
      const result = await page.evaluate((sel, dur) => {
        const elements = document.querySelectorAll(sel);
        if (elements.length === 0) {
          return { success: false, error: `No elements found with selector "${sel}"` };
        }
        
        // Store original styles
        const originalStyles = [];
        
        // Apply highlight style
        for (const element of elements) {
          originalStyles.push({
            outline: element.style.outline,
            boxShadow: element.style.boxShadow,
            backgroundColor: element.style.backgroundColor
          });
          
          element.style.outline = '2px solid red';
          element.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.8)';
          
          // Only change background for non-input elements to avoid breaking forms
          if (!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName)) {
            element.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
          }
        }
        
        // Restore original styles after duration
        setTimeout(() => {
          for (let i = 0; i < elements.length; i++) {
            elements[i].style.outline = originalStyles[i].outline;
            elements[i].style.boxShadow = originalStyles[i].boxShadow;
            elements[i].style.backgroundColor = originalStyles[i].backgroundColor;
          }
        }, dur);
        
        return { success: true, count: elements.length };
      }, selector, duration);
      
      if (!result.success) {
        return {
          content: [{ 
            type: "text", 
            text: result.error 
          }],
          isError: true
        };
      }
      
      // Take a screenshot to show the highlighted element
      const screenshot = await page.screenshot({ encoding: "base64" });
      
      return {
        content: [
          { 
            type: "text", 
            text: `Highlighted ${result.count} element(s) matching selector "${selector}" for ${duration}ms.` 
          },
          {
            type: "image",
            image: {
              data: screenshot,
              mimeType: "image/png"
            }
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error highlighting element: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Keyboard shortcuts and special keys
server.tool(
  "pressKey",
  { 
    key: z.string(),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).optional()
  },
  async ({ key, modifiers = [] }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      // Map of special key names to their Puppeteer key codes
      const specialKeys = {
        'enter': 'Enter',
        'return': 'Enter',
        'tab': 'Tab',
        'escape': 'Escape',
        'esc': 'Escape',
        'up': 'ArrowUp',
        'down': 'ArrowDown',
        'left': 'ArrowLeft',
        'right': 'ArrowRight',
        'backspace': 'Backspace',
        'delete': 'Delete',
        'home': 'Home',
        'end': 'End',
        'pageup': 'PageUp',
        'pagedown': 'PageDown',
        'f1': 'F1',
        'f2': 'F2',
        'f3': 'F3',
        'f4': 'F4',
        'f5': 'F5',
        'f6': 'F6',
        'f7': 'F7',
        'f8': 'F8',
        'f9': 'F9',
        'f10': 'F10',
        'f11': 'F11',
        'f12': 'F12',
        'space': ' '
      };
      
      // Normalize the key
      const normalizedKey = specialKeys[key.toLowerCase()] || key;
      
      // Apply modifiers
      const modifierOptions = {
        alt: modifiers.includes('Alt'),
        control: modifiers.includes('Control'),
        meta: modifiers.includes('Meta'),
        shift: modifiers.includes('Shift')
      };
      
      // Press the key with modifiers
      await page.keyboard.press(normalizedKey, modifierOptions);
      
      // Format the modifier string for output
      let modifierStr = '';
      if (modifiers.length > 0) {
        modifierStr = modifiers.join('+') + '+';
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Pressed ${modifierStr}${normalizedKey} key.` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error pressing key: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Enhanced screenshot tool with element selector option
server.tool(
  "takeScreenshotOf",
  { 
    selector: z.string().optional(),
    fullPage: z.boolean().optional().default(false)
  },
  async ({ selector, fullPage }) => {
    try {
      if (!browser || !page) {
        return {
          content: [{ 
            type: "text", 
            text: "Browser not initialized. Please call initBrowser first." 
          }],
          isError: true
        };
      }
      
      let screenshot;
      
      if (selector) {
        // Wait for the element to be visible
        try {
          await page.waitForSelector(selector, { visible: true, timeout: 5000 });
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Element with selector "${selector}" not found or not visible.` 
            }],
            isError: true
          };
        }
        
        // Get the element and take a screenshot of it
        const elementHandle = await page.$(selector);
        if (!elementHandle) {
          return {
            content: [{ 
              type: "text", 
              text: `Element with selector "${selector}" not found.` 
            }],
            isError: true
          };
        }
        
        screenshot = await elementHandle.screenshot({ encoding: "base64" });
      } else {
        // Take screenshot of the entire page or viewport
        screenshot = await page.screenshot({ 
          encoding: "base64",
          fullPage: fullPage
        });
      }
      
      return {
        content: [
          { 
            type: "text", 
            text: selector 
              ? `Screenshot taken of element with selector "${selector}".` 
              : `Screenshot taken of ${fullPage ? 'full page' : 'viewport'}.` 
          },
          {
            type: "image",
            image: {
              data: screenshot,
              mimeType: "image/png"
            }
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error taking screenshot: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);




// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

// Clean up resources when the process exits
process.on('exit', async () => {
  if (browser) {
    await browser.close();
  }
});
