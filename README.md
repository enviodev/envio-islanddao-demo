# IslandDAO on-chain check-ins: Envio HyperIndex demo

An [Envio HyperIndex](https://docs.envio.dev) indexer for the Solana program
behind [IslandDAO](https://islanddao.org) event check-ins, plus a live dashboard
built on its GraphQL API.

- `indexer/`: HyperIndex project (`ecosystem: svm`), scaffolded with `pnpx envio init svm`
- `dashboard/`: Vite + React dashboard, branded IslandDAO × Envio, polling the indexer every 5 seconds. It has three views:
  - **Overview** (`/`, or `/v4` for an earlier edition): the showcase for everyone. Live islander count, the island calendar, the latest check-ins, regulars, and a wall of every attendee
  - **Organizers** (`/organizers`, `/v4/organizers`): KPIs, daily check-ins split into first-timers and returning, the registration funnel, the days-attended distribution, sessions and pass sales
  - **My island** (`/me/<wallet>`): an attendee's island passport, with a stamp per day checked in, their leaderboard rank, islander number, longest streak and usual check-in time

## The program

IslandDAO runs registrations, approvals and daily check-ins for its month-long
builder events on Solana, through program
[`tabiZjsKYe5rs8fMM7FonZaw3pVBpiWMosB25eN6RrU`](https://solscan.io/account/tabiZjsKYe5rs8fMM7FonZaw3pVBpiWMosB25eN6RrU).
It has no published IDL and dispatches on a single leading byte, not Anchor's
8-byte discriminators. I pulled its full history from HyperSync with a
catch-all `"0x"` instruction and worked out each instruction's discriminator,
account order and Borsh layout by hand.

On-chain traffic at slot 462,250,000: 1,967 instructions across 36 discriminators.

| Byte | Instruction | Calls | What it does |
|---|---|---|---|
| `0x00` | `createEvent` | 55 | Event or session: name, description, image, location, venue, lat/lng (×1e6), category, start/end |
| `0x02` | `addSession` | 50 | Attaches a session (talk, demo, social) to a main event |
| `0x04` | `register` | 472 | Attendee opens a registration PDA for an event |
| `0x41` | `approveRegistration` | 241 | Organizer approves (V5 uses approvals, V4 did not) |
| `0x42` | `rejectRegistration` | 5 | Organizer rejects |
| `0x07` | `cancelRegistration` | 13 | Attendee withdraws. The PDA closes and comes back on re-register |
| `0x10` | `checkIn` | 908 | Co-signed by the venue's check-in key and the attendee. One per attendee per day |
| `0x1c` / `0x1d` | `createProfile` / `updateProfile` | 48 / 5 | Display name, bio, avatar, website |
| `0x36` | `linkSocial` | 15 | X handle, co-signed by a verifier |
| `0x20` | `createOrganization` | 1 | The IslandDAO org account |
| `0x27` / `0x2a` | `createTicketTier` / `purchasePass` | 4 / 12 | V4 weekly passes, Metaplex Core assets paid in USDC |

The other low-volume instructions (event edits, image updates, roles and admin
setup) aren't indexed. Two fields are inferred rather than documented: the
`category` labels (from how the V4 calendar used them) and a 20–21-byte tail on
`createEvent` that stays opaque.

### What the data shows

| | IslandDAO V4, Koh Samui | IslandDAO V5, Florianópolis (live) |
|---|---|---|
| Dates | Jun 3 – 28, 2026 | Oct 19 – Nov 12, 2026 |
| Registrations | 215 | 245 (237 approved, 5 rejected) |
| Unique attendees | 100 | 98 so far |
| Check-ins | 548 over 17 days | 360 over 8 days, still growing |
| Extras | 50 sessions, 12 weekly passes ($1,945 USDC) | approval flow |

Check-ins only happen on weekdays, which matches co-working days. The attendance
account the program keeps per (event, attendee) holds a day counter and a day
bitmap, and the indexer's own `dayNumber` matches it.

## Running it

You need Node 22+, pnpm, Docker, and an Envio API token
([envio.dev/app/api-tokens](https://envio.dev/app/api-tokens)) for HyperSync.

```bash
# 1. Indexer: Postgres + Hasura in Docker, GraphQL on http://localhost:8080
cd indexer
pnpm install
echo 'ENVIO_API_TOKEN=<your-token>' > .env
pnpm dev

# 2. Dashboard, in a second terminal: http://localhost:5173
cd dashboard
pnpm install
pnpm dev
```

A full backfill from the program's first slot takes a few minutes. After that
the indexer follows the chain head, and the V5 tab updates as check-ins land.
The dashboard proxies `/v1/graphql` to `localhost:8080`. Set
`GRAPHQL_PROXY_TARGET`, or `VITE_GRAPHQL_URL` for a deployed indexer, to point
it elsewhere.

```bash
cd indexer && pnpm test   # simulated lifecycle test + a HyperSync replay pinned to slot 462,250,000
```

The replay test calls HyperSync, so CI needs an `ENVIO_API_TOKEN` repository secret.

## Deploying

### Indexer on Envio Cloud

The repository has to be linked to an Envio organisation first
([envio.dev/app](https://envio.dev/app), with the Envio GitHub app installed on
`enviodev/envio-islanddao-demo`). Then:

```bash
npx envio-cloud login
npx envio-cloud indexer add \
  --name islanddao \
  --repo envio-islanddao-demo \
  --branch main \
  --root-dir indexer/ \
  --config-file config.yaml
npx envio-cloud deployment status islanddao <commit> --watch-till-synced
npx envio-cloud deployment endpoint islanddao <commit>   # the GraphQL URL for the dashboard
```

### Dashboard on GitHub Pages

`.github/workflows/pages.yml` builds `dashboard/` and publishes it on every
push to `main` that touches it.

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables**: set
   `ENVIO_GRAPHQL_URL` to the endpoint from the step above.
3. Run the "Dashboard (GitHub Pages)" workflow, or push to `main`. The site is
   served at `https://enviodev.github.io/envio-islanddao-demo/`.

Until the variable is set, the site deploys with a "not connected yet" notice
instead of data.

Pages only serves static files, so the build writes `organizers/` and `me/`
copies of the app and a `404.html` fallback for dynamic paths such as
`/me/<wallet>` (those load with HTTP status 404). To drop the
`/envio-islanddao-demo/` prefix, add a custom domain in Settings → Pages and
set the `DASHBOARD_BASE_PATH` variable to `/`.

## What the demo shows off

- **Solana in HyperIndex without an IDL.** Instructions are declared inline in
  `config.yaml` with byte discriminators, named account slots (including
  optional `?slots`) and Borsh `args`. Two rows share `0x00` so either tail
  length decodes.
- **HyperSync as the source.** It backfills the program's whole history in
  minutes, then follows the head.
- **Entity aggregation in handlers.** Status counters, unique attendees, daily
  buckets and per-attendee day numbers are maintained in the handlers, so the
  dashboard needs no aggregate queries.
- **Tests on both sides.** Simulated instructions cover the logic, and a pinned
  HyperSync replay checks the reverse-engineered layouts against real data.
