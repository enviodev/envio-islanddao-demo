import { describe, it } from "vitest";
import { createTestIndexer } from "envio";

const SOLANA = 7565164;
const START_SLOT = 410_949_000;

const ORG = "6sSUyecYwCPzAXktgPX98kExYvTwJiVbGEtUbJpLmHzk";
const EVENT = "961JNorcJaAA3xnxTxdcR4KHE6BnycP6sKXVdYU3aLby";
const V4 = "DVad9LWCVJBZxAoW1MJnrQz6azG5Gu2oWjruLyQMQ7Lz";
const ADMIN = "14rghAS2vY4w4BGvm89SRdhwqVGvTZRd6QDmDgsag4Es";
const ATTENDEE = "48kzfbkvtp5wow17JxhuN4yrcCVdstgPPiwvEEoFFQDM";
const REGISTRATION = "Ah847BJUMq8VRj5C97hiieYoQiyqZPG7iLFqDBVsxHWx";
const ATTENDANCE = "EDyh8CWEQBJYh7j5mQ7UdanGgdeMZC2ykZCwc99ztfbc";
const SCANNER = "6tHntNxtXDpKcjpwymnnKwCbuJnYGZBoHkeyDenP9pA7";
const SYSTEM = "11111111111111111111111111111111";
const FILLER = "tabiZjsKYe5rs8fMM7FonZaw3pVBpiWMosB25eN6RrU";
const SIG = "5UQVci72JcCxcTi3Chjq2TZyLsiRypMUvMgYBouue2EhMi6J16SHnpCVqPv2qrB1ou35kUXp9eEeB7xP746XFUwC";

const DAY = 86_400;
const HOUR = 3_600;
// V5 was created to start at 2026-10-18 23:00 UTC, then edited to start at
// local midnight in Florianópolis (UTC-3), 2026-10-19 03:00 UTC.
const T0 = 1_792_364_400;
const START = T0 + 4 * HOUR;

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
    // UTC-3 is -12 quarter-hours.
    tail: Uint8Array.from({ length: 21 }, (_, i) => (i === 0 ? 0xf4 : 0)),
  },
  accounts: {
    authority: addr(ADMIN),
    event: addr(EVENT),
    payer: addr(ADMIN),
    systemProgram: addr(SYSTEM),
    organization: addr(ORG),
  },
};

const setRequiresApproval = {
  program: "IslandEvents" as const,
  instruction: "setRequiresApproval" as const,
  ...at(T0 - 30 * DAY + 1),
  args: { requiresApproval: true },
  accounts: {
    authority: addr(ADMIN),
    event: addr(EVENT),
    eventSettings: addr(FILLER),
    organization: addr(ORG),
  },
};

/** updateEvent data: 8 empty options, the new start time, then 10 more empty options. */
const updateStart = (time: number, startTime: number) => {
  const data = new Uint8Array(1 + 8 + 9 + 10);
  data[0] = 0x01;
  data[9] = 1;
  new DataView(data.buffer).setBigInt64(10, BigInt(startTime), true);
  return {
    program: "IslandEvents" as const,
    instruction: "updateEvent" as const,
    ...at(time),
    data,
    accounts: { authority: addr(ADMIN), event: addr(EVENT), organization: addr(ORG) },
  };
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

const eventCheckIn = (time: number) => ({
  program: "IslandEvents" as const,
  instruction: "eventCheckIn" as const,
  ...at(time),
  accounts: {
    checkInAuthority: addr(SCANNER),
    attendee: addr(ATTENDEE),
    registration: addr(REGISTRATION),
    event: addr(EVENT),
    systemProgram: addr(SYSTEM),
    attendance: addr(ATTENDANCE),
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
            setRequiresApproval,
            updateStart(T0 - 10 * DAY, START),
            register(T0 - 3 * DAY),
            cancel(T0 - 2 * DAY),
            // Re-registering reopens the same PDA.
            register(T0 - 2 * DAY + 60),
            approve(T0 - DAY),
            // 17:00 local the evening before: the program counts it as the first day.
            checkIn(START - 7 * HOUR),
            eventCheckIn(START - 7 * HOUR + 60),
            checkIn(START + DAY + 9 * HOUR),
            // 22:00 local, already the next day in UTC.
            checkIn(START + 2 * DAY + 22 * HOUR),
          ],
        },
      },
    });

    const event = await indexer.Event.getOrThrow(EVENT);
    t.expect(event).toMatchObject({
      name: "IslandDAO V5",
      categoryLabel: "Main event",
      latitude: -27.59487,
      startTime: START,
      utcOffsetMinutes: -180,
      requiresApproval: true,
      statusLabel: "Scheduled",
      editCount: 1,
      registrationCount: 1,
      pendingCount: 0,
      confirmedCount: 1,
      cancelledCount: 0,
      checkInCount: 3,
      uniqueAttendeeCount: 1,
    });

    t.expect(await indexer.Registration.getOrThrow(REGISTRATION)).toMatchObject({
      status: "Confirmed",
      reviewedBy: ADMIN,
      timesRegistered: 2,
      registrationNumber: 1,
      checkInCount: 3,
      firstCheckInAt: START - 7 * HOUR,
      arrivedAt: START - 7 * HOUR + 60,
    });

    const checkIns = (await indexer.CheckIn.getAll()).sort((a, b) => a.timestamp - b.timestamp);
    t.expect(checkIns.map((c) => [c.day, c.eventDay, c.dayNumber, c.checkInAuthority])).toEqual([
      ["2026-10-19", 1, 1, SCANNER],
      ["2026-10-20", 2, 2, SCANNER],
      ["2026-10-21", 3, 3, SCANNER],
    ]);

    const days = (await indexer.EventDay.getAll()).sort((a, b) => a.day.localeCompare(b.day));
    t.expect(days.map((d) => [d.day, d.eventDay, d.checkIns, d.firstTimers])).toEqual([
      ["2026-10-19", 1, 1, 1],
      ["2026-10-20", 2, 1, 0],
      ["2026-10-21", 3, 1, 0],
    ]);
    t.expect(days.every((d) => d.firstIn_id === ATTENDEE)).toBe(true);

    t.expect(await indexer.GlobalStats.getOrThrow("solana")).toMatchObject({
      events: 1,
      users: 1,
      registrations: 1,
      checkIns: 3,
    });
  });

  it("confirms registrations straight away when the event has no approval step", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: { [SOLANA]: { simulate: [createEvent, register(T0 - 3 * DAY)] } },
    });
    t.expect(await indexer.Event.getOrThrow(EVENT)).toMatchObject({ pendingCount: 0, confirmedCount: 1 });
    t.expect(await indexer.Registration.getOrThrow(REGISTRATION)).toMatchObject({ status: "Confirmed" });
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

    // Renamed on-chain from "IslandDAO V4 - Thailand" on its first day.
    t.expect(await indexer.Event.getOrThrow(V4)).toMatchObject({
      name: "IslandDAO V4",
      location: "Koh Samui, Thailand",
      utcOffsetMinutes: 420,
      requiresApproval: false,
      // Edited on-chain from 13:00 to 11:00 UTC.
      endTime: 1_782_644_400,
      sessionCount: 50,
      registrationCount: 215,
      // No approval step: every registration is confirmed on sign-up.
      pendingCount: 0,
      confirmedCount: 215,
      checkInCount: 548,
      uniqueAttendeeCount: 100,
    });

    // The one-off event check-in (0x05) marks the registration, not the attendance account.
    t.expect(await indexer.Registration.getOrThrow("FvJAiogvVi2CMAwzM15aNhmQWCXLjcA2PDRLQ2kZg6zs")).toMatchObject({
      arrivedAt: 1_780_543_687,
      checkInCount: 0,
    });

    t.expect(await indexer.Event.getOrThrow(EVENT)).toMatchObject({
      name: "IslandDAO V5",
      // Moved on-chain to local midnight in Florianópolis.
      startTime: START,
      utcOffsetMinutes: -180,
      requiresApproval: true,
      registrationCount: 245,
      confirmedCount: 237,
      rejectedCount: 5,
      cancelledCount: 2,
      checkInCount: 360,
      uniqueAttendeeCount: 98,
    });

    t.expect(await indexer.Registration.getOrThrow(REGISTRATION)).toMatchObject({
      user_id: ATTENDEE,
      status: "Confirmed",
      checkInCount: 1,
    });

    // Nine islanders checked in on Sunday Oct 18, before the start. The program
    // counts that as the first day, so there is no Oct 18 bucket.
    t.expect(await indexer.EventDay.get(`${EVENT}-2026-10-18`)).toBeUndefined();
    t.expect(await indexer.EventDay.getOrThrow(`${EVENT}-2026-10-19`)).toMatchObject({ eventDay: 1, checkIns: 34 });
  }, 600_000);
});
