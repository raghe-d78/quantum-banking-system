const app = require("./app");
const log = require("/shared/logger")("ledger-service");
const PORT = process.env.PORT || 3003;
const server = app.listen(PORT, () => log.info("ledger-service listening", { port: Number(PORT) }));
const shutdown = (signal) => { log.info("shutting down", { signal }); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10_000).unref(); };
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
