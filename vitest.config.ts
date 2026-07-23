import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // CLI/hook/MCP/evaluation entrypoints are exercised in subprocess and
      // smoke gates, whose coverage is not merged into V8's in-process report.
      exclude: [
        "src/**/main.ts",
        "src/cli.ts",
        "src/evaluation/**",
        "src/hooks/**",
        "src/mcp/server.ts"
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 85,
        lines: 82
      }
    }
  }
});
