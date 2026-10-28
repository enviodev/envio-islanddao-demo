import { indexer, type SvmInstruction, type SvmOnSlotContext } from "envio";
import { categoryLabel, getStats, withArgs } from "../shared.js";

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
    approvedCount: 0,
    rejectedCount: 0,
    cancelledCount: 0,
    checkInCount: 0,
    uniqueAttendeeCount: 0,
    lastCheckInAt: undefined,
    parent_id: undefined,
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
    startTime: Number(args.startTime),
    endTime: Number(args.endTime),
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
    context.Event.set({ ...child, parent_id: parent.id });
    context.Event.set({ ...parent, sessionCount: parent.sessionCount + 1 });
    const stats = await getStats(context);
    context.GlobalStats.set({ ...stats, sessions: stats.sessions + 1 });
  },
);
