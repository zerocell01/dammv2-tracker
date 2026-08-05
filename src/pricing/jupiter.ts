import { config, WSOL_MINT } from "../config";

const priceCache = new Map<string, { price: number; expiresAt: number }>();
const PRICE_TTL_MS = 15_000;

async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const url = `${config.jupiter.priceApi}?ids=${mints.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jupiter price API failed: ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, { price?: string | number }> };
  const out: Record<string, number> = {};
  for (const mint of mints) {
    const entry = json.data?.[mint];
    if (entry?.price) out[mint] = Number(entry.price);
  }
  return out;
}

/** Returns USD price for each mint, using a short-lived in-memory cache. */
export async function getPrices(mints: string[]): Promise<Record<string, number>> {
  const now = Date.now();
  const uncached = mints.filter((m) => {
    const c = priceCache.get(m);
    return !c || c.expiresAt < now;
  });

  if (uncached.length > 0) {
    const fresh = await fetchPrices(uncached);
    for (const m of uncached) {
      if (fresh[m] !== undefined) priceCache.set(m, { price: fresh[m], expiresAt: now + PRICE_TTL_MS });
    }
  }

  const out: Record<string, number> = {};
  for (const m of mints) {
    const c = priceCache.get(m);
    if (c) out[m] = c.price;
  }
  return out;
}

export async function getSolPrice(): Promise<number> {
  const prices = await getPrices([WSOL_MINT]);
  return prices[WSOL_MINT] ?? 0;
}
