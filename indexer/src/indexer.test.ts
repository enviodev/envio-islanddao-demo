import { describe, it } from "vitest";
import { createTestIndexer } from "envio";

const SOLANA = 7565164;
const START_SLOT = 410_949_000;

const ORG = "6sSUyecYwCPzAXktgPX98kExYvTwJiVbGEtUbJpLmHzk";
const EVENT = "961JNorcJaAA3xnxTxdcR4KHE6BnycP6sKXVdYU3aLby";
const ADMIN = "14rghAS2vY4w4BGvm89SRdhwqVGvTZRd6QDmDgsag4Es";
const ATTENDEE = "48kzfbkvtp5wow17JxhuN4yrcCVdstgPPiwvEEoFFQDM";
const REGISTRATION = "Ah847BJUMq8VRj5C97hiieYoQiyqZPG7iLFqDBVsxHWx";
const ATTENDANCE = "EDyh8CWEQBJYh7j5mQ7UdanGgdeMZC2ykZCwc99ztfbc";
const SCANNER = "6tHntNxtXDpKcjpwymnnKwCbuJnYGZBoHkeyDenP9pA7";
const SYSTEM = "11111111111111111111111111111111";
const FILLER = "tabiZjsKYe5rs8fMM7FonZaw3pVBpiWMosB25eN6RrU";
const SIG = "5UQVci72JcCxcTi3Chjq2TZyLsiRypMUvMgYBouue2EhMi6J16SHnpCVqPv2qrB1ou35kUXp9eEeB7xP746XFUwC";

const DAY = 86_400;
const T0 = 1_792_364_400; // 2026-10-19

// Simulated items only run inside the configured slot range, in slot order.
let nextSlot = START_SLOT;
const at = (time: number) => ({
  slot: nextSlot++,
  path: [0],
  block: { time },
  transaction: { signature: SIG, transactionIndex: 0 },
});
const addr = (address: string) => ({ address });

const createEvent = {
  program: "IslandEvents" as const,
  instruction: "createEvent" as const,
  ...at(T0 - 30 * DAY),
  args: {
    name: "IslandDAO V5",
    description: "",
    imageUrl: "",
    link: "",
    location: "Florianópolis, Brazil",
    venue: "",
    latitude: -27_594_870,
    longitude: -48_548_220,
    flags: 45,
    category: 0,
    visibility: 0,
    startTime: BigInt(T0),
    endTime: BigInt(T0 + 25 * DAY),
    tail: new Uint8Array(21),
  },
  accounts: {
    authority: addr(ADMIN),
    event: addr(EVENT),
    payer: addr(ADMIN),
    systemProgram: addr(SYSTEM),
    organization: addr(ORG),
  },
};

const register = (time: number) => ({
  program: "IslandEvents" as const,
  instruction: "register" as const,
  ...at(time),
  accounts: {
    attendee: addr(ATTENDEE),
    eventSettings: addr(FILLER),
    registration: addr(REGISTRATION),
    payer: addr(ATTENDEE),
    event: addr(EVENT),
    systemProgram: addr(SYSTEM),
    config: addr(FILLER),
  },
});

const approve = (time: number) => ({
  program: "IslandEvents" as const,
  instruction: "approveRegistration" as const,
  ...at(time),
  accounts: {
    authority: addr(ADMIN),
    event: addr(EVENT),
    organization: addr(ORG),
    registration: addr(REGISTRATION),
  },
});

const cancel = (time: number) => ({
  program: "IslandEvents" as const,
  instruction: "cancelRegistration" as const,
  ...at(time),
  accounts: {
    attendee: addr(ATTENDEE),
    registration: addr(REGISTRATION),
    event: addr(EVENT),
  },
});

const checkIn = (time: number) => ({
  program: "IslandEvents" as const,
  instruction: "checkIn" as const,
  ...at(time),
  accounts: {
    checkInAuthority: addr(SCANNER),
    attendee: addr(ATTENDEE),
    attendance: addr(ATTENDANCE),
    event: addr(EVENT),
    systemProgram: addr(SYSTEM),
    registration: addr(REGISTRATION),
  },
});

describe("registration lifecycle", () => {
  it("tracks status counters and daily check-ins", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [SOLANA]: {
          simulate: [
            createEvent,
            register(T0 - 3 * DAY),
            cancel(T0 - 2 * DAY),
            // Re-registering reopens the same PDA.
            register(T0 - 2 * DAY + 60),
            approve(T0 - DAY),
            checkIn(T0 + 9 * 3600),
            checkIn(T0 + DAY + 9 * 3600),
          ],
        },
      },
    });

    const event = await indexer.Event.getOrThrow(EVENT);
    t.expect(event).toMatchObject({
      name: "IslandDAO V5",
      categoryLabel: "Main event",
      latitude: -27.59487,
      registrationCount: 1,
      pendingCount: 0,
      approvedCount: 1,
      cancelledCount: 0,
      checkInCount: 2,
      uniqueAttendeeCount: 1,
    });

    t.expect(await indexer.Registration.getOrThrow(REGISTRATION)).toMatchObject({
      status: "Approved",
      reviewedBy: ADMIN,
      timesRegistered: 2,
      checkInCount: 2,
      firstCheckInAt: T0 + 9 * 3600,
    });

    const checkIns = (await indexer.CheckIn.getAll()).sort((a, b) => a.timestamp - b.timestamp);
    t.expect(checkIns.map((c) => [c.day, c.dayNumber, c.checkInAuthority])).toEqual([
      ["2026-10-19", 1, SCANNER],
      ["2026-10-20", 2, SCANNER],
    ]);

    const days = (await indexer.EventDay.getAll()).sort((a, b) => a.day.localeCompare(b.day));
    t.expect(days.map((d) => [d.day, d.checkIns, d.firstTimers])).toEqual([
      ["2026-10-19", 1, 1],
      ["2026-10-20", 1, 0],
    ]);

    t.expect(await indexer.GlobalStats.getOrThrow("solana")).toMatchObject({
      events: 1,
      users: 1,
      registrations: 1,
      checkIns: 2,
    });
  });
});

// Replays the program's real history from HyperSync up to a pinned slot, so
// the decoded layouts are checked against on-chain data. Needs ENVIO_API_TOKEN.
describe("on-chain history", () => {
  it("decodes IslandDAO V4 and V5 as of slot 462,250,000", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: { [SOLANA]: { startBlock: START_SLOT, endBlock: 462_250_000 } },
    });

    t.expect(await indexer.GlobalStats.getOrThrow("solana")).toMatchObject({
      organizations: 1,
      events: 55,
      sessions: 50,
      profiles: 48,
      registrations: 461,
      checkIns: 908,
      passesSold: 12,
      passRevenue: 1_945_000_000n,
    });

    t.expect(await indexer.Event.getOrThrow("DVad9LWCVJBZxAoW1MJnrQz6azG5Gu2oWjruLyQMQ7Lz")).toMatchObject({
      name: "IslandDAO V4 - Thailand",
      location: "Koh Samui, Thailand",
      sessionCount: 50,
      registrationCount: 215,
      checkInCount: 548,
      uniqueAttendeeCount: 100,
    });

    t.expect(await indexer.Event.getOrThrow(EVENT)).toMatchObject({
      name: "IslandDAO V5",
      registrationCount: 245,
      approvedCount: 237,
      rejectedCount: 5,
      cancelledCount: 2,
      checkInCount: 360,
      uniqueAttendeeCount: 98,
    });

    t.expect(await indexer.Registration.getOrThrow(REGISTRATION)).toMatchObject({
      user_id: ATTENDEE,
      status: "Approved",
      checkInCount: 1,
    });
  }, 600_000);
});
