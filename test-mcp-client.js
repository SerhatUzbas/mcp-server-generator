// test-mcp-client.js
import { spawn } from "child_process";
import { createInterface } from "readline";

// Function to send a message to the MCP server
function testMcpServer() {
  console.log("Starting MCP client test...");

  // Start the MCP server process
  const server = spawn("node", [
    "--loader",
    "ts-node/esm",
    "creator-server.ts",
  ]);

  // Create interface to read from server's stdout
  const rl = createInterface({
    input: server.stdout,
    crlfDelay: Infinity,
  });

  // Handle server output
  rl.on("line", (line) => {
    console.log("Server output:", line);

    try {
      const data = JSON.parse(line);

      // If the server is ready (sent an init message), send our test command
      if (
        data.version === "mcp-0.2" &&
        data.message &&
        data.message.type === "init"
      ) {
        console.log("Server is ready. Sending test command...");

        // Create the installServerDependencies command
        const command = {
          version: "mcp-0.2",
          message: {
            tool: "installServerDependencies",
            params: {
              dependencies: ["axios"],
            },
          },
        };

        // Send command to server's stdin
        server.stdin.write(JSON.stringify(command) + "\n");
      }

      // If we receive a response for our tool call, clean up
      if (
        data.version === "mcp-0.2" &&
        data.message &&
        data.message.type === "tool"
      ) {
        console.log(
          "Received tool response:",
          JSON.stringify(data.message, null, 2)
        );
        console.log("Test completed. Shutting down...");

        // Close the server
        server.kill();
        process.exit(0);
      }
    } catch (error) {
      console.error("Error processing server output:", error);
    }
  });

  // Handle server errors
  server.stderr.on("data", (data) => {
    console.error("Server error:", data.toString());
  });

  // Handle server close
  server.on("close", (code) => {
    console.log(`Server process exited with code ${code}`);
  });
}

testMcpServer();
