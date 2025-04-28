import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "Jira Tasks MCP",
  version: "1.0.0",
  description: "A server to handle Jira tasks for your team",
});

// Configuration for Jira API - these would be set via environment variables in production
const JIRA_BASE_URL =
  process.env.JIRA_BASE_URL || "https://your-domain.atlassian.net";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN; // Should be set in environment
const JIRA_EMAIL = process.env.JIRA_EMAIL; // Should be set in environment

// Basic auth for Jira API
const getAuthHeader = () => {
  if (!JIRA_API_TOKEN || !JIRA_EMAIL) {
    return null; // For mock mode
  }
  return `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString(
    "base64"
  )}`;
};

// Helper function to make Jira API requests
const fetchFromJira = async (endpoint, options = {}) => {
  const authHeader = getAuthHeader();

  // If no auth header, return mock data (for testing without credentials)
  if (!authHeader) {
    return getMockData(endpoint);
  }

  const response = await fetch(`${JIRA_BASE_URL}/rest/api/3${endpoint}`, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(
      `Jira API error: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
};

// Mock data for testing without actual Jira credentials
const getMockData = (endpoint) => {
  console.log(`[MOCK] Fetching mock data for ${endpoint}`);

  // Mock projects list
  if (endpoint === "/project") {
    return [
      {
        id: "PRJ1",
        key: "TEAM",
        name: "Team Project",
        description: "Main team project",
      },
      {
        id: "PRJ2",
        key: "INFRA",
        name: "Infrastructure",
        description: "Infrastructure tasks",
      },
    ];
  }

  // Mock issues for a project
  if (endpoint.startsWith("/search")) {
    return {
      issues: [
        {
          id: "TEAM-1",
          key: "TEAM-1",
          fields: {
            summary: "Set up new development environment",
            description: {
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      text: "We need to set up the new development environment for the team.",
                      type: "text",
                    },
                  ],
                },
              ],
            },
            status: { name: "To Do" },
            assignee: { displayName: "John Doe" },
            priority: { name: "Medium" },
          },
        },
        {
          id: "TEAM-2",
          key: "TEAM-2",
          fields: {
            summary: "Implement authentication feature",
            description: {
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      text: "Design and implement the new authentication system.",
                      type: "text",
                    },
                  ],
                },
              ],
            },
            status: { name: "In Progress" },
            assignee: { displayName: "Jane Smith" },
            priority: { name: "High" },
          },
        },
      ],
      total: 2,
    };
  }

  // Mock for a single task
  if (endpoint.match(/\/issue\/[A-Z]+-\d+/)) {
    const key = endpoint.split("/").pop();
    return {
      id: key,
      key: key,
      fields: {
        summary: "Implement authentication feature",
        description: {
          content: [
            {
              type: "paragraph",
              content: [
                {
                  text: "Design and implement the new authentication system including OAuth.",
                  type: "text",
                },
              ],
            },
          ],
        },
        status: { name: "In Progress" },
        assignee: { displayName: "Jane Smith" },
        priority: { name: "High" },
        created: "2023-01-10T09:10:15.123+0000",
        updated: "2023-01-15T14:30:45.123+0000",
        duedate: "2023-02-15",
        timeestimate: 28800, // In seconds (8 hours)
        timetracking: {
          originalEstimate: "1w",
          remainingEstimate: "3d",
          timeSpent: "2d",
        },
      },
    };
  }

  // Default empty response
  return {};
};

// Parse Jira's rich text description to plain text
const parseJiraDescription = (description) => {
  if (!description || !description.content) return "";

  const extractText = (content) => {
    if (!content) return "";

    let text = "";

    for (const item of content) {
      if (item.text) {
        text += item.text;
      }

      if (item.content) {
        text += extractText(item.content);
      }

      // Add newlines for paragraphs
      if (item.type === "paragraph") {
        text += "\n\n";
      } else if (item.type === "heading") {
        text += "\n\n";
      } else if (item.type === "bulletList" || item.type === "orderedList") {
        text += "\n";
      }
    }

    return text;
  };

  return extractText(description.content).trim();
};

// Format a task/issue for display
const formatTask = (issue) => {
  if (!issue || !issue.fields) return "Invalid task data";

  const fields = issue.fields;
  const description = fields.description
    ? parseJiraDescription(fields.description)
    : "No description";

  return `Task: ${issue.key} - ${fields.summary}
Status: ${fields.status?.name || "Unknown"}
Priority: ${fields.priority?.name || "Not set"}
Assignee: ${fields.assignee?.displayName || "Unassigned"}
Created: ${fields.created || "Unknown"}
Updated: ${fields.updated || "Unknown"}
Due Date: ${fields.duedate || "Not set"}

Description:
${description}

${
  fields.timetracking
    ? `Time Tracking:
Original Estimate: ${fields.timetracking.originalEstimate || "Not set"}
Remaining: ${fields.timetracking.remainingEstimate || "Not set"}
Time Spent: ${fields.timetracking.timeSpent || "Not set"}`
    : ""
}
`;
};

// RESOURCES

// List all projects
server.resource("projects", "jira://projects", async (uri) => {
  try {
    const projects = await fetchFromJira("/project");
    const formattedProjects = projects
      .map(
        (project) =>
          `${project.key}: ${project.name}${
            project.description ? ` - ${project.description}` : ""
          }`
      )
      .join("\n\n");

    return {
      contents: [
        {
          uri: uri.href,
          text: `# Jira Projects\n\n${formattedProjects}`,
        },
      ],
    };
  } catch (error) {
    return {
      contents: [
        {
          uri: uri.href,
          text: `Error retrieving Jira projects: ${error.message}`,
        },
      ],
    };
  }
});

// Get tasks for a specific project
server.resource(
  "project-tasks",
  new ResourceTemplate("jira://projects/{projectKey}/tasks", {
    list: undefined,
  }),
  async (uri, { projectKey }) => {
    try {
      const response = await fetchFromJira("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jql: `project = ${projectKey} ORDER BY updated DESC`,
          maxResults: 20,
          fields: ["summary", "description", "status", "assignee", "priority"],
        }),
      });

      if (!response.issues || response.issues.length === 0) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `No tasks found for project ${projectKey}`,
            },
          ],
        };
      }

      const taskSummaries = response.issues
        .map(
          (issue) =>
            `- ${issue.key}: ${issue.fields.summary} (${
              issue.fields.status?.name || "Unknown"
            })${
              issue.fields.assignee
                ? ` - Assigned to: ${issue.fields.assignee.displayName}`
                : ""
            }`
        )
        .join("\n");

      return {
        contents: [
          {
            uri: uri.href,
            text: `# Tasks for ${projectKey}\n\n${taskSummaries}\n\nTotal tasks: ${response.total}`,
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error retrieving tasks for project ${projectKey}: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Get details for a specific task
server.resource(
  "task-details",
  new ResourceTemplate("jira://tasks/{taskKey}", { list: undefined }),
  async (uri, { taskKey }) => {
    try {
      const issue = await fetchFromJira(`/issue/${taskKey}`);
      const formattedTask = formatTask(issue);

      return {
        contents: [
          {
            uri: uri.href,
            text: `# Task Details: ${taskKey}\n\n${formattedTask}`,
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error retrieving task ${taskKey}: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Get tasks assigned to a person
server.resource(
  "user-tasks",
  new ResourceTemplate("jira://users/{username}/tasks", { list: undefined }),
  async (uri, { username }) => {
    try {
      const response = await fetchFromJira("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jql: `assignee = "${username}" ORDER BY updated DESC`,
          maxResults: 20,
          fields: ["summary", "description", "status", "priority", "project"],
        }),
      });

      if (!response.issues || response.issues.length === 0) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `No tasks found for user ${username}`,
            },
          ],
        };
      }

      const taskSummaries = response.issues
        .map(
          (issue) =>
            `- ${issue.key}: ${issue.fields.summary} (${
              issue.fields.status?.name || "Unknown"
            }) - Project: ${issue.fields.project?.name || "Unknown"}`
        )
        .join("\n");

      return {
        contents: [
          {
            uri: uri.href,
            text: `# Tasks assigned to ${username}\n\n${taskSummaries}\n\nTotal tasks: ${response.total}`,
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error retrieving tasks for user ${username}: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Search tasks
server.resource(
  "search-tasks",
  new ResourceTemplate("jira://search/{query}", { list: undefined }),
  async (uri, { query }) => {
    try {
      const response = await fetchFromJira("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jql: `text ~ "${query}" ORDER BY updated DESC`,
          maxResults: 20,
          fields: [
            "summary",
            "description",
            "status",
            "assignee",
            "priority",
            "project",
          ],
        }),
      });

      if (!response.issues || response.issues.length === 0) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `No tasks found matching "${query}"`,
            },
          ],
        };
      }

      const taskSummaries = response.issues
        .map(
          (issue) =>
            `- ${issue.key}: ${issue.fields.summary} (${
              issue.fields.status?.name || "Unknown"
            })${
              issue.fields.project
                ? ` - Project: ${issue.fields.project.name}`
                : ""
            }`
        )
        .join("\n");

      return {
        contents: [
          {
            uri: uri.href,
            text: `# Search results for "${query}"\n\n${taskSummaries}\n\nTotal tasks found: ${response.total}`,
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error searching for tasks with query "${query}": ${error.message}`,
          },
        ],
      };
    }
  }
);

// TOOLS

// Create a new task
server.tool(
  "create-task",
  {
    projectKey: z.string().min(1),
    summary: z.string().min(1),
    description: z.string().optional(),
    assignee: z.string().optional(),
    priority: z.enum(["Highest", "High", "Medium", "Low", "Lowest"]).optional(),
  },
  async ({ projectKey, summary, description, assignee, priority }) => {
    try {
      // Prepare the request body
      const requestBody = {
        fields: {
          project: { key: projectKey },
          summary: summary,
          issuetype: { name: "Task" },
        },
      };

      // Add optional fields if provided
      if (description) {
        requestBody.fields.description = {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  text: description,
                  type: "text",
                },
              ],
            },
          ],
        };
      }

      if (assignee) {
        requestBody.fields.assignee = { name: assignee };
      }

      if (priority) {
        requestBody.fields.priority = { name: priority };
      }

      // If in mock mode, return success response without calling API
      if (!getAuthHeader()) {
        return {
          content: [
            {
              type: "text",
              text: `[MOCK] Task created successfully in ${projectKey}!\nTask Key: ${projectKey}-123\nSummary: ${summary}`,
            },
          ],
        };
      }

      // Make the API request
      const response = await fetchFromJira("/issue", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      return {
        content: [
          {
            type: "text",
            text: `Task created successfully!\nTask Key: ${response.key}\nProject: ${projectKey}\nSummary: ${summary}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error creating task: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// Update a task status
server.tool(
  "update-task-status",
  {
    taskKey: z.string().min(1),
    status: z.string().min(1),
  },
  async ({ taskKey, status }) => {
    try {
      // In a real implementation, you'd need to:
      // 1. Get available transitions for the issue
      // 2. Find the transition ID that matches the requested status
      // 3. Call the transition API with that ID

      // For simplicity in this example, we'll just assume success in mock mode
      if (!getAuthHeader()) {
        return {
          content: [
            {
              type: "text",
              text: `[MOCK] Task ${taskKey} status updated to "${status}" successfully!`,
            },
          ],
        };
      }

      // In a real implementation:
      // 1. Get available transitions
      const transitions = await fetchFromJira(`/issue/${taskKey}/transitions`);

      // 2. Find matching transition
      const transition = transitions.transitions.find(
        (t) =>
          t.name.toLowerCase() === status.toLowerCase() ||
          t.to.name.toLowerCase() === status.toLowerCase()
      );

      if (!transition) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Status "${status}" is not a valid transition for task ${taskKey}. Available transitions: ${transitions.transitions
                .map((t) => t.name)
                .join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // 3. Apply the transition
      await fetchFromJira(`/issue/${taskKey}/transitions`, {
        method: "POST",
        body: JSON.stringify({
          transition: {
            id: transition.id,
          },
        }),
      });

      return {
        content: [
          {
            type: "text",
            text: `Task ${taskKey} status updated to "${status}" successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating task status: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Assign a task to someone
server.tool(
  "assign-task",
  {
    taskKey: z.string().min(1),
    assignee: z.string().optional(), // Optional to allow unassigning (null)
  },
  async ({ taskKey, assignee }) => {
    try {
      const assignData = assignee ? { name: assignee } : null;

      // Mock mode
      if (!getAuthHeader()) {
        return {
          content: [
            {
              type: "text",
              text: `[MOCK] Task ${taskKey} ${
                assignee ? `assigned to ${assignee}` : "unassigned"
              } successfully!`,
            },
          ],
        };
      }

      // Make the API request
      await fetchFromJira(`/issue/${taskKey}/assignee`, {
        method: "PUT",
        body: JSON.stringify(assignData),
      });

      return {
        content: [
          {
            type: "text",
            text: `Task ${taskKey} ${
              assignee ? `assigned to ${assignee}` : "unassigned"
            } successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error assigning task: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// Add a comment to a task
server.tool(
  "add-comment",
  {
    taskKey: z.string().min(1),
    comment: z.string().min(1),
  },
  async ({ taskKey, comment }) => {
    try {
      const commentData = {
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  text: comment,
                  type: "text",
                },
              ],
            },
          ],
        },
      };

      // Mock mode
      if (!getAuthHeader()) {
        return {
          content: [
            {
              type: "text",
              text: `[MOCK] Comment added to task ${taskKey} successfully!`,
            },
          ],
        };
      }

      // Make the API request
      await fetchFromJira(`/issue/${taskKey}/comment`, {
        method: "POST",
        body: JSON.stringify(commentData),
      });

      return {
        content: [
          {
            type: "text",
            text: `Comment added to task ${taskKey} successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error adding comment: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// Log work on a task
server.tool(
  "log-work",
  {
    taskKey: z.string().min(1),
    timeSpent: z.string().min(1), // e.g., "1h 30m", "2d"
    comment: z.string().optional(),
  },
  async ({ taskKey, timeSpent, comment }) => {
    try {
      const worklogData = {
        timeSpent: timeSpent,
        comment: comment || "",
      };

      // Mock mode
      if (!getAuthHeader()) {
        return {
          content: [
            {
              type: "text",
              text: `[MOCK] Work logged on task ${taskKey}: ${timeSpent}${
                comment ? ` with comment: "${comment}"` : ""
              }`,
            },
          ],
        };
      }

      // Make the API request
      await fetchFromJira(`/issue/${taskKey}/worklog`, {
        method: "POST",
        body: JSON.stringify(worklogData),
      });

      return {
        content: [
          {
            type: "text",
            text: `Work logged on task ${taskKey}: ${timeSpent}${
              comment ? ` with comment: "${comment}"` : ""
            }`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error logging work: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// PROMPTS

// Prompt to create a task from description
server.prompt(
  "create-task-from-description",
  { description: z.string().min(1) },
  ({ description }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I need to create a new Jira task based on this description: "${description}". 
        
Please help me formulate a well-structured task with:
1. A clear, concise title (summary)
2. A proper description with context and acceptance criteria if possible
3. What would be an appropriate priority level?
4. Should this be assigned to someone specific on our team?
5. What project should this belong to?

Once you've analyzed this, please help me create the task using the create-task tool.`,
        },
      },
    ],
  })
);

// Prompt to analyze project status
server.prompt(
  "analyze-project-status",
  { projectKey: z.string().min(1) },
  ({ projectKey }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I need an analysis of the current status of project ${projectKey}. 
        
Please:
1. Retrieve all tasks for this project
2. Summarize how many tasks are in each status category
3. Identify any high-priority tasks that might be at risk
4. Highlight any tasks that might be blocked
5. Provide recommendations on what the team should focus on next

This will help me prepare for our next status meeting.`,
        },
      },
    ],
  })
);

// Prompt to summarize a user's workload
server.prompt(
  "summarize-user-workload",
  { username: z.string().min(1) },
  ({ username }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I'd like to understand ${username}'s current workload in Jira. 
        
Please:
1. Get all tasks currently assigned to ${username}
2. Analyze how many tasks they have in each status
3. Check if they have any high-priority items that might need attention
4. Estimate their overall workload level (overloaded, balanced, etc.)
5. Suggest if any tasks might need reassignment or priority adjustment

This will help with team capacity planning.`,
        },
      },
    ],
  })
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
