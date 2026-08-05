import { WSOL_MINT } from "../config";

const symbolCache = new Map<string, string>();
symbolCache.set(WSOL_MINT, "SOL");

function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}..${mint.slice(-4)}`;
}

/** Resolves a mint address to its token symbol via Jupiter's token metadata API, falling back to a shortened mint address. */
export async function getTokenSymbol(mint: string): Promise<string> {
  if (mint === "SOL") return "SOL";
  const cached = symbolCache.get(mint);
  if (cached) return cached;

  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v1/token/${mint}`);
    if (res.ok) {
      const json = (await res.json()) as { symbol?: string };
      if (json?.symbol) {
        symbolCache.set(mint, json.symbol);
        return json.symbol;
      }
    }
  } catch {
    // ignore, fall through to fallback below
  }

  const fallback = shortMint(mint);
  symbolCache.set(mint, fallback);
  return fallback;
}
