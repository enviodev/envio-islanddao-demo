import { indexer, type SvmInstruction, type SvmOnSlotContext } from "envio";
import {
  categoryLabel,
  decodeEventUpdate,
  getStats,
  statusLabel,
  utcOffsetFromTail,
  withArgs,
  withData,
} from "../shared.js";

indexer.onInstruction(
  { program: "IslandEvents", instruction: "createOrganization", fields: withArgs },
  async ({ instruction, context }) => {
    const { args, accounts } = instruction;
    context.Organization.set({
      id: accounts.organization.address,
      handle: args.handle,
      name: args.name,
      description: args.description,
      imageUrl: args.imageUrl,
      website: args.website,
      admin: accounts.admin.address,
      createdAt: instruction.block.time,
    });
    const stats = await getStats(context);
    context.GlobalStats.set({ ...stats, organizations: stats.organizations + 1 });
  },
);

type CreateEvent =
  | SvmInstruction<typeof withArgs, "IslandEvents", "createEvent">
  | SvmInstruction<typeof withArgs, "IslandEvents", "createEventShortTail">;

const createEvent = async ({
  instruction,
  context,
}: {
  instruction: CreateEvent;
  context: SvmOnSlotContext;
}) => {
  const { args, accounts } = instruction;
  const id = accounts.event.address;
  const existing = await context.Event.get(id);
  const hasCoordinates = args.latitude !== 0 || args.longitude !== 0;
  context.Event.set({
    // Counters survive in case the account is ever re-initialised.
    sessionCount: 0,
    registrationCount: 0,
    pendingCount: 0,
    confirmedCount: 0,
    rejectedCount: 0,
    cancelledCount: 0,
    checkInCount: 0,
    uniqueAttendeeCount: 0,
    lastCheckInAt: undefined,
    parent_id: undefined,
    requiresApproval: false,
    editCount: 0,
    updatedAt: undefined,
    ...existing,
    id,
    organization_id: accounts.organization.address,
    name: args.name,
    description: args.description,
    imageUrl: args.imageUrl,
    link: args.link,
    location: args.location,
    venue: args.venue,
    latitude: hasCoordinates ? args.latitude / 1e6 : undefined,
    longitude: hasCoordinates ? args.longitude / 1e6 : undefined,
    category: args.category,
    categoryLabel: categoryLabel(args.category),
    // New events start out scheduled (the account's status byte reads 2).
    status: 2,
    statusLabel: statusLabel(2),
    startTime: Number(args.startTime),
    endTime: Number(args.endTime),
    utcOffsetMinutes: utcOffsetFromTail(args.tail),
    creator: accounts.authority.address,
    createdAt: instruction.block.time,
    createdTx: instruction.transaction.signature,
  });
  if (!existing) {
    const stats = await getStats(context);
    context.GlobalStats.set({ ...stats, events: stats.events + 1 });
  }
};

indexer.onInstruction(
  { program: "IslandEvents", instruction: "createEvent", fields: withArgs },
  createEvent,
);
indexer.onInstruction(
  { program: "IslandEvents", instruction: "createEventShortTail", fields: withArgs },
  createEvent,
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "addSession", fields: withArgs },
  async ({ instruction, context }) => {
    const { session, parentEvent } = instruction.accounts;
    const [child, parent] = await Promise.all([
      context.Event.get(session.address),
      context.Event.get(parentEvent.address),
    ]);
    if (!child || !parent) {
      context.log.warn(`addSession for unknown event ${session.address} -> ${parentEvent.address}`);
      return;
    }
    if (child.parent_id === parent.id) return;
    // A few sessions were created without their own UTC offset; they happen where the main event does.
    const utcOffsetMinutes = child.utcOffsetMinutes || parent.utcOffsetMinutes;
    context.Event.set({ ...child, parent_id: parent.id, utcOffsetMinutes });
    context.Event.set({ ...parent, sessionCount: parent.sessionCount + 1 });
    const stats = await getStats(context);
    context.GlobalStats.set({ ...stats, sessions: stats.sessions + 1 });
  },
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "updateEvent", fields: withData },
  async ({ instruction, context }) => {
    const event = await context.Event.get(instruction.accounts.event.address);
    if (!event) {
      context.log.warn(`updateEvent for unknown event ${instruction.accounts.event.address}`);
      return;
    }
    const { update: u, complete } = decodeEventUpdate(instruction.data);
    if (!complete) {
      context.log.warn(`updateEvent with an unknown field set in ${instruction.transaction.signature}; applied the fields before it`);
    }
    const coordinates =
      u.latitude !== undefined && u.longitude !== undefined
        ? u.latitude === 0 && u.longitude === 0
          ? { latitude: undefined, longitude: undefined }
          : { latitude: u.latitude / 1e6, longitude: u.longitude / 1e6 }
        : {};
    context.Event.set({
      ...event,
      name: u.name ?? event.name,
      description: u.description ?? event.description,
      imageUrl: u.imageUrl ?? event.imageUrl,
      link: u.link ?? event.link,
      location: u.location ?? event.location,
      venue: u.venue ?? event.venue,
      ...(u.category !== undefined && { category: u.category, categoryLabel: categoryLabel(u.category) }),
      ...(u.status !== undefined && { status: u.status, statusLabel: statusLabel(u.status) }),
      startTime: u.startTime ?? event.startTime,
      endTime: u.endTime ?? event.endTime,
      utcOffsetMinutes: u.utcOffsetMinutes ?? event.utcOffsetMinutes,
      ...coordinates,
      editCount: event.editCount + 1,
      updatedAt: instruction.block.time,
    });
  },
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "setEventImage", fields: withArgs },
  async ({ instruction, context }) => {
    const event = await context.Event.get(instruction.accounts.event.address);
    if (!event) {
      context.log.warn(`setEventImage for unknown event ${instruction.accounts.event.address}`);
      return;
    }
    context.Event.set({
      ...event,
      imageUrl: instruction.args.imageUrl,
      editCount: event.editCount + 1,
      updatedAt: instruction.block.time,
    });
  },
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "setRequiresApproval", fields: withArgs },
  async ({ instruction, context }) => {
    const event = await context.Event.get(instruction.accounts.event.address);
    if (!event) {
      context.log.warn(`setRequiresApproval for unknown event ${instruction.accounts.event.address}`);
      return;
    }
    context.Event.set({ ...event, requiresApproval: instruction.args.requiresApproval });
  },
);
