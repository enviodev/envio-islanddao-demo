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

export const withData = {
  ...baseFields,
  instruction: [...baseFields.instruction, "data"],
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

/** The program's status byte, labelled from when IslandDAO set each value. */
export const statusLabel = (status: number) =>
  ({ 2: "Scheduled", 3: "Completed", 4: "Cancelled" })[status] ?? `Status ${status}`;

export const utcDay = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 10);

const DAY = 86_400;

/**
 * Which day of the event a check-in lands on, the way the program fills its
 * attendance bitmap: whole days since the event's start, with anything before
 * the start counted as the first day. 0-based.
 */
export const eventDayIndex = (time: number, startTime: number) =>
  Math.max(0, Math.floor((time - startTime) / DAY));

/** The local calendar date (YYYY-MM-DD) of an event day. */
export const eventDayDate = (index: number, startTime: number, utcOffsetMinutes: number) =>
  utcDay(startTime + index * DAY + utcOffsetMinutes * 60);

/** The tail's first byte: the event's UTC offset in quarter-hours, as an i8. */
export const utcOffsetFromTail = (tail: ArrayLike<number>) => {
  const raw = tail[0] ?? 0;
  return (raw > 127 ? raw - 256 : raw) * 15;
};

/** Reads Borsh values off an instruction's data, front to back. */
class BorshReader {
  private offset = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array, offset = 0) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = offset;
  }
  u8() {
    return this.view.getUint8(this.offset++);
  }
  i8() {
    return this.view.getInt8(this.offset++);
  }
  i32() {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }
  i64() {
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return Number(v);
  }
  string() {
    const length = this.view.getUint32(this.offset, true);
    this.offset += 4;
    const v = new TextDecoder().decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return v;
  }
  /** Borsh Option: a 0/1 tag, then the value when it's 1. */
  option<T>(read: () => T): T | undefined {
    return this.u8() === 1 ? read() : undefined;
  }
}

export type EventUpdate = {
  name?: string;
  description?: string;
  imageUrl?: string;
  link?: string;
  location?: string;
  venue?: string;
  category?: number;
  startTime?: number;
  endTime?: number;
  utcOffsetMinutes?: number;
  status?: number;
  latitude?: number;
  longitude?: number;
};

/**
 * Decodes `updateEvent` (0x01): a run of Borsh Options, one per editable
 * field. The order was matched against all 60 calls on chain:
 *   1-6 name, description, image, link, location, venue (string)
 *   7 category (u8)   8 ? (never set)   9-10 start, end (i64)
 *   11 UTC offset in quarter-hours (i8)   12 ? (u8)   13 status (u8)
 *   14 ? (never set)   15 ? (u8)   16-17 latitude, longitude (i32, x1e6)
 * The fields after 17 aren't read. A value in a never-set field has an unknown
 * size, so decoding stops there and keeps what it has.
 */
export const decodeEventUpdate = (data: Uint8Array): { update: EventUpdate; complete: boolean } => {
  const r = new BorshReader(data, 1);
  const update: EventUpdate = {};
  const unknown = () => r.u8() === 1;
  const skipU8 = () => void r.option(() => r.u8());
  try {
    update.name = r.option(() => r.string());
    update.description = r.option(() => r.string());
    update.imageUrl = r.option(() => r.string());
    update.link = r.option(() => r.string());
    update.location = r.option(() => r.string());
    update.venue = r.option(() => r.string());
    update.category = r.option(() => r.u8());
    if (unknown()) return { update, complete: false };
    update.startTime = r.option(() => r.i64());
    update.endTime = r.option(() => r.i64());
    const quarters = r.option(() => r.i8());
    if (quarters !== undefined) update.utcOffsetMinutes = quarters * 15;
    skipU8();
    update.status = r.option(() => r.u8());
    if (unknown()) return { update, complete: false };
    skipU8();
    const lat = r.option(() => r.i32());
    const lng = r.option(() => r.i32());
    if (lat !== undefined) update.latitude = lat;
    if (lng !== undefined) update.longitude = lng;
    return { update, complete: true };
  } catch {
    // Short data (an older, shorter field list): everything read so far holds.
    return { update, complete: true };
  }
};

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
    passCount: 0,
    passSpend: 0n,
  };
};
