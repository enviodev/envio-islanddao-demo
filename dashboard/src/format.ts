import type { UserRef } from "./api";

export const PROGRAM_ID = "tabiZjsKYe5rs8fMM7FonZaw3pVBpiWMosB25eN6RrU";

export const num = (n: number) => n.toLocaleString("en-US");

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export const userName = (u: UserRef) => u.displayName ?? (u.xHandle ? `@${u.xHandle}` : shortAddress(u.id));

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
export const solscanAccount = (a: string) => `https://solscan.io/account/${a}`;

export const dateRange = (start: number, end: number) => {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const year = new Date(end * 1000).getUTCFullYear();
  return `${fmt.format(start * 1000)} – ${fmt.format(end * 1000)}, ${year}`;
};

export const dateTime = (t: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(t * 1000);

export const ago = (t: number, now = Date.now() / 1000) => {
  const s = Math.max(0, Math.round(now - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
};

/** "2026-10-21" -> "Oct 21" */
export const shortDay = (day: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export const weekday = (day: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** Every calendar day from `first` to `last`, inclusive, as YYYY-MM-DD. */
export const daysBetween = (first: string, last: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
};

export const usdc = (baseUnits: string | number | bigint) =>
  `$${(Number(baseUnits) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
