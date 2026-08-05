import { getWallet, listWallets } from "./db";
import { HeliusEnhancedTransaction, parseDammEvent } from "./helius/parser";
import { getTokenSymbol } from "./pricing/metadata";
import { getSolPrice } from "./pricing/jupiter";
import { valueBalanceChanges, recordOpen, recordClose } from "./positions/pnl";
import { formatOpenMessage, formatCloseMessage } from "./telegram/format";
import { broadcast } from "./telegram/bot";
import { WSOL_MINT } from "./config";

async function resolvePoolName(tokenAMint: string | null, tokenBMint: string | null): Promise<string> {
  if (!tokenAMint || !tokenBMint) return "Unknown Pool";
  const [symA, symB] = await Promise.all([getTokenSymbol(tokenAMint), getTokenSymbol(tokenBMint)]);
  const isASol = tokenAMint === WSOL_MINT;
  const isBSol = tokenBMint === WSOL_MINT;
  if (isASol && !isBSol) return `${symB}-${symA}`;
  return `${symA}-${symB}`;
}

export async function handleHeliusTransactions(txs: HeliusEnhancedTransaction[]): Promise<void> {
  const trackedWallets = new Set(listWallets().map((w) => w.address));
  if (trackedWallets.size === 0) return;

  for (const tx of txs) {
    try {
      await handleOne(tx, trackedWallets);
    } catch (err) {
      console.error(`Failed to process tx ${tx.signature}:`, err);
    }
  }
}

async function handleOne(tx: HeliusEnhancedTransaction, trackedWallets: Set<string>): Promise<void> {
  const event = parseDammEvent(tx, trackedWallets);
  if (!event) return;

  const wallet = getWallet(event.owner);
  if (!wallet) return;

  const poolName = await resolvePoolName(event.tokenAMint, event.tokenBMint);
  const valuedChanges = await valueBalanceChanges(event.balanceChanges, getTokenSymbol);

  if (event.type === "OPEN") {
    recordOpen({
      positionAddress: event.position,
      walletAddress: wallet.address,
      poolAddress: event.pool,
      signature: event.signature,
      timestamp: event.timestamp,
      valuedChanges,
    });

    const text = formatOpenMessage({
      wallet,
      poolName,
      poolAddress: event.pool,
      valuedChanges,
      signature: event.signature,
      timestamp: event.timestamp,
    });
    await broadcast(text);
    return;
  }

  const solPrice = await getSolPrice();
  const networkFeeUsd = (tx.fee / 1e9) * solPrice;
  const close = recordClose({ positionAddress: event.position, valuedChanges, networkFeeUsd });

  const text = formatCloseMessage({
    wallet,
    poolName,
    poolAddress: event.pool,
    valuedChanges,
    signature: event.signature,
    timestamp: event.timestamp,
    close,
  });
  await broadcast(text);
}
