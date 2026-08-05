import { config } from "./config";
import { createServer } from "./server";
import "./telegram/bot";

const app = createServer();

app.listen(config.server.port, () => {
  console.log(`DAMM v2 tracker listening on port ${config.server.port}`);
  console.log(`Helius webhook endpoint: ${config.helius.publicWebhookUrl}`);
});
