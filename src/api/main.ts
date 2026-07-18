import { assertCredentials, loadConfig } from "../config.js";
import { createApiServer, listen } from "./server.js";

try {
  assertCredentials(loadConfig());
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const port = Number.parseInt(process.env.GRACE_API_PORT || "4317", 10);
const server = createApiServer();
const address = await listen(server, port);
process.stderr.write(`Grace API listening at http://${address.host}:${address.port}\n`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
