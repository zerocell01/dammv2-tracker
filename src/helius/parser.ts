import bs58 from "bs58";
import { DAMM_V2_PROGRAM_ID } from "../config";
import { ACCOUNTS, identifyInstruction } from "./idl";

export interface RawInstruction {
  accounts: string[];
  data: string;
  programId: string;
  innerInstructions?: RawInstruction[];
}

export interface TokenBalanceChange {
  userAccount: string;
  tokenAccount: string;
  mint: string;
  rawTokenAmount: { tokenAmount: string; decimals: number };
}

export interface AccountDataEntry {
  account: string;
  nativeBalanceChange: number;
  tokenBalanceChanges: TokenBalanceChange[];
}

export interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  fee: number;
  feePayer: string;
  accountData: AccountDataEntry[];
  instructions: RawInstruction[];
}

export interface BalanceChange {
  mint: string; // "SOL" for native
  amount: number; // signed, human units (already divided by decimals)
  decimals: number;
}

export type DammEventType = "OPEN" | "CLOSE";

export interface DammEvent {
  type: DammEventType;
  signature: string;
  timestamp: number;
  owner: string;
  pool: string;
  position: string;
  tokenAMint: string | null;
  tokenBMint: string | null;
  balanceChanges: BalanceChange[];
}

function flattenInstructions(ixs: RawInstruction[]): RawInstruction[] {
  const out: RawInstruction[] = [];
  for (const ix of ixs) {
    out.push(ix);
    if (ix.innerInstructions?.length) out.push(...flattenInstructions(ix.innerInstructions));
  }
  return out;
}

function decodeData(data: string): Uint8Array {
  try {
    return bs58.decode(data);
  } catch {
    return new Uint8Array();
  }
}

/**
 * Parses a Helius enhanced-transaction payload and returns a DammEvent if the
 * transaction represents a DAMM v2 "open position" (create_position) or
 * "close position" (close_position) instruction. Returns null otherwise
 * (e.g. plain add/remove-liquidity-on-existing-position or unrelated txs).
 */
export function parseDammEvent(tx: HeliusEnhancedTransaction, trackedWallets: Set<string>): DammEvent | null {
  const allIxs = flattenInstructions(tx.instructions || []);
  const dammIxs = allIxs.filter((ix) => ix.programId === DAMM_V2_PROGRAM_ID);
  if (dammIxs.length === 0) return null;

  let createIx: RawInstruction | null = null;
  let addLiquidityIx: RawInstruction | null = null;
  let closeIx: RawInstruction | null = null;
  let removeLiquidityIx: RawInstruction | null = null;

  for (const ix of dammIxs) {
    const name = identifyInstruction(decodeData(ix.data));
    if (name === "create_position") createIx = ix;
    else if (name === "add_liquidity") addLiquidityIx = ix;
    else if (name === "close_position") closeIx = ix;
    else if (name === "remove_liquidity" || name === "remove_all_liquidity") removeLiquidityIx = ix;
  }

  let type: DammEventType;
  let owner: string;
  let pool: string;
  let position: string;
  let tokenAMint: string | null = null;
  let tokenBMint: string | null = null;

  if (closeIx) {
    type = "CLOSE";
    const a = ACCOUNTS.close_position;
    owner = closeIx.accounts[a.owner];
    pool = closeIx.accounts[a.pool];
    position = closeIx.accounts[a.position];
    if (removeLiquidityIx) {
      const ra = ACCOUNTS.remove_liquidity;
      tokenAMint = removeLiquidityIx.accounts[ra.token_a_mint];
      tokenBMint = removeLiquidityIx.accounts[ra.token_b_mint];
    }
  } else if (createIx) {
    type = "OPEN";
    const a = ACCOUNTS.create_position;
    owner = createIx.accounts[a.owner];
    pool = createIx.accounts[a.pool];
    position = createIx.accounts[a.position];
    if (addLiquidityIx) {
      const aa = ACCOUNTS.add_liquidity;
      tokenAMint = addLiquidityIx.accounts[aa.token_a_mint];
      tokenBMint = addLiquidityIx.accounts[aa.token_b_mint];
    }
  } else {
    // Only add/remove liquidity on an already-open position, or fee claims -
    // not an open/close event we alert on.
    return null;
  }

  if (!trackedWallets.has(owner)) return null;

  const balanceChanges = extractBalanceChanges(tx, owner);

  return {
    type,
    signature: tx.signature,
    timestamp: tx.timestamp,
    owner,
    pool,
    position,
    tokenAMint,
    tokenBMint,
    balanceChanges,
  };
}

function extractBalanceChanges(tx: HeliusEnhancedTransaction, wallet: string): BalanceChange[] {
  const entry = (tx.accountData || []).find((e) => e.account === wallet);
  if (!entry) return [];

  const changes: BalanceChange[] = [];

  if (entry.nativeBalanceChange && entry.nativeBalanceChange !== 0) {
    changes.push({ mint: "SOL", amount: entry.nativeBalanceChange / 1e9, decimals: 9 });
  }

  for (const tbc of entry.tokenBalanceChanges || []) {
    const raw = Number(tbc.rawTokenAmount.tokenAmount);
    if (raw === 0) continue;
    const amount = raw / 10 ** tbc.rawTokenAmount.decimals;
    changes.push({ mint: tbc.mint, amount, decimals: tbc.rawTokenAmount.decimals });
  }

  return changes;
}
