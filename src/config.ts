import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    adminId: process.env.TELEGRAM_ADMIN_ID || "",
  },
  helius: {
    apiKey: required("HELIUS_API_KEY"),
    publicWebhookUrl: required("PUBLIC_WEBHOOK_URL"),
    webhookSecret: required("HELIUS_WEBHOOK_SECRET"),
  },
  server: {
    port: Number(process.env.PORT || 3000),
  },
  db: {
    path: process.env.DB_PATH || "./data/tracker.db",
  },
  jupiter: {
    priceApi: process.env.JUPITER_PRICE_API || "https://lite-api.jup.ag/price/v2",
  },
  links: {
    portoTemplate: process.env.PORTO_URL_TEMPLATE || "https://lpagent.io/portfolio/{wallet}",
    poolTemplate: process.env.POOL_URL_TEMPLATE || "https://lpagent.io/pools/{pool}",
    gmgnTemplate: process.env.GMGN_URL_TEMPLATE || "https://gmgn.ai/sol/address/{wallet}",
  },
};

export const DAMM_V2_PROGRAM_ID = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
export const WSOL_MINT = "So11111111111111111111111111111111111111";
