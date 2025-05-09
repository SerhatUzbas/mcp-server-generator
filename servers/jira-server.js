import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false,
});

// Validate that required environment variables are set
const validateEnvVars = () => {
  const requiredVars = ["JIRA_BASE_URL", "JIRA_API_TOKEN", "JIRA_EMAIL"];
  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }

  return {
    baseUrl: process.env.JIRA_BASE_URL,
    apiToken: process.env.JIRA_API_TOKEN,
    email: process.env.JIRA_EMAIL,
  };
};

// Create an MCP server
const server = new McpServer({
  name: "jira-server",
  version: "1.0.0",
  description: "MCP server for interacting with Jira",
});

// Helper function to make authenticated requests to Jira API
const jiraRequest = async (endpoint, method = "GET", body = null) => {
  const { baseUrl, apiToken, email } = validateEnvVars();

  const authString = Buffer.from(`${email}:${apiToken}`).toString("base64");

  const options = {
    method,
    headers: {
      Authorization: `Basic ${authString}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const url = `${baseUrl}/rest/api/3${endpoint}`;

  try {
    const response = await fetch(url, { ...options, agent });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) {
      return { success: true };
    }

    return await response.json();
  } catch (error) {
    console.error(`Error calling Jira API: ${error.message}`);
    throw error;
  }
};

// Convert Jira's Atlassian Document Format to plain text
const adfToPlainText = (content) => {
  if (!content) return "";

  try {
    let result = "";

    // Handle different content types
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content.map((item) => adfToPlainText(item)).join("\n");
    }

    if (content.type === "doc") {
      return adfToPlainText(content.content);
    }

    if (content.type === "paragraph") {
      return adfToPlainText(content.content) + "\n";
    }

    if (content.type === "text") {
      return content.text || "";
    }

    if (content.type === "bulletList" || content.type === "orderedList") {
      return adfToPlainText(content.content);
    }

    if (content.type === "listItem") {
      return "- " + adfToPlainText(content.content);
    }

    if (content.type === "heading") {
      const level = content.attrs?.level || 1;
      const prefix = "#".repeat(level) + " ";
      return prefix + adfToPlainText(content.content) + "\n";
    }

    if (content.type === "codeBlock") {
      return "```\n" + adfToPlainText(content.content) + "\n```\n";
    }

    if (content.type === "blockquote") {
      return "> " + adfToPlainText(content.content) + "\n";
    }

    if (content.content) {
      return adfToPlainText(content.content);
    }

    return "";
  } catch (error) {
    console.error("Error converting ADF to plain text:", error);
    return JSON.stringify(content);
  }
};

// Format an issue for display
const formatIssue = (issue) => {
  try {
    let result = `Key: ${issue.key}\n`;
    result += `Type: ${issue.fields.issuetype.name}\n`;
    result += `Status: ${issue.fields.status.name}\n`;
    result += `Summary: ${issue.fields.summary}\n`;

    if (issue.fields.assignee) {
      result += `Assignee: ${issue.fields.assignee.displayName} (${issue.fields.assignee.emailAddress})\n`;
    } else {
      result += `Assignee: Unassigned\n`;
    }

    if (issue.fields.reporter) {
      result += `Reporter: ${issue.fields.reporter.displayName} (${issue.fields.reporter.emailAddress})\n`;
    }

    result += `Created: ${issue.fields.created}\n`;
    result += `Updated: ${issue.fields.updated}\n`;

    if (issue.fields.priority) {
      result += `Priority: ${issue.fields.priority.name}\n`;
    }

    result += `\nDescription:\n${adfToPlainText(issue.fields.description)}\n`;

    return result;
  } catch (error) {
    console.error("Error formatting issue:", error);
    return JSON.stringify(issue);
  }
};

// Resource for getting issues
server.resource(
  "issues",
  new ResourceTemplate("jira://issues/{query}", { list: undefined }),
  async (uri, { query }) => {
    try {
      const jql = query || "";
      const data = await jiraRequest(`/search?jql=${encodeURIComponent(jql)}`);

      let text = `Found ${data.total} issues\n\n`;

      if (data.issues && data.issues.length > 0) {
        for (const issue of data.issues) {
          text += `- ${issue.key}: ${issue.fields.summary} (Status: ${issue.fields.status.name})\n`;
        }
      } else {
        text += "No issues found matching the query.";
      }

      return {
        contents: [
          {
            uri: uri.href,
            text,
          },
        ],
      };
    } catch (error) {
      console.error(`Error searching issues: ${error.message}`);
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error searching issues: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Resource for getting a specific issue
server.resource(
  "issue",
  new ResourceTemplate("jira://issue/{issueKey}", { list: undefined }),
  async (uri, { issueKey }) => {
    try {
      const data = await jiraRequest(`/issue/${issueKey}`);
      const text = formatIssue(data);

      return {
        contents: [
          {
            uri: uri.href,
            text,
          },
        ],
      };
    } catch (error) {
      console.error(`Error getting issue ${issueKey}: ${error.message}`);
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error getting issue ${issueKey}: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Resource for getting comments on an issue
server.resource(
  "comments",
  new ResourceTemplate("jira://issue/{issueKey}/comments", { list: undefined }),
  async (uri, { issueKey }) => {
    try {
      const data = await jiraRequest(`/issue/${issueKey}/comment`);

      let text = `Comments for ${issueKey}:\n\n`;

      if (data.comments && data.comments.length > 0) {
        for (const comment of data.comments) {
          text += `--- Comment by ${comment.author.displayName} on ${comment.created} ---\n`;
          text += adfToPlainText(comment.body) + "\n\n";
        }
      } else {
        text += "No comments found for this issue.";
      }

      return {
        contents: [
          {
            uri: uri.href,
            text,
          },
        ],
      };
    } catch (error) {
      console.error(`Error getting comments for ${issueKey}: ${error.message}`);
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error getting comments for ${issueKey}: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Resource for getting projects
server.resource("projects", "jira://projects", async (uri) => {
  try {
    const data = await jiraRequest("/project");

    let text = "Available Jira Projects:\n\n";

    if (data && data.length > 0) {
      for (const project of data) {
        text += `- ${project.key}: ${project.name}\n`;
      }
    } else {
      text += "No projects found.";
    }

    return {
      contents: [
        {
          uri: uri.href,
          text,
        },
      ],
    };
  } catch (error) {
    console.error(`Error getting projects: ${error.message}`);
    return {
      contents: [
        {
          uri: uri.href,
          text: `Error getting projects: ${error.message}`,
        },
      ],
    };
  }
});

// Tool to search for issues
server.tool(
  "searchIssues",
  {
    jql: z.string().describe("JQL query string to search for issues"),
  },
  async ({ jql }) => {
    try {
      const data = await jiraRequest(`/search?jql=${encodeURIComponent(jql)}`);

      let result = `Found ${data.total} issues\n\n`;

      if (data.issues && data.issues.length > 0) {
        const issues = data.issues.map((issue) => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          issueType: issue.fields.issuetype.name,
          assignee: issue.fields.assignee
            ? issue.fields.assignee.displayName
            : "Unassigned",
        }));

        result += issues
          .map(
            (issue) =>
              `- ${issue.key}: ${issue.summary} (Type: ${issue.issueType}, Status: ${issue.status}, Assignee: ${issue.assignee})`
          )
          .join("\n");
      } else {
        result += "No issues found matching the query.";
      }

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error searching issues: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// Tool to get details of a specific issue
server.tool(
  "getIssue",
  {
    issueKey: z.string().describe("The issue key (e.g., 'PROJECT-123')"),
  },
  async ({ issueKey }) => {
    try {
      const data = await jiraRequest(`/issue/${issueKey}`);
      const formattedIssue = formatIssue(data);

      return {
        content: [{ type: "text", text: formattedIssue }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting issue ${issueKey}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool to create a new issue
server.tool(
  "createIssue",
  {
    projectKey: z
      .string()
      .describe("The project key where the issue will be created"),
    issueType: z
      .string()
      .describe("The issue type (e.g., 'Bug', 'Task', 'Story')"),
    summary: z.string().describe("The issue summary/title"),
    description: z.string().describe("The issue description"),
    priority: z
      .string()
      .optional()
      .describe("Optional: The priority of the issue"),
  },
  async ({ projectKey, issueType, summary, description, priority }) => {
    try {
      // Create ADF document for description
      const descriptionDoc = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: description,
              },
            ],
          },
        ],
      };

      const requestBody = {
        fields: {
          project: {
            key: projectKey,
          },
          summary: summary,
          description: descriptionDoc,
          issuetype: {
            name: issueType,
          },
        },
      };

      if (priority) {
        requestBody.fields.priority = {
          name: priority,
        };
      }

      const data = await jiraRequest("/issue", "POST", requestBody);

      return {
        content: [
          {
            type: "text",
            text: `Issue created successfully! Key: ${data.key}\nLink: ${process.env.JIRA_BASE_URL}/browse/${data.key}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error creating issue: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// Tool to update an existing issue
server.tool(
  "updateIssue",
  {
    issueKey: z
      .string()
      .describe("The issue key to update (e.g., 'PROJECT-123')"),
    summary: z.string().optional().describe("Optional: New summary/title"),
    description: z.string().optional().describe("Optional: New description"),
    status: z.string().optional().describe("Optional: New status"),
    assignee: z
      .string()
      .optional()
      .describe("Optional: New assignee (email or username)"),
    priority: z.string().optional().describe("Optional: New priority"),
  },
  async ({ issueKey, summary, description, status, assignee, priority }) => {
    try {
      const fields = {};

      if (summary) {
        fields.summary = summary;
      }

      if (description) {
        fields.description = {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: description,
                },
              ],
            },
          ],
        };
      }

      if (assignee) {
        fields.assignee = {
          id: assignee,
        };
      }

      if (priority) {
        fields.priority = {
          name: priority,
        };
      }

      // Only update fields if we have something to update
      if (Object.keys(fields).length > 0) {
        await jiraRequest(`/issue/${issueKey}`, "PUT", { fields });
      }

      // Handle status updates separately via transitions if needed
      if (status) {
        // First, get available transitions
        const transitions = await jiraRequest(`/issue/${issueKey}/transitions`);
        const targetTransition = transitions.transitions.find(
          (t) =>
            t.name.toLowerCase() === status.toLowerCase() ||
            t.to.name.toLowerCase() === status.toLowerCase()
        );

        if (targetTransition) {
          await jiraRequest(`/issue/${issueKey}/transitions`, "POST", {
            transition: {
              id: targetTransition.id,
            },
          });
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Issue ${issueKey} updated, but could not change status to '${status}'. Available statuses are: ${transitions.transitions
                  .map((t) => t.to.name)
                  .join(", ")}`,
              },
            ],
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Issue ${issueKey} updated successfully!\nLink: ${process.env.JIRA_BASE_URL}/browse/${issueKey}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating issue ${issueKey}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool to add a comment to an issue
server.tool(
  "addComment",
  {
    issueKey: z
      .string()
      .describe("The issue key to comment on (e.g., 'PROJECT-123')"),
    comment: z.string().describe("The comment text"),
  },
  async ({ issueKey, comment }) => {
    try {
      // Create ADF document for comment
      const commentBody = {
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: comment,
                },
              ],
            },
          ],
        },
      };

      await jiraRequest(`/issue/${issueKey}/comment`, "POST", commentBody);

      return {
        content: [
          {
            type: "text",
            text: `Comment added to ${issueKey} successfully!\nLink: ${process.env.JIRA_BASE_URL}/browse/${issueKey}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error adding comment to ${issueKey}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool to list available projects
server.tool("listProjects", {}, async () => {
  try {
    const data = await jiraRequest("/project");

    let result = "Available Jira Projects:\n\n";

    if (data && data.length > 0) {
      const projects = data.map((project) => ({
        key: project.key,
        name: project.name,
        type: project.projectTypeKey,
      }));

      result += projects
        .map(
          (project) =>
            `- ${project.key}: ${project.name} (Type: ${project.type})`
        )
        .join("\n");
    } else {
      result += "No projects found.";
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    return {
      content: [
        { type: "text", text: `Error listing projects: ${error.message}` },
      ],
      isError: true,
    };
  }
});

// Start server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
