import { indexer, type Event, type Registration, type SvmOnSlotContext } from "envio";
import { baseFields, eventDayDate, eventDayIndex, getStats, instructionId, loadUser } from "../shared.js";

type RegistrationStatus = Registration["status"];

const statusCounter = {
  Pending: "pendingCount",
  Confirmed: "confirmedCount",
  Rejected: "rejectedCount",
  Cancelled: "cancelledCount",
} as const satisfies Record<RegistrationStatus, keyof Event>;

/** Moves one registration between the event's per-status counters. */
const recount = (event: Event, from: RegistrationStatus | undefined, to: RegistrationStatus): Event => {
  const next = { ...event };
  if (from) next[statusCounter[from]] -= 1;
  next[statusCounter[to]] += 1;
  return next;
};

indexer.onInstruction(
  { program: "IslandEvents", instruction: "register", fields: baseFields },
  async ({ instruction, context }) => {
    const { attendee, registration, event: eventAccount } = instruction.accounts;
    const time = instruction.block.time;
    const event = await context.Event.get(eventAccount.address);
    if (!event) {
      context.log.warn(`register for unknown event ${eventAccount.address}`);
      return;
    }
    const user = await loadUser(context, attendee.address, time);
    const existing = await context.Registration.get(registration.address);
    // Without an approval step the program confirms the registration on the spot.
    const status: RegistrationStatus = event.requiresApproval ? "Pending" : "Confirmed";

    context.Registration.set({
      checkInCount: 0,
      firstCheckInAt: undefined,
      lastCheckInAt: undefined,
      arrivedAt: undefined,
      ...existing,
      id: registration.address,
      event_id: event.id,
      user_id: user.id,
      status,
      registeredAt: time,
      registeredTx: instruction.transaction.signature,
      registrationNumber: existing?.registrationNumber ?? event.registrationCount + 1,
      reviewedAt: undefined,
      reviewedBy: undefined,
      cancelledAt: undefined,
      timesRegistered: (existing?.timesRegistered ?? 0) + 1,
    });

    const counted = recount(event, existing?.status, status);
    if (existing) {
      context.Event.set(counted);
      return;
    }
    context.Event.set({ ...counted, registrationCount: event.registrationCount + 1 });
    context.User.set({ ...user, registrationCount: user.registrationCount + 1 });
    const stats = await getStats(context);
    context.GlobalStats.set({ ...stats, registrations: stats.registrations + 1, lastActivityAt: time });
  },
);

/** Shared by approve, reject and cancel: a status change on an existing registration. */
const review = (to: RegistrationStatus) =>
  async ({
    registrationAddress,
    signer,
    time,
    context,
  }: {
    registrationAddress: string;
    signer: string;
    time: number;
    context: SvmOnSlotContext;
  }) => {
    const registration = await context.Registration.get(registrationAddress);
    if (!registration) {
      context.log.warn(`${to} for unknown registration ${registrationAddress}`);
      return;
    }
    if (registration.status === to) return;
    const event = await context.Event.getOrThrow(registration.event_id);
    context.Event.set(recount(event, registration.status, to));
    context.Registration.set({
      ...registration,
      status: to,
      ...(to === "Cancelled"
        ? { cancelledAt: time }
        : { reviewedAt: time, reviewedBy: signer }),
    });
  };

const approve = review("Confirmed");
const reject = review("Rejected");
const cancel = review("Cancelled");

indexer.onInstruction(
  { program: "IslandEvents", instruction: "approveRegistration", fields: baseFields },
  async ({ instruction, context }) =>
    approve({
      registrationAddress: instruction.accounts.registration.address,
      signer: instruction.accounts.authority.address,
      time: instruction.block.time,
      context,
    }),
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "rejectRegistration", fields: baseFields },
  async ({ instruction, context }) =>
    reject({
      registrationAddress: instruction.accounts.registration.address,
      signer: instruction.accounts.authority.address,
      time: instruction.block.time,
      context,
    }),
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "cancelRegistration", fields: baseFields },
  async ({ instruction, context }) =>
    cancel({
      registrationAddress: instruction.accounts.registration.address,
      signer: instruction.accounts.attendee.address,
      time: instruction.block.time,
      context,
    }),
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "checkIn", fields: baseFields },
  async ({ instruction, context }) => {
    const { attendee, attendance, checkInAuthority, registration: registrationAccount, event: eventAccount } =
      instruction.accounts;
    const time = instruction.block.time;
    const event = await context.Event.get(eventAccount.address);
    const registration = await context.Registration.get(registrationAccount.address);
    if (!event || !registration) {
      context.log.warn(`checkIn without a known event/registration in ${instruction.transaction.signature}`);
      return;
    }
    const user = await loadUser(context, attendee.address, time);
    // Bucket by the event's own days, as the attendance account does, not by UTC date.
    const dayIndex = eventDayIndex(time, event.startTime);
    const day = eventDayDate(dayIndex, event.startTime, event.utcOffsetMinutes);
    const isFirst = registration.checkInCount === 0;
    const dayNumber = registration.checkInCount + 1;

    context.CheckIn.set({
      id: instructionId(instruction),
      event_id: event.id,
      user_id: user.id,
      registration_id: registration.id,
      attendance: attendance.address,
      checkInAuthority: checkInAuthority.address,
      timestamp: time,
      eventDay: dayIndex + 1,
      day,
      dayNumber,
      slot: instruction.block.slot,
      txSignature: instruction.transaction.signature,
    });
    context.Registration.set({
      ...registration,
      checkInCount: dayNumber,
      firstCheckInAt: registration.firstCheckInAt ?? time,
      lastCheckInAt: time,
    });
    context.Event.set({
      ...event,
      checkInCount: event.checkInCount + 1,
      uniqueAttendeeCount: event.uniqueAttendeeCount + (isFirst ? 1 : 0),
      lastCheckInAt: time,
    });
    const eventDay = await context.EventDay.getOrCreate({
      id: `${event.id}-${day}`,
      event_id: event.id,
      eventDay: dayIndex + 1,
      day,
      checkIns: 0,
      firstTimers: 0,
      firstIn_id: user.id,
    });
    context.EventDay.set({
      ...eventDay,
      checkIns: eventDay.checkIns + 1,
      firstTimers: eventDay.firstTimers + (isFirst ? 1 : 0),
    });
    context.User.set({ ...user, checkInCount: user.checkInCount + 1 });
    const stats = await getStats(context);
    context.GlobalStats.set({ ...stats, checkIns: stats.checkIns + 1, lastActivityAt: time });
  },
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "eventCheckIn", fields: baseFields },
  async ({ instruction, context }) => {
    const registration = await context.Registration.get(instruction.accounts.registration.address);
    if (!registration) {
      context.log.warn(`eventCheckIn for unknown registration ${instruction.accounts.registration.address}`);
      return;
    }
    if (registration.arrivedAt !== undefined) return;
    context.Registration.set({ ...registration, arrivedAt: instruction.block.time });
  },
);
