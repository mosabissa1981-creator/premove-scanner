import { execSync } from "node:child_process";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

const isPreview =
  process.env.WORKERS_CI_BRANCH && process.env.WORKERS_CI_BRANCH !== "main";

run("node scripts/build.mjs");
run(isPreview ? "npx wrangler versions upload" : "npx wrangler deploy");
