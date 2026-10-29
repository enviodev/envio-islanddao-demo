import type { UserRef } from "./api";

export const PROGRAM_ID = "tabiZjsKYe5rs8fMM7FonZaw3pVBpiWMosB25eN6RrU";

export const num = (n: number) => n.toLocaleString("en-US");

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export const userName = (u: UserRef) => u.displayName ?? (u.xHandle ? `@${u.xHandle}` : shortAddress(u.id));

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
export const solscanAccount = (a: string) => `https://solscan.io/account/${a}`;

/** "UTC+7", "UTC-3", "UTC+5:30" */
export const tzLabel = (offsetMinutes: number) => {
  if (!offsetMinutes) return "UTC";
  const sign = offsetMinutes > 0 ? "+" : "−";
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
};

/** Formats in the event's own timezone by shifting the instant and reading it as UTC. */
const local = (t: number, offsetMinutes: number, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format((t + offsetMinutes * 60) * 1000);

export const dateRange = (start: number, end: number, offsetMinutes = 0) => {
  const fmt = { month: "short", day: "numeric" } as const;
  const year = local(end, offsetMinutes, { year: "numeric" });
  return `${local(start, offsetMinutes, fmt)} – ${local(end, offsetMinutes, fmt)}, ${year}`;
};

/** "Jun 8, 09:30 UTC+7": a moment in the event's local time. */
export const dateTime = (t: number, offsetMinutes = 0) =>
  `${local(t, offsetMinutes, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} ${tzLabel(offsetMinutes)}`;

export const shortDate = (t: number, offsetMinutes = 0) => local(t, offsetMinutes, { month: "short", day: "numeric", year: "numeric" });

/** "09:30" in the event's local time. */
export const clockTime = (t: number, offsetMinutes = 0) =>
  local(t, offsetMinutes, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const localDay = (t: number, offsetMinutes = 0) => utcDay(t + offsetMinutes * 60);

/**
 * The event's days as the program counts them (24h from the start time), each
 * labelled with its local date.
 */
export const eventDays = (e: { startTime: number; endTime: number; utcOffsetMinutes: number }) => {
  const count = Math.max(1, Math.ceil((e.endTime - e.startTime) / 86_400));
  return Array.from({ length: count }, (_, i) => localDay(e.startTime + i * 86_400, e.utcOffsetMinutes));
};

/** 1-based day of the event at `now`, clamped to the event. */
export const dayOfEvent = (e: { startTime: number; endTime: number; utcOffsetMinutes: number }, now: number) =>
  Math.min(eventDays(e).length, Math.max(1, Math.floor((now - e.startTime) / 86_400) + 1));

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

export const utcDay = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

export const usdc = (baseUnits: string | number | bigint) =>
  `$${(Number(baseUnits) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const isLive = (e: { startTime: number; endTime: number }, now: number) => now >= e.startTime && now <= e.endTime;

/** Base58, 32 to 44 characters: the shape of a Solana address. */
export const isWallet = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

/** "IslandDAO V4 - Thailand" -> "V4 · Thailand" */
export const editionName = (name: string) => name.replace("IslandDAO ", "").replace(" - ", " · ");

export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

/** 1 -> "1st", 12 -> "12th", 22 -> "22nd" */
export const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
};
