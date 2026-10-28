import { indexer } from "envio";
import { getStats, loadUser, withArgs } from "../shared.js";

indexer.onInstruction(
  { program: "IslandEvents", instruction: "createTicketTier", fields: withArgs },
  async ({ instruction, context }) => {
    const { args, accounts } = instruction;
    const existing = await context.TicketTier.get(accounts.tier.address);
    context.TicketTier.set({
      sold: 0,
      ...existing,
      id: accounts.tier.address,
      event_id: accounts.event.address,
      name: args.name,
      dates: args.dates,
      price: args.price,
      maxSupply: args.maxSupply ?? undefined,
    });
  },
);

indexer.onInstruction(
  { program: "IslandEvents", instruction: "purchasePass", fields: withArgs },
  async ({ instruction, context }) => {
    const { accounts } = instruction;
    const time = instruction.block.time;
    const tier = await context.TicketTier.get(accounts.tier.address);
    if (!tier) {
      context.log.warn(`purchasePass for unknown tier ${accounts.tier.address}`);
      return;
    }
    const buyer = await loadUser(context, accounts.buyer.address, time);
    context.User.set(buyer);
    context.PassPurchase.set({
      id: accounts.pass.address,
      tier_id: tier.id,
      event_id: tier.event_id,
      buyer_id: buyer.id,
      asset: accounts.asset.address,
      price: tier.price,
      timestamp: time,
      txSignature: instruction.transaction.signature,
    });
    context.TicketTier.set({ ...tier, sold: tier.sold + 1 });
    const stats = await getStats(context);
    context.GlobalStats.set({
      ...stats,
      passesSold: stats.passesSold + 1,
      passRevenue: stats.passRevenue + tier.price,
      lastActivityAt: time,
    });
  },
);
