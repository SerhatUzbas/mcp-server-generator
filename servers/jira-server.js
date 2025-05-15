import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false,
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Create an MCP server for Jira integration
const server = new McpServer({
  name: "Jira Assistant",
  version: "1.0.0",
  description: "MCP server for interacting with Jira",
});

// Validate environment variables
const validateEnv = () => {
  const requiredVars = ["JIRA_API_TOKEN", "JIRA_EMAIL", "JIRA_BASE_URL"];
  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    console.error(
      `Error: Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("Please set these variables in Claude Desktop config.");
    return false;
  }
  return true;
};

// Helper function to make Jira API requests
async function jiraRequest(endpoint, method = "GET", body = null) {
  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");

  const url = `${process.env.JIRA_BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, { ...options, agent });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        `Jira API error: ${data.errorMessages?.[0] || response.statusText}`
      );
    }
    return data;
  } catch (error) {
    throw new Error(`Error making Jira request: ${error.message}`);
  }
}

// Tool: List projects
server.tool("listProjects", {}, async () => {
  if (!validateEnv()) {
    return {
      content: [
        {
          type: "text",
          text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
        },
      ],
      isError: true,
    };
  }

  try {
    const projects = await jiraRequest("/rest/api/3/project");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            projects.map((p) => ({ id: p.id, key: p.key, name: p.name })),
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: error.message }],
      isError: true,
    };
  }
});

// Tool: Create a new issue
server.tool(
  "createIssue",
  {
    projectKey: z.string().min(1, "Project key is required"),
    summary: z.string().min(1, "Summary is required"),
    description: z.string().optional(),
    issueType: z.string().default("Task"),
    priority: z.string().optional(),
    labels: z.array(z.string()).optional(),
  },
  async ({ projectKey, summary, description, issueType, priority, labels }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      const issueData = {
        fields: {
          project: { key: projectKey },
          summary,
          issuetype: { name: issueType },
        },
      };

      if (description) {
        issueData.fields.description = {
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

      if (priority) {
        issueData.fields.priority = { name: priority };
      }

      if (labels && labels.length > 0) {
        issueData.fields.labels = labels;
      }

      const newIssue = await jiraRequest(
        "/rest/api/3/issue",
        "POST",
        issueData
      );

      return {
        content: [
          {
            type: "text",
            text: `Issue created successfully!\nKey: ${newIssue.key}\nLink: ${process.env.JIRA_BASE_URL}/browse/${newIssue.key}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Create subtask
server.tool(
  "createSubtask",
  {
    parentIssueKey: z.string().min(1, "Parent issue key is required"),
    summary: z.string().min(1, "Summary is required"),
    description: z.string().optional(),
  },
  async ({ parentIssueKey, summary, description }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      // First, get the parent issue to determine the project
      const parentIssue = await jiraRequest(
        `/rest/api/3/issue/${parentIssueKey}`
      );

      const subtaskData = {
        fields: {
          project: { id: parentIssue.fields.project.id },
          summary,
          issuetype: { name: "Sub-task" },
          parent: { key: parentIssueKey },
        },
      };

      if (description) {
        subtaskData.fields.description = {
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

      const newSubtask = await jiraRequest(
        "/rest/api/3/issue",
        "POST",
        subtaskData
      );

      return {
        content: [
          {
            type: "text",
            text: `Subtask created successfully!\nKey: ${newSubtask.key}\nLink: ${process.env.JIRA_BASE_URL}/browse/${newSubtask.key}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Link issues
server.tool(
  "linkIssues",
  {
    fromIssueKey: z.string().min(1, "From issue key is required"),
    toIssueKey: z.string().min(1, "To issue key is required"),
    linkType: z.string().default("Relates"),
  },
  async ({ fromIssueKey, toIssueKey, linkType }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      const linkData = {
        outwardIssue: { key: toIssueKey },
        inwardIssue: { key: fromIssueKey },
        type: { name: linkType },
      };

      await jiraRequest("/rest/api/3/issueLink", "POST", linkData);

      return {
        content: [
          {
            type: "text",
            text: `Issues linked successfully!\n${fromIssueKey} ${linkType} ${toIssueKey}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Get issue information
server.tool(
  "getIssue",
  {
    issueKey: z.string().min(1, "Issue key is required"),
  },
  async ({ issueKey }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      const issue = await jiraRequest(`/rest/api/3/issue/${issueKey}`);

      // Format the response to be more readable
      const formattedIssue = {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        issueType: issue.fields.issuetype.name,
        priority: issue.fields.priority?.name || "Not set",
        assignee: issue.fields.assignee?.displayName || "Unassigned",
        reporter: issue.fields.reporter?.displayName || "Unknown",
        created: new Date(issue.fields.created).toLocaleString(),
        updated: new Date(issue.fields.updated).toLocaleString(),
        labels: issue.fields.labels || [],
        url: `${process.env.JIRA_BASE_URL}/browse/${issue.key}`,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedIssue, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Search issues
server.tool(
  "searchIssues",
  {
    jql: z.string().min(1, "JQL query is required"),
    maxResults: z.number().min(1).max(100).default(10),
  },
  async ({ jql, maxResults }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      const searchData = {
        jql,
        maxResults,
        fields: ["summary", "status", "issuetype", "priority", "assignee"],
      };

      const results = await jiraRequest(
        "/rest/api/3/search",
        "POST",
        searchData
      );

      const formattedResults = results.issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        issueType: issue.fields.issuetype.name,
        priority: issue.fields.priority?.name || "Not set",
        assignee: issue.fields.assignee?.displayName || "Unassigned",
        url: `${process.env.JIRA_BASE_URL}/browse/${issue.key}`,
      }));

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.total} issues (showing ${
              formattedResults.length
            }):\n\n${JSON.stringify(formattedResults, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);
// Tool: Assign issue to user
server.tool(
  "assignIssue",
  {
    issueKey: z.string().min(1, "Issue key is required"),
    accountId: z.string().optional(),
    displayName: z.string().optional(),
  },
  async ({ issueKey, accountId, displayName }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    if (!accountId && !displayName) {
      return {
        content: [
          {
            type: "text",
            text: "Either accountId or displayName must be provided.",
          },
        ],
        isError: true,
      };
    }

    try {
      let assigneeAccountId = accountId;

      // If displayName is provided but accountId is not, search for the user
      if (!accountId && displayName) {
        const users = await jiraRequest(
          `/rest/api/3/user/search?query=${encodeURIComponent(displayName)}`
        );
        if (users.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No users found matching displayName: ${displayName}`,
              },
            ],
            isError: true,
          };
        }

        // Use the first user that matches the display name
        assigneeAccountId = users[0].accountId;
      }

      const assignData = {
        accountId: assigneeAccountId,
      };

      await jiraRequest(
        `/rest/api/3/issue/${issueKey}/assignee`,
        "PUT",
        assignData
      );

      return {
        content: [
          {
            type: "text",
            text: `Issue ${issueKey} has been assigned successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Transition issue status
server.tool(
  "transitionIssue",
  {
    issueKey: z.string().min(1, "Issue key is required"),
    transitionName: z
      .string()
      .min(1, "Transition name is required (e.g., 'In Progress', 'Done')"),
  },
  async ({ issueKey, transitionName }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      // Get available transitions
      const availableTransitions = await jiraRequest(
        `/rest/api/3/issue/${issueKey}/transitions`
      );

      // Find the transition ID that matches the requested name
      const transition = availableTransitions.transitions.find(
        (t) => t.name.toLowerCase() === transitionName.toLowerCase()
      );

      if (!transition) {
        return {
          content: [
            {
              type: "text",
              text: `No transition found with name "${transitionName}". Available transitions: ${availableTransitions.transitions
                .map((t) => t.name)
                .join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // Execute the transition
      const transitionData = {
        transition: {
          id: transition.id,
        },
      };

      await jiraRequest(
        `/rest/api/3/issue/${issueKey}/transitions`,
        "POST",
        transitionData
      );

      return {
        content: [
          {
            type: "text",
            text: `Issue ${issueKey} has been transitioned to "${transition.name}" successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Add comment to issue
server.tool(
  "addComment",
  {
    issueKey: z.string().min(1, "Issue key is required"),
    comment: z.string().min(1, "Comment text is required"),
  },
  async ({ issueKey, comment }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

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
                  type: "text",
                  text: comment,
                },
              ],
            },
          ],
        },
      };

      const response = await jiraRequest(
        `/rest/api/3/issue/${issueKey}/comment`,
        "POST",
        commentData
      );

      return {
        content: [
          {
            type: "text",
            text: `Comment added successfully to ${issueKey}!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Link issue to epic
server.tool(
  "linkToEpic",
  {
    issueKey: z.string().min(1, "Issue key is required"),
    epicKey: z.string().min(1, "Epic key is required"),
  },
  async ({ issueKey, epicKey }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      // Verify the epic exists and is actually an epic
      const epic = await jiraRequest(`/rest/api/3/issue/${epicKey}`);
      if (epic.fields.issuetype.name !== "Epic") {
        return {
          content: [
            {
              type: "text",
              text: `The issue ${epicKey} is not an Epic (it's a ${epic.fields.issuetype.name}).`,
            },
          ],
          isError: true,
        };
      }

      // Link issue to epic
      // Note: This uses Jira's custom field for epic link, which can vary between instances
      // We'll try both common field IDs
      const epicLinkFieldIds = ["customfield_10014", "customfield_10008"];
      let success = false;

      for (const fieldId of epicLinkFieldIds) {
        try {
          const updateData = {
            fields: {
              [fieldId]: epicKey,
            },
          };

          await jiraRequest(`/rest/api/3/issue/${issueKey}`, "PUT", updateData);
          success = true;
          break;
        } catch (error) {
          // Try the next field ID
          continue;
        }
      }

      if (!success) {
        // If direct update failed, try using the Epic Link functionality
        try {
          await jiraRequest(`/rest/agile/1.0/epic/${epicKey}/issue`, "POST", {
            issues: [issueKey],
          });
          success = true;
        } catch (error) {
          // Final fallback to standard issue linking
          const linkData = {
            outwardIssue: { key: issueKey },
            inwardIssue: { key: epicKey },
            type: { name: "Relates" },
          };

          await jiraRequest("/rest/api/3/issueLink", "POST", linkData);

          return {
            content: [
              {
                type: "text",
                text: `Could not establish proper Epic link. Created regular issue link instead: ${issueKey} Relates to ${epicKey}`,
              },
            ],
          };
        }
      }

      if (success) {
        return {
          content: [
            {
              type: "text",
              text: `Issue ${issueKey} has been linked to Epic ${epicKey} successfully!`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Get available issue types
server.tool(
  "getIssueTypes",
  {
    projectKey: z.string().optional(),
  },
  async ({ projectKey }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      let issueTypes;

      if (projectKey) {
        // Get project-specific issue types
        const project = await jiraRequest(`/rest/api/3/project/${projectKey}`);
        issueTypes = project.issueTypes;
      } else {
        // Get all issue types
        issueTypes = await jiraRequest("/rest/api/3/issuetype");
      }

      const formattedTypes = issueTypes.map((type) => ({
        id: type.id,
        name: type.name,
        description: type.description,
        subtask: type.subtask,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedTypes, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Get available users
server.tool(
  "getUsers",
  {
    query: z.string().min(1, "Search query is required"),
  },
  async ({ query }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      const users = await jiraRequest(
        `/rest/api/3/user/search?query=${encodeURIComponent(query)}`
      );

      const formattedUsers = users.map((user) => ({
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.emailAddress,
        active: user.active,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedUsers, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);
// Tool: Create multiple issues in batch
server.tool(
  "createMultipleIssues",
  {
    projectKey: z.string().min(1, "Project key is required"),
    issues: z
      .array(
        z.object({
          summary: z.string().min(1, "Summary is required"),
          description: z.string().optional(),
          issueType: z.string().default("Task"),
          priority: z.string().optional(),
          labels: z.array(z.string()).optional(),
        })
      )
      .min(1, "At least one issue must be provided"),
  },
  async ({ projectKey, issues }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      const createdIssues = [];
      const errors = [];

      // Process each issue
      for (const issue of issues) {
        try {
          const issueData = {
            fields: {
              project: { key: projectKey },
              summary: issue.summary,
              issuetype: { name: issue.issueType || "Task" },
            },
          };

          if (issue.description) {
            issueData.fields.description = {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: issue.description,
                    },
                  ],
                },
              ],
            };
          }

          if (issue.priority) {
            issueData.fields.priority = { name: issue.priority };
          }

          if (issue.labels && issue.labels.length > 0) {
            issueData.fields.labels = issue.labels;
          }

          const newIssue = await jiraRequest(
            "/rest/api/3/issue",
            "POST",
            issueData
          );

          createdIssues.push({
            key: newIssue.key,
            summary: issue.summary,
            url: `${process.env.JIRA_BASE_URL}/browse/${newIssue.key}`,
          });
        } catch (error) {
          errors.push({
            summary: issue.summary,
            error: error.message,
          });
        }
      }

      // Return results
      return {
        content: [
          {
            type: "text",
            text: `Created ${
              createdIssues.length
            } issues\n\nCreated issues:\n${JSON.stringify(
              createdIssues,
              null,
              2
            )}\n\n${
              errors.length > 0
                ? `Errors (${errors.length}):\n${JSON.stringify(
                    errors,
                    null,
                    2
                  )}`
                : "No errors occurred."
            }`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Get boards (for Jira Software/Scrum/Kanban)
server.tool(
  "getBoards",
  {
    projectKeyOrId: z.string().optional(),
    name: z.string().optional(),
    maxResults: z.number().min(1).max(100).default(50),
  },
  async ({ projectKeyOrId, name, maxResults }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      // Construct query params
      const queryParams = new URLSearchParams();
      if (projectKeyOrId) queryParams.append("projectKeyOrId", projectKeyOrId);
      if (name) queryParams.append("name", name);
      queryParams.append("maxResults", maxResults.toString());

      const endpoint = `/rest/agile/1.0/board?${queryParams.toString()}`;
      const boardsResponse = await jiraRequest(endpoint);

      const formattedBoards = boardsResponse.values.map((board) => ({
        id: board.id,
        name: board.name,
        type: board.type,
        location: board.location?.name || "Unknown",
        projectKey: board.location?.projectKey || "Unknown",
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedBoards, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Get sprints for a board
server.tool(
  "getSprints",
  {
    boardId: z.number().min(1, "Board ID is required"),
    state: z.enum(["active", "future", "closed", "all"]).default("active"),
  },
  async ({ boardId, state }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      // Construct query params
      const queryParams = new URLSearchParams();
      if (state !== "all") {
        queryParams.append("state", state);
      }

      const endpoint = `/rest/agile/1.0/board/${boardId}/sprint?${queryParams.toString()}`;
      const sprintsResponse = await jiraRequest(endpoint);

      const formattedSprints = sprintsResponse.values.map((sprint) => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate || "Not started",
        endDate: sprint.endDate || "Not ended",
        completeDate: sprint.completeDate || "Not completed",
        goal: sprint.goal || "No goal set",
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedSprints, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Add issue to sprint
server.tool(
  "addIssueToSprint",
  {
    issueKey: z.string().min(1, "Issue key is required"),
    sprintId: z.number().min(1, "Sprint ID is required"),
  },
  async ({ issueKey, sprintId }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      // Add issue to sprint
      const sprintData = {
        issues: [issueKey],
      };

      await jiraRequest(
        `/rest/agile/1.0/sprint/${sprintId}/issue`,
        "POST",
        sprintData
      );

      // Get sprint details for more informative response
      const sprint = await jiraRequest(`/rest/agile/1.0/sprint/${sprintId}`);

      return {
        content: [
          {
            type: "text",
            text: `Issue ${issueKey} has been added to sprint "${sprint.name}" successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Get available link types
server.tool("getLinkTypes", {}, async () => {
  if (!validateEnv()) {
    return {
      content: [
        {
          type: "text",
          text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
        },
      ],
      isError: true,
    };
  }

  try {
    const linkTypes = await jiraRequest("/rest/api/3/issueLinkType");

    const formattedLinkTypes = linkTypes.issueLinkTypes.map((type) => ({
      id: type.id,
      name: type.name,
      inward: type.inward,
      outward: type.outward,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(formattedLinkTypes, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: error.message }],
      isError: true,
    };
  }
});

// Tool: Create multiple subtasks
server.tool(
  "createMultipleSubtasks",
  {
    parentIssueKey: z.string().min(1, "Parent issue key is required"),
    subtasks: z
      .array(
        z.object({
          summary: z.string().min(1, "Summary is required"),
          description: z.string().optional(),
        })
      )
      .min(1, "At least one subtask must be provided"),
  },
  async ({ parentIssueKey, subtasks }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      // First, get the parent issue to determine the project
      const parentIssue = await jiraRequest(
        `/rest/api/3/issue/${parentIssueKey}`
      );

      const createdSubtasks = [];
      const errors = [];

      // Process each subtask
      for (const subtask of subtasks) {
        try {
          const subtaskData = {
            fields: {
              project: { id: parentIssue.fields.project.id },
              summary: subtask.summary,
              issuetype: { name: "Sub-task" },
              parent: { key: parentIssueKey },
            },
          };

          if (subtask.description) {
            subtaskData.fields.description = {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: subtask.description,
                    },
                  ],
                },
              ],
            };
          }

          const newSubtask = await jiraRequest(
            "/rest/api/3/issue",
            "POST",
            subtaskData
          );

          createdSubtasks.push({
            key: newSubtask.key,
            summary: subtask.summary,
            url: `${process.env.JIRA_BASE_URL}/browse/${newSubtask.key}`,
          });
        } catch (error) {
          errors.push({
            summary: subtask.summary,
            error: error.message,
          });
        }
      }

      // Return results
      return {
        content: [
          {
            type: "text",
            text: `Created ${
              createdSubtasks.length
            } subtasks for ${parentIssueKey}\n\nCreated subtasks:\n${JSON.stringify(
              createdSubtasks,
              null,
              2
            )}\n\n${
              errors.length > 0
                ? `Errors (${errors.length}):\n${JSON.stringify(
                    errors,
                    null,
                    2
                  )}`
                : "No errors occurred."
            }`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Get issue transitions
server.tool(
  "getIssueTransitions",
  {
    issueKey: z.string().min(1, "Issue key is required"),
  },
  async ({ issueKey }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      const transitions = await jiraRequest(
        `/rest/api/3/issue/${issueKey}/transitions`
      );

      const formattedTransitions = transitions.transitions.map(
        (transition) => ({
          id: transition.id,
          name: transition.name,
          to: {
            id: transition.to.id,
            name: transition.to.name,
          },
        })
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedTransitions, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Update issue
server.tool(
  "updateIssue",
  {
    issueKey: z.string().min(1, "Issue key is required"),
    summary: z.string().optional(),
    description: z.string().optional(),
    priority: z.string().optional(),
    labels: z.array(z.string()).optional(),
  },
  async ({ issueKey, summary, description, priority, labels }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      const updateData = {
        fields: {},
      };

      if (summary) {
        updateData.fields.summary = summary;
      }

      if (description) {
        updateData.fields.description = {
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

      if (priority) {
        updateData.fields.priority = { name: priority };
      }

      if (labels) {
        updateData.fields.labels = labels;
      }

      // Check if there are fields to update
      if (Object.keys(updateData.fields).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No fields specified for update. Please provide at least one field to update.",
            },
          ],
          isError: true,
        };
      }

      await jiraRequest(`/rest/api/3/issue/${issueKey}`, "PUT", updateData);

      return {
        content: [
          {
            type: "text",
            text: `Issue ${issueKey} has been updated successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Tool: Create Epic
server.tool(
  "createEpic",
  {
    projectKey: z.string().min(1, "Project key is required"),
    summary: z.string().min(1, "Summary is required"),
    description: z.string().optional(),
    priority: z.string().optional(),
    labels: z.array(z.string()).optional(),
  },
  async ({ projectKey, summary, description, priority, labels }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      // Create Epic issue
      const epicData = {
        fields: {
          project: { key: projectKey },
          summary,
          issuetype: { name: "Epic" },
        },
      };

      if (description) {
        epicData.fields.description = {
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

      if (priority) {
        epicData.fields.priority = { name: priority };
      }

      if (labels && labels.length > 0) {
        epicData.fields.labels = labels;
      }

      const newEpic = await jiraRequest("/rest/api/3/issue", "POST", epicData);

      return {
        content: [
          {
            type: "text",
            text: `Epic created successfully!\nKey: ${newEpic.key}\nLink: ${process.env.JIRA_BASE_URL}/browse/${newEpic.key}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Add system prompt for checking issue types first
server.prompt("jira-assistant-system-prompt", {}, () => {
  const promptText = `
You are a Jira assistant that helps users manage their Jira issues and projects effectively.

IMPORTANT: Before executing any action that creates or modifies issues, ALWAYS check the available issue types first. 
This is crucial because:
1. Issue types vary between Jira instances and projects
2. Each project might have different issue type configurations
3. Creating issues with incorrect issue types will fail
4. Different issue types have different required fields

Follow this workflow for all requests:
1. When a user wants to create or modify an issue, FIRST check the available issue types 
   - Use the getIssueTypes tool with the relevant projectKey
   - If the user didn't specify a project, help them identify which project they need using listProjects
2. Only after confirming the available issue types, proceed with the requested action
3. If the user specifies an issue type that doesn't exist, inform them and suggest available options

For any request involving issue creation or modification, ensure you're using a valid issue type that exists in the target project.
    `;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
});

// Tool: Get comments
server.tool(
  "getComments",
  {
    issueKey: z.string().min(1, "Issue key is required"),
  },
  async ({ issueKey }) => {
    if (!validateEnv()) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required environment variables. Please configure JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL.",
          },
        ],
        isError: true,
      };
    }

    try {
      const response = await jiraRequest(
        `/rest/api/3/issue/${issueKey}/comment`
      );

      const formattedComments = response.comments.map((comment) => {
        // Extract plain text from the document format
        let commentText = "";
        try {
          if (comment.body && comment.body.content) {
            commentText = extractTextFromCommentBody(comment.body);
          } else if (typeof comment.body === "string") {
            // Handle legacy comment format
            commentText = comment.body;
          }
        } catch (e) {
          commentText = "Error extracting comment text";
        }

        return {
          id: comment.id,
          author: comment.author?.displayName || "Unknown",
          created: new Date(comment.created).toLocaleString(),
          updated: comment.updated
            ? new Date(comment.updated).toLocaleString()
            : null,
          text: commentText,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedComments, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }
  }
);

// Helper function to extract text from a comment body
function extractTextFromCommentBody(body) {
  if (!body || !body.content) return "";

  let text = "";

  // Recursively extract text from the content
  function extractText(content) {
    if (!content) return;

    for (const item of content) {
      if (item.text) {
        text += item.text;
      }

      if (item.content) {
        extractText(item.content);
      }

      // Add newlines for paragraph and heading elements
      if (["paragraph", "heading"].includes(item.type) && text !== "") {
        text += "\n";
      }
    }
  }

  extractText(body.content);
  return text.trim();
}

// Start server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
