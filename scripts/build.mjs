import { execSync } from "node:child_process";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

const isWorkersCi = Boolean(
  process.env.WORKERS_CI ||
    process.env.WORKERS_CI_BUILD_UUID ||
    process.env.WORKERS_CI_BRANCH,
);

if (isWorkersCi) {
  console.log("Cloudflare Workers Builds detected — building scorch-hot");
  run("npm --prefix scorch-hot install --no-audit --no-fund");
  run("npm --prefix scorch-hot run build");
} else {
  console.log("Building PreMove (Next.js)");
  if (process.env.DATABASE_URL) {
    run("npx prisma generate");
  }
  run("next build");
}
