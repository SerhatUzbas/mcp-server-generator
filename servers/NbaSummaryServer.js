import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import https from "https";
import * as cheerio from "cheerio";

// Initialize the MCP server with metadata
const server = new McpServer({
  name: "NbaSummaryServer",
  version: "1.0.3",
  description: "An MCP server that provides NBA game information from ESPN",
});

// Create a custom HTTPS agent with SSL verification disabled
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

// Get recent NBA games summary
server.tool("getRecentNbaSummary", {}, async () => {
  try {
    // Using ESPN's NBA scoreboard page
    const response = await axios.get("https://www.espn.com/nba/scoreboard", {
      httpsAgent: httpsAgent,
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const games = [];

    // ESPN structures games in containers
    $(".ScoreboardScoreCell").each((index, element) => {
      try {
        const $element = $(element);

        // Team names
        const teams = [];
        $element.find(".ScoreCell__TeamName").each((i, teamElement) => {
          teams.push($(teamElement).text().trim());
        });

        // Scores
        const scores = [];
        $element.find(".ScoreCell__Score").each((i, scoreElement) => {
          scores.push($(scoreElement).text().trim());
        });

        // Game status
        let status = $element
          .find(".ScoreboardScoreCell__Overview")
          .text()
          .trim();
        if (!status) {
          status = $element.find(".ScoreboardScoreCell__Time").text().trim();
        }

        if (teams.length >= 2) {
          games.push({
            homeTeam: teams[0],
            homeScore: scores[0] || "0",
            visitorTeam: teams[1],
            visitorScore: scores[1] || "0",
            status: status,
          });
        }
      } catch (err) {
        console.error("Error parsing game element:", err);
      }
    });

    // If we couldn't parse games with the above method, try an alternative structure
    if (games.length === 0) {
      $(".Scoreboard").each((index, element) => {
        try {
          const $element = $(element);

          // Team names and scores
          const teamData = [];
          $element.find(".Scoreboard__Cellgroup").each((i, teamGroup) => {
            const $team = $(teamGroup);
            const teamName = $team.find(".ScoreCell__TeamName").text().trim();
            const score = $team.find(".ScoreCell__Score").text().trim();
            teamData.push({ name: teamName, score: score || "0" });
          });

          // Game status
          let status = $element.find(".Scoreboard__Status").text().trim();

          if (teamData.length >= 2) {
            games.push({
              homeTeam: teamData[0].name,
              homeScore: teamData[0].score,
              visitorTeam: teamData[1].name,
              visitorScore: teamData[1].score,
              status: status,
            });
          }
        } catch (err) {
          console.error("Error parsing alternative game element:", err);
        }
      });
    }

    // If we still couldn't get games, try yet another alternative
    if (games.length === 0) {
      // Simple text extraction as fallback
      const pageText = $("body").text();
      return {
        content: [
          {
            type: "text",
            text: "Could not parse ESPN scoreboard structure, but retrieved the page successfully. Please visit ESPN.com directly for the latest scores.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Recent NBA Games:\n${JSON.stringify(games, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    // Provide more detailed error information
    const errorMsg = `Failed to fetch NBA game data: ${error.message}`;
    console.error(errorMsg);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      return {
        content: [{ type: "text", text: errorMsg }],
      };
    }
    return {
      content: [{ type: "text", text: errorMsg }],
    };
  }
});

// Get details for a specific team's games
server.tool(
  "getTeamGameDetails",
  {
    teamName: z
      .string()
      .describe("The name of the NBA team to get game details for"),
  },
  async ({ teamName }) => {
    try {
      // Using ESPN's NBA scoreboard page
      const response = await axios.get("https://www.espn.com/nba/scoreboard", {
        httpsAgent: httpsAgent,
      });

      const html = response.data;
      const $ = cheerio.load(html);
      const games = [];
      const teamNameLower = teamName.toLowerCase();

      // Parse games and filter for the requested team
      $(".ScoreboardScoreCell").each((index, element) => {
        try {
          const $element = $(element);

          // Team names
          const teams = [];
          $element.find(".ScoreCell__TeamName").each((i, teamElement) => {
            teams.push($(teamElement).text().trim());
          });

          // Scores
          const scores = [];
          $element.find(".ScoreCell__Score").each((i, scoreElement) => {
            scores.push($(scoreElement).text().trim());
          });

          // Game status
          let status = $element
            .find(".ScoreboardScoreCell__Overview")
            .text()
            .trim();
          if (!status) {
            status = $element.find(".ScoreboardScoreCell__Time").text().trim();
          }

          if (
            teams.length >= 2 &&
            (teams[0].toLowerCase().includes(teamNameLower) ||
              teams[1].toLowerCase().includes(teamNameLower))
          ) {
            games.push({
              homeTeam: teams[0],
              homeScore: scores[0] || "0",
              visitorTeam: teams[1],
              visitorScore: scores[1] || "0",
              status: status,
            });
          }
        } catch (err) {
          console.error("Error parsing game element:", err);
        }
      });

      // Try alternative structure if needed
      if (games.length === 0) {
        $(".Scoreboard").each((index, element) => {
          try {
            const $element = $(element);

            // Team names and scores
            const teamData = [];
            $element.find(".Scoreboard__Cellgroup").each((i, teamGroup) => {
              const $team = $(teamGroup);
              const teamName = $team.find(".ScoreCell__TeamName").text().trim();
              const score = $team.find(".ScoreCell__Score").text().trim();
              teamData.push({ name: teamName, score: score || "0" });
            });

            // Game status
            let status = $element.find(".Scoreboard__Status").text().trim();

            if (
              teamData.length >= 2 &&
              (teamData[0].name.toLowerCase().includes(teamNameLower) ||
                teamData[1].name.toLowerCase().includes(teamNameLower))
            ) {
              games.push({
                homeTeam: teamData[0].name,
                homeScore: teamData[0].score,
                visitorTeam: teamData[1].name,
                visitorScore: teamData[1].score,
                status: status,
              });
            }
          } catch (err) {
            console.error("Error parsing alternative game element:", err);
          }
        });
      }

      if (games.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No current games found for team "${teamName}". The team may not be playing today or the team name may be incorrect.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Games for ${teamName}:\n${JSON.stringify(games, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      // Provide more detailed error information
      const errorMsg = `Failed to fetch team game data: ${error.message}`;
      console.error(errorMsg);
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
      }
      return {
        content: [{ type: "text", text: errorMsg }],
      };
    }
  }
);

// Connect the server to the stdio transport
const transport = new StdioServerTransport();
server.connect(transport);
