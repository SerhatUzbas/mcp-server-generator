// test-install-dependencies.js
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

async function testInstallDependencies() {
  console.log("Testing dependency installation...");

  try {
    // Clean npm cache first
    await execAsync("npm cache clean --force");
    console.log("npm cache cleaned successfully");

    // Add a small delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Install axios with the same flags as in the tool
    const { stdout, stderr } = await execAsync(
      "npm install axios --no-package-lock --no-audit --no-fund --prefer-offline"
    );

    console.log("Installation stdout:", stdout);

    if (stderr && !stderr.includes("npm WARN")) {
      console.error("Installation stderr:", stderr);
    }

    console.log("Dependencies installed successfully");
  } catch (error) {
    console.error("Installation error:", error);
  }
}

testInstallDependencies().catch(console.error);
