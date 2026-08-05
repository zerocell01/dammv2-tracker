import { config } from "./config";
import { createServer } from "./server";
import { startHeliusListener } from "./helius/ws";
import "./telegram/bot";

const app = createServer();

app.listen(config.server.port, () => {
  console.log(`Health check server listening on port ${config.server.port}`);
});

startHeliusListener();
