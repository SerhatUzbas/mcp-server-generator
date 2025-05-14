import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Gitlab } from "@gitbeaker/rest";

// Create an MCP server for GitLab interactions
const server = new McpServer({
  name: "GitLab Server",
  version: "1.0.0",
  description: "MCP server for interacting with GitLab API"
});

// Validate that necessary environment variables are set
function validateEnv() {
  const requiredVars = ['GITLAB_TOKEN', 'GITLAB_URL'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error(`Error: Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please set these in the Claude Desktop config.');
    return false;
  }
  return true;
}

// Initialize GitLab client
function getGitLabClient() {
  if (!validateEnv()) {
    throw new Error('Missing required environment variables');
  }

  return new Gitlab({
    token: process.env.GITLAB_TOKEN,
    host: process.env.GITLAB_URL,
  });
}

// --- RESOURCES ---

// List projects resource
server.resource(
  "projects",
  "gitlab://projects",
  async (uri) => {
    try {
      const api = getGitLabClient();
      const projects = await api.Projects.all({
        membership: true,
        orderBy: 'last_activity_at',
        sort: 'desc',
        perPage: 20
      });
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(projects.map(p => ({
            id: p.id,
            name: p.name,
            path_with_namespace: p.path_with_namespace,
            description: p.description,
            last_activity_at: p.last_activity_at,
            web_url: p.web_url
          })), null, 2)
        }]
      };
    } catch (error) {
      console.error('Error fetching projects:', error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error fetching projects: ${error.message}`
        }]
      };
    }
  }
);

// Project details resource
server.resource(
  "project",
  "gitlab://projects/{projectId}",
  async (uri, { projectId }) => {
    try {
      const api = getGitLabClient();
      const project = await api.Projects.show(projectId);
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(project, null, 2)
        }]
      };
    } catch (error) {
      console.error(`Error fetching project ${projectId}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error fetching project: ${error.message}`
        }]
      };
    }
  }
);

// List issues resource
server.resource(
  "issues",
  "gitlab://projects/{projectId}/issues",
  async (uri, { projectId }) => {
    try {
      const api = getGitLabClient();
      const issues = await api.Issues.all({
        projectId: projectId,
        state: 'opened',
        orderBy: 'updated_at',
        sort: 'desc'
      });
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(issues.map(i => ({
            id: i.id,
            iid: i.iid,
            title: i.title,
            description: i.description,
            state: i.state,
            created_at: i.created_at,
            updated_at: i.updated_at,
            author: i.author ? i.author.name : 'Unknown',
            web_url: i.web_url
          })), null, 2)
        }]
      };
    } catch (error) {
      console.error(`Error fetching issues for project ${projectId}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error fetching issues: ${error.message}`
        }]
      };
    }
  }
);
// List merge requests resource
server.resource(
  "merge-requests",
  "gitlab://projects/{projectId}/merge_requests",
  async (uri, { projectId }) => {
    try {
      const api = getGitLabClient();
      const mergeRequests = await api.MergeRequests.all({
        projectId: projectId,
        state: 'opened',
        orderBy: 'updated_at',
        sort: 'desc'
      });
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(mergeRequests.map(mr => ({
            id: mr.id,
            iid: mr.iid,
            title: mr.title,
            description: mr.description,
            state: mr.state,
            created_at: mr.created_at,
            updated_at: mr.updated_at,
            author: mr.author ? mr.author.name : 'Unknown',
            source_branch: mr.source_branch,
            target_branch: mr.target_branch,
            web_url: mr.web_url
          })), null, 2)
        }]
      };
    } catch (error) {
      console.error(`Error fetching merge requests for project ${projectId}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error fetching merge requests: ${error.message}`
        }]
      };
    }
  }
);

// Get single merge request details
server.resource(
  "merge-request",
  "gitlab://projects/{projectId}/merge_requests/{mergeRequestIid}",
  async (uri, { projectId, mergeRequestIid }) => {
    try {
      const api = getGitLabClient();
      const mergeRequest = await api.MergeRequests.show(projectId, mergeRequestIid);
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(mergeRequest, null, 2)
        }]
      };
    } catch (error) {
      console.error(`Error fetching merge request ${mergeRequestIid} for project ${projectId}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error fetching merge request: ${error.message}`
        }]
      };
    }
  }
);

// List project commits resource
server.resource(
  "commits",
  "gitlab://projects/{projectId}/commits",
  async (uri, { projectId }) => {
    try {
      const api = getGitLabClient();
      const commits = await api.Commits.all(projectId, { perPage: 20 });
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(commits.map(c => ({
            id: c.id,
            short_id: c.short_id,
            title: c.title,
            message: c.message,
            author_name: c.author_name,
            author_email: c.author_email,
            created_at: c.created_at,
            web_url: c.web_url
          })), null, 2)
        }]
      };
    } catch (error) {
      console.error(`Error fetching commits for project ${projectId}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error fetching commits: ${error.message}`
        }]
      };
    }
  }
);

// List branches resource
server.resource(
  "branches",
  "gitlab://projects/{projectId}/branches",
  async (uri, { projectId }) => {
    try {
      const api = getGitLabClient();
      const branches = await api.Branches.all(projectId);
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(branches.map(b => ({
            name: b.name,
            merged: b.merged,
            protected: b.protected,
            default: b.default,
            developers_can_push: b.developers_can_push,
            developers_can_merge: b.developers_can_merge,
            web_url: b.web_url
          })), null, 2)
        }]
      };
    } catch (error) {
      console.error(`Error fetching branches for project ${projectId}:`, error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error fetching branches: ${error.message}`
        }]
      };
    }
  }
);

// --- TOOLS ---

// Create issue tool
server.tool(
  "create-issue",
  {
    projectId: z.number().or(z.string()),
    title: z.string(),
    description: z.string().optional(),
    labels: z.array(z.string()).optional(),
    assigneeId: z.number().optional()
  },
  async ({ projectId, title, description, labels, assigneeId }) => {
    try {
      const api = getGitLabClient();
      const issue = await api.Issues.create(projectId, {
        title,
        description: description || '',
        labels: labels ? labels.join(',') : undefined,
        assignee_id: assigneeId
      });
      
      return {
        content: [{
          type: "text",
          text: `Issue created successfully!\n\nIssue #${issue.iid}: ${issue.title}\nURL: ${issue.web_url}`
        }]
      };
    } catch (error) {
      console.error('Error creating issue:', error);
      return {
        content: [{
          type: "text",
          text: `Error creating issue: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Add comment to issue tool
server.tool(
  "comment-on-issue",
  {
    projectId: z.number().or(z.string()),
    issueIid: z.number().or(z.string()),
    body: z.string()
  },
  async ({ projectId, issueIid, body }) => {
    try {
      const api = getGitLabClient();
      const note = await api.IssueNotes.create(projectId, issueIid, body);
      
      return {
        content: [{
          type: "text",
          text: `Comment added successfully to issue #${issueIid}!`
        }]
      };
    } catch (error) {
      console.error('Error adding comment:', error);
      return {
        content: [{
          type: "text",
          text: `Error adding comment: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Close issue tool
server.tool(
  "close-issue",
  {
    projectId: z.number().or(z.string()),
    issueIid: z.number().or(z.string())
  },
  async ({ projectId, issueIid }) => {
    try {
      const api = getGitLabClient();
      await api.Issues.edit(projectId, issueIid, { stateEvent: 'close' });
      
      return {
        content: [{
          type: "text",
          text: `Issue #${issueIid} closed successfully!`
        }]
      };
    } catch (error) {
      console.error('Error closing issue:', error);
      return {
        content: [{
          type: "text",
          text: `Error closing issue: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Search tool
server.tool(
  "search-gitlab",
  {
    scope: z.enum(['projects', 'issues', 'merge_requests', 'milestones', 'users']),
    query: z.string(),
    projectId: z.number().or(z.string()).optional()
  },
  async ({ scope, query, projectId }) => {
    try {
      const api = getGitLabClient();
      let results;
      
      if (projectId && ['issues', 'merge_requests', 'milestones'].includes(scope)) {
        // Project-scoped search
        results = await api.Search.all(scope, query, { projectId });
      } else {
        // Global search
        results = await api.Search.all(scope, query);
      }
      
      return {
        content: [{
          type: "text",
          text: `Search results for "${query}" in ${scope}:\n\n${JSON.stringify(results, null, 2)}`
        }]
      };
    } catch (error) {
      console.error('Error searching GitLab:', error);
      return {
        content: [{
          type: "text",
          text: `Error searching GitLab: ${error.message}`
        }],
        isError: true
      };
    }
  }
);
// Create merge request tool
server.tool(
  "create-merge-request",
  {
    projectId: z.number().or(z.string()),
    sourceBranch: z.string(),
    targetBranch: z.string(),
    title: z.string(),
    description: z.string().optional(),
    removeSourceBranch: z.boolean().optional(),
    squash: z.boolean().optional()
  },
  async ({ projectId, sourceBranch, targetBranch, title, description, removeSourceBranch, squash }) => {
    try {
      const api = getGitLabClient();
      const mergeRequest = await api.MergeRequests.create(
        projectId, 
        sourceBranch, 
        targetBranch, 
        title, 
        {
          description: description || '',
          remove_source_branch: removeSourceBranch,
          squash: squash
        }
      );
      
      return {
        content: [{
          type: "text",
          text: `Merge request created successfully!\n\nMerge Request #${mergeRequest.iid}: ${mergeRequest.title}\nURL: ${mergeRequest.web_url}`
        }]
      };
    } catch (error) {
      console.error('Error creating merge request:', error);
      return {
        content: [{
          type: "text",
          text: `Error creating merge request: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Accept/Merge a merge request tool
server.tool(
  "accept-merge-request",
  {
    projectId: z.number().or(z.string()),
    mergeRequestIid: z.number().or(z.string()),
    shouldRemoveSourceBranch: z.boolean().optional(),
    mergeMessage: z.string().optional()
  },
  async ({ projectId, mergeRequestIid, shouldRemoveSourceBranch, mergeMessage }) => {
    try {
      const api = getGitLabClient();
      await api.MergeRequests.accept(
        projectId, 
        mergeRequestIid, 
        {
          should_remove_source_branch: shouldRemoveSourceBranch,
          merge_commit_message: mergeMessage
        }
      );
      
      return {
        content: [{
          type: "text",
          text: `Merge request #${mergeRequestIid} has been accepted and merged successfully!`
        }]
      };
    } catch (error) {
      console.error('Error accepting merge request:', error);
      return {
        content: [{
          type: "text",
          text: `Error accepting merge request: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Comment on merge request tool
server.tool(
  "comment-on-merge-request",
  {
    projectId: z.number().or(z.string()),
    mergeRequestIid: z.number().or(z.string()),
    body: z.string()
  },
  async ({ projectId, mergeRequestIid, body }) => {
    try {
      const api = getGitLabClient();
      const note = await api.MergeRequestNotes.create(projectId, mergeRequestIid, body);
      
      return {
        content: [{
          type: "text",
          text: `Comment added successfully to merge request #${mergeRequestIid}!`
        }]
      };
    } catch (error) {
      console.error('Error adding comment to merge request:', error);
      return {
        content: [{
          type: "text",
          text: `Error adding comment to merge request: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Create branch tool
server.tool(
  "create-branch",
  {
    projectId: z.number().or(z.string()),
    branchName: z.string(),
    ref: z.string()  // Branch or commit SHA to create branch from
  },
  async ({ projectId, branchName, ref }) => {
    try {
      const api = getGitLabClient();
      const branch = await api.Branches.create(projectId, branchName, ref);
      
      return {
        content: [{
          type: "text",
          text: `Branch '${branch.name}' created successfully from ${ref}!\nURL: ${branch.web_url}`
        }]
      };
    } catch (error) {
      console.error('Error creating branch:', error);
      return {
        content: [{
          type: "text",
          text: `Error creating branch: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Get pipeline status tool
server.tool(
  "get-pipeline-status",
  {
    projectId: z.number().or(z.string()),
    pipelineId: z.number().optional(),  // If not provided, get the latest pipeline
  },
  async ({ projectId, pipelineId }) => {
    try {
      const api = getGitLabClient();
      let pipeline;
      
      if (pipelineId) {
        // Get specific pipeline
        pipeline = await api.Pipelines.show(projectId, pipelineId);
      } else {
        // Get latest pipeline
        const pipelines = await api.Pipelines.all(projectId, { perPage: 1 });
        if (pipelines.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No pipelines found for this project."
            }]
          };
        }
        pipeline = pipelines[0];
      }
      
      // Get pipeline details with jobs
      const pipelineDetails = await api.Pipelines.show(projectId, pipeline.id);
      const jobs = await api.Jobs.showPipelineJobs(projectId, pipeline.id);
      
      const jobSummary = jobs.map(job => ({
        name: job.name,
        stage: job.stage,
        status: job.status,
        started_at: job.started_at,
        finished_at: job.finished_at
      }));
      
      return {
        content: [{
          type: "text",
          text: `Pipeline #${pipeline.id}\nStatus: ${pipeline.status}\nRef: ${pipeline.ref}\nSHA: ${pipeline.sha}\nCreated: ${pipeline.created_at}\n\nJobs:\n${JSON.stringify(jobSummary, null, 2)}`
        }]
      };
    } catch (error) {
      console.error('Error getting pipeline status:', error);
      return {
        content: [{
          type: "text",
          text: `Error getting pipeline status: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
