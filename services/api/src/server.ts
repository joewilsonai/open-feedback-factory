import { OpenFeedbackStore } from "@open-feedback-factory/db";
import { buildApp } from "./app.js";
import { readConfig } from "./config.js";

const config = readConfig();

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required to start the API");
}

const store = new OpenFeedbackStore(config.databaseUrl);
const app = await buildApp({ config, store });

await app.listen({
  host: config.apiHost,
  port: config.apiPort,
});

console.log(`Open Feedback Factory API listening on http://${config.apiHost}:${config.apiPort}`);

const close = async () => {
  await app.close();
  await store.close();
};

process.on("SIGINT", () => {
  close().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  close().finally(() => process.exit(0));
});
