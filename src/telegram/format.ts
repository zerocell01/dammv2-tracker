import { config } from "../config";
import { Wallet } from "../db";
import { ValuedChange } from "../positions/pnl";
import { CloseResult } from "../positions/pnl";
import { DammEventType } from "../helius/parser";

function link(text: string, url: string): string {
  return `[${text}](${url})`;
}

function fillTemplate(template: string, wallet: string, pool?: string): string {
  return template.replace("{wallet}", wallet).replace("{pool}", pool ?? "");
}

function fmtAmount(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function fmtUsd(n: number, withSign = false): string {
  const abs = Math.abs(n);
  const sign = withSign ? (n >= 0 ? "+" : "-") : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTimestamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
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
  const portoUrl = p.wallet.porto_url || fillTemplate(config.links.portoTemplate, p.wallet.address);
  const poolUrl = fillTemplate(config.links.poolTemplate, p.wallet.address, p.poolAddress);
  const gmgnUrl = fillTemplate(config.links.gmgnTemplate, p.wallet.address);

  const lines = p.valuedChanges.map((c) => `   ${fmtAmount(c.amount)} ${c.symbol} (~${fmtUsd(c.usd)})`);

  const parts = [
    `🟢 OPEN POSITION DAMM V2`,
    `👛 Wallet: ${p.wallet.label} - ${link("Porto", portoUrl)}`,
    `🏊 Pool: ${link(p.poolName, poolUrl)}`,
    `💵 Perubahan saldo:`,
    ...lines,
    `🕐 ${fmtTimestamp(p.timestamp)}`,
    `🔗 ${link("GMGN.ai", gmgnUrl)}`,
  ];
  return parts.join("\n");
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
  const portoUrl = p.wallet.porto_url || fillTemplate(config.links.portoTemplate, p.wallet.address);
  const poolUrl = fillTemplate(config.links.poolTemplate, p.wallet.address, p.poolAddress);
  const gmgnUrl = fillTemplate(config.links.gmgnTemplate, p.wallet.address);

  const lines = p.valuedChanges.map((c) => `   ${fmtAmount(c.amount)} ${c.symbol} (~${fmtUsd(c.usd)})`);

  const parts = [
    `🔴 CLOSE POSITION DAMM V2`,
    `👛 Wallet: ${p.wallet.label} - ${link("Porto", portoUrl)}`,
    `🏊 Pool: ${link(p.poolName, poolUrl)}`,
    `💵 Perubahan saldo:`,
    ...lines,
  ];

  if (p.valuedChanges.length > 1) {
    parts.push(`   💰 Total: ${fmtUsd(p.close.totalReceivedUsd, true)}`);
  }

  if (p.close.pnlUsd !== null && p.close.pnlPct !== null && p.close.depositUsd !== null) {
    const emoji = p.close.pnlUsd >= 0 ? "🟢" : "🔴";
    parts.push(`📊 PnL: ${emoji} ${fmtUsd(p.close.pnlUsd, true)} (${p.close.pnlPct >= 0 ? "+" : ""}${p.close.pnlPct.toFixed(2)}%)`);
    parts.push(`   deposit ${fmtUsd(p.close.depositUsd)} · fee ${fmtUsd(p.close.feeUsd)}`);
  }

  parts.push(`🕐 ${fmtTimestamp(p.timestamp)}`);
  parts.push(`🔗 ${link("GMGN.ai", gmgnUrl)}`);

  return parts.join("\n");
}

export function formatMessage(type: DammEventType, params: FormatOpenParams | FormatCloseParams): string {
  if (type === "OPEN") return formatOpenMessage(params as FormatOpenParams);
  return formatCloseMessage(params as FormatCloseParams);
}
