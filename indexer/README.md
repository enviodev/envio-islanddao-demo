# IslandDAO indexer

_See the [Envio docs](https://docs.envio.dev) for every HyperIndex feature._

This indexer reads registrations, approvals, daily check-ins, profiles and pass
sales from the IslandDAO event program on Solana
(`tabiZjsKYe5rs8fMM7FonZaw3pVBpiWMosB25eN6RrU`). The repository
[README](../README.md) covers how the program was reverse-engineered.

## Run

```bash
pnpm install
echo 'ENVIO_API_TOKEN=<your-token>' > .env   # https://envio.dev/app/api-tokens
pnpm dev
```

GraphQL Playground: [http://localhost:8080](http://localhost:8080) (local password `testing`).

```graphql
{
  Event(where: { category: { _eq: 0 } }) {
    name
    registrationCount
    approvedCount
    uniqueAttendeeCount
    checkInCount
    days(order_by: { day: asc }) { day checkIns firstTimers }
  }
  CheckIn(order_by: { timestamp: desc }, limit: 5) {
    day
    dayNumber
    user { id displayName xHandle }
    event { name }
  }
}
```

After changing `config.yaml` or `schema.graphql`, run `pnpm codegen`.

## Test

```bash
pnpm test
```

- **registration lifecycle** runs the handlers over simulated instructions, so
  it needs no network.
- **on-chain history** replays the program from HyperSync up to slot
  462,250,000 and checks the totals. It needs `ENVIO_API_TOKEN`.

## Layout

| File | Handles |
|---|---|
| `config.yaml` | The instruction catalog: discriminators, account slots, Borsh args |
| `schema.graphql` | `Organization`, `Event`, `Registration`, `CheckIn`, `EventDay`, `User`, `TicketTier`, `PassPurchase`, `GlobalStats` |
| `src/handlers/events.ts` | Organizations, events and sessions |
| `src/handlers/registrations.ts` | Register, approve, reject, cancel, check-in |
| `src/handlers/profiles.ts` | Profiles and attested X handles |
| `src/handlers/tickets.ts` | V4 weekly pass tiers and purchases |
| `src/shared.ts` | Field selection, ids, labels, the global stats row |

Envio 3.14.0 crashes when a handler selects `fields.log` and HyperSync returns
an instruction with no logs. This program emits no logs we need, so the
handlers don't select them.
