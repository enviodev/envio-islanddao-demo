import type { GlobalStats, SvmOnSlotContext, User } from "envio";

/** The one row of program-wide totals. */
export const STATS_ID = "solana";

/** Only the listed fields are fetched, so every handler shares this minimal set. */
export const baseFields = {
  instruction: ["accounts", "path"],
  transaction: ["signature", "transactionIndex"],
  block: ["time"],
} as const;

export const withArgs = {
  ...baseFields,
  instruction: [...baseFields.instruction, "args"],
} as const;

type Located = {
  readonly path: readonly number[];
  readonly block: { readonly slot: number };
  readonly transaction: { readonly transactionIndex: number };
};

/** Unique per instruction: slot, transaction position, then the call path. */
export const instructionId = (i: Located) =>
  `${i.block.slot}-${i.transaction.transactionIndex}-${i.path.join(".")}`;

/** The `category` byte, labelled from how IslandDAO used it on its V4 calendar. */
export const categoryLabel = (category: number) =>
  ({
    0: "Main event",
    1: "Talk & demo",
    3: "Social",
    4: "Sport & wellness",
    5: "Demo day",
    8: "1:1 session",
  })[category] ?? `Category ${category}`;

export const utcDay = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 10);

/** Fixed-size, zero-padded UTF-8 field to a string. */
export const fixedString = (bytes: Uint8Array) => {
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
};

export const getStats = async (context: SvmOnSlotContext): Promise<GlobalStats> =>
  context.GlobalStats.getOrCreate({
    id: STATS_ID,
    organizations: 0,
    events: 0,
    sessions: 0,
    users: 0,
    profiles: 0,
    registrations: 0,
    checkIns: 0,
    passesSold: 0,
    passRevenue: 0n,
    lastActivityAt: 0,
  });

/** Loads a wallet's user row, creating it (and counting it) on first sight. */
export const loadUser = async (
  context: SvmOnSlotContext,
  address: string,
  time: number,
): Promise<User> => {
  const existing = await context.User.get(address);
  if (existing) return existing;
  const stats = await getStats(context);
  context.GlobalStats.set({ ...stats, users: stats.users + 1 });
  return {
    id: address,
    displayName: undefined,
    bio: undefined,
    avatarUrl: undefined,
    website: undefined,
    xHandle: undefined,
    profile: undefined,
    firstSeenAt: time,
    registrationCount: 0,
    checkInCount: 0,
  };
};
