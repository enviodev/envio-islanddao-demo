import { indexer } from "envio";
import { fixedString, getStats, loadUser, withArgs } from "../shared.js";

const orUndefined = (value: string) => (value === "" ? undefined : value);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "createProfile", fields: withArgs },
  async ({ instruction, context }) => {
    const { args, accounts } = instruction;
    const user = await loadUser(context, accounts.owner.address, instruction.block.time);
    context.User.set({
      ...user,
      profile: accounts.profile.address,
      displayName: orUndefined(args.displayName),
      bio: orUndefined(args.bio),
      avatarUrl: orUndefined(args.avatarUrl),
      website: orUndefined(args.website),
    });
    if (!user.profile) {
      const stats = await getStats(context);
      context.GlobalStats.set({ ...stats, profiles: stats.profiles + 1 });
    }
  },
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "updateProfile", fields: withArgs },
  async ({ instruction, context }) => {
    const { args, accounts } = instruction;
    const user = await loadUser(context, accounts.owner.address, instruction.block.time);
    // Only the fields the call carries change.
    const pick = (next: string | null, current: string | undefined) =>
      next === null ? current : orUndefined(next);
    context.User.set({
      ...user,
      profile: accounts.profile.address,
      displayName: pick(args.displayName, user.displayName),
      bio: pick(args.bio, user.bio),
      avatarUrl: pick(args.avatarUrl, user.avatarUrl),
      website: pick(args.website, user.website),
    });
  },
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "linkSocial", fields: withArgs },
  async ({ instruction, context }) => {
    const { args, accounts } = instruction;
    if (args.platform !== 0) return;
    const user = await loadUser(context, accounts.owner.address, instruction.block.time);
    context.User.set({ ...user, xHandle: fixedString(args.handle) });
  },
);
