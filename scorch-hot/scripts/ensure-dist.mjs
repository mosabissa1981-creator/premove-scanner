import { existsSync } from "node:fs";
import { resolve } from "node:path";

const indexPath = resolve("dist/index.html");

if (!existsSync(indexPath)) {
  console.error("scorch-hot: dist/index.html is missing.");
  console.error("");
  console.error("Cloudflare Workers Builds should use:");
  console.error("  Root directory: scorch-hot");
  console.error("  Build command: npm run build");
  console.error("  Deploy command: npx wrangler deploy");
  console.error("  Non-production branch deploy command: npx wrangler versions upload");
  console.error("");
  console.error(
    "Remove any Pages-style deploy command (for example: wrangler deploy dist --project-name ...).",
  );
  process.exit(1);
}
