import { getPosition, savePositionOpen, deletePosition } from "../db";
import { BalanceChange } from "../helius/parser";
import { getPrices } from "../pricing/jupiter";
import { WSOL_MINT } from "../config";

export interface ValuedChange extends BalanceChange {
  usd: number;
  symbol: string;
}

function toPriceMint(mint: string): string {
  return mint === "SOL" ? WSOL_MINT : mint;
}

export async function valueBalanceChanges(
  changes: BalanceChange[],
  symbolOf: (mint: string) => Promise<string>
): Promise<ValuedChange[]> {
  const priceMints = Array.from(new Set(changes.map((c) => toPriceMint(c.mint))));
  const prices = await getPrices(priceMints);

  const out: ValuedChange[] = [];
  for (const c of changes) {
    const price = prices[toPriceMint(c.mint)] ?? 0;
    const symbol = await symbolOf(c.mint);
    out.push({ ...c, usd: c.amount * price, symbol });
  }
  return out;
}

export interface OpenResult {
  depositUsd: number;
}

/** Records the USD cost basis of a newly opened position for later PnL calculation on close. */
export function recordOpen(params: {
  positionAddress: string;
  walletAddress: string;
  poolAddress: string;
  signature: string;
  timestamp: number;
  valuedChanges: ValuedChange[];
}): OpenResult {
  const depositUsd = params.valuedChanges.filter((c) => c.usd < 0).reduce((sum, c) => sum + Math.abs(c.usd), 0);
  savePositionOpen({
    position_address: params.positionAddress,
    wallet_address: params.walletAddress,
    pool_address: params.poolAddress,
    deposit_usd: depositUsd,
    open_tx_signature: params.signature,
    opened_at: params.timestamp * 1000,
  });
  return { depositUsd };
}

export interface CloseResult {
  totalReceivedUsd: number;
  depositUsd: number | null;
  feeUsd: number;
  pnlUsd: number | null;
  pnlPct: number | null;
}

/**
 * Computes close-time PnL against the deposit basis stored at open time.
 * `feeUsd` is a best-effort estimate combining the open+close Solana network
 * fees (converted at current SOL price); DAMM v2 does not expose a single
 * authoritative "position fee" figure on-chain, so this will not exactly
 * match third-party trackers that use their own fee accounting.
 */
export function recordClose(params: {
  positionAddress: string;
  valuedChanges: ValuedChange[];
  networkFeeUsd: number;
}): CloseResult {
  const totalReceivedUsd = params.valuedChanges.filter((c) => c.usd > 0).reduce((sum, c) => sum + c.usd, 0);
  const position = getPosition(params.positionAddress);
  const depositUsd = position ? position.deposit_usd : null;
  const feeUsd = params.networkFeeUsd;

  let pnlUsd: number | null = null;
  let pnlPct: number | null = null;
  if (depositUsd !== null && depositUsd > 0) {
    pnlUsd = totalReceivedUsd - depositUsd - feeUsd;
    pnlPct = (pnlUsd / depositUsd) * 100;
  }

  if (position) deletePosition(params.positionAddress);

  return { totalReceivedUsd, depositUsd, feeUsd, pnlUsd, pnlPct };
}
