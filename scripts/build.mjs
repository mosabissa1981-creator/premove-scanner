import { execSync } from "node:child_process";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

if (process.env.WORKERS_CI === "1") {
  run("npm --prefix scorch-hot ci");
  run("npm --prefix scorch-hot run build");
} else {
  run("next build");
}
