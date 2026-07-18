import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { build } from "esbuild";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(projectRoot, "dist");
if (dirname(outputDirectory) !== projectRoot || basename(outputDirectory) !== "dist") {
  throw new Error(`Refusing to clean unexpected build path: ${outputDirectory}`);
}
await rm(outputDirectory, { recursive: true, force: true });
await build({
  absWorkingDir: projectRoot,
  entryPoints: {
    "cli": "src/cli.ts",
    "api/main": "src/api/main.ts",
    "hooks/on-prompt": "src/hooks/on-prompt.ts",
    "mcp/server": "src/mcp/server.ts"
  },
  outdir: outputDirectory,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  minify: false,
  legalComments: "none",
  logLevel: "info"
});
