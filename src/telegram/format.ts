import { config } from "../config";
import { Wallet } from "../db";
import { ValuedChange, CloseResult } from "../positions/pnl";
import { DammEventType } from "../helius/parser";

export interface InlineButton {
  text: string;
  url: string;
}

function fillTemplate(template: string, wallet: string, pool?: string): string {
  return template.replace("{wallet}", wallet).replace("{pool}", pool ?? "");
}

function fmtAmount(n: number): string {
  return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtUsd(n: number, withSign = false): string {
  const abs = Math.abs(n);
  const sign = withSign ? (n >= 0 ? "+" : "-") : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildButtons(wallet: Wallet, poolAddress: string): InlineButton[] {
  const portoUrl = wallet.porto_url || fillTemplate(config.links.portoTemplate, wallet.address);
  const poolUrl = fillTemplate(config.links.poolTemplate, wallet.address, poolAddress);
  const gmgnUrl = fillTemplate(config.links.gmgnTemplate, wallet.address);
  return [
    { text: "GMGN", url: gmgnUrl },
    { text: "Pool", url: poolUrl },
    { text: "LPAgent", url: portoUrl },
  ];
}

export interface FormatOpenParams {
  wallet: Wallet;
  poolName: string;
  poolAddress: string;
  valuedChanges: ValuedChange[];
  signature: string;
  timestamp: number;
}

export function formatOpenMessage(p: FormatOpenParams): string {
  const totalUsd = p.valuedChanges.reduce((sum, c) => sum + Math.abs(c.usd), 0);
  const items = p.valuedChanges.map((c) => `${fmtAmount(c.amount)} ${c.symbol} (${fmtUsd(c.usd)})`).join(" + ");

  return [`🔷 OPEN : ${p.wallet.label} -> ${p.poolName}`, `💵 Deposit : (${fmtUsd(totalUsd)}) = ${items}`].join("\n");
}

export interface FormatCloseParams {
  wallet: Wallet;
  poolName: string;
  poolAddress: string;
  valuedChanges: ValuedChange[];
  signature: string;
  timestamp: number;
  close: CloseResult;
}

export function formatCloseMessage(p: FormatCloseParams): string {
  const received = p.valuedChanges.filter((c) => c.usd > 0);
  const items = received.map((c) => `${fmtAmount(c.amount)} ${c.symbol} (${fmtUsd(c.usd)})`).join(" + ");

  const parts = [`🔶 CLOSE : ${p.wallet.label} -> ${p.poolName}`, `💵 Remove : ${items} = ${fmtUsd(p.close.totalReceivedUsd)}`];

  if (p.close.pnlUsd !== null && p.close.pnlPct !== null) {
    const emoji = p.close.pnlUsd >= 0 ? "🟢" : "🔴";
    parts.push(`📊 PnL: ${emoji} ${fmtUsd(p.close.pnlUsd, true)} (${p.close.pnlPct >= 0 ? "+" : ""}${p.close.pnlPct.toFixed(2)}%)`);
  }

  return parts.join("\n");
}

export function formatMessage(type: DammEventType, params: FormatOpenParams | FormatCloseParams): string {
  if (type === "OPEN") return formatOpenMessage(params as FormatOpenParams);
  return formatCloseMessage(params as FormatCloseParams);
}
