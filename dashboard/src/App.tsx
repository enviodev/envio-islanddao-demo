import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  DASHBOARD_QUERY,
  EVENTS_QUERY,
  WALLET_QUERY,
  usePolling,
  type Dashboard,
  type MainEvent,
  type UserRef,
  type WalletLookup,
} from "./api";
import { DailyCheckIns, Funnel, Histogram, Legend, type DayPoint } from "./charts";
import {
  PROGRAM_ID,
  ago,
  dateRange,
  dateTime,
  daysBetween,
  num,
  shortAddress,
  solscanAccount,
  solscanTx,
  usdc,
  userName,
} from "./format";

const POLL_MS = 5_000;

const isLive = (e: { startTime: number; endTime: number }, now: number) => now >= e.startTime && now <= e.endTime;

function useNow(intervalMs = 1_000) {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Avatar({ user, size = 28 }: { user: UserRef; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = userName(user).replace(/^@/, "").slice(0, 2).toUpperCase();
  return user.avatarUrl && !broken ? (
    <img className="avatar" src={user.avatarUrl} width={size} height={size} alt="" onError={() => setBroken(true)} />
  ) : (
    <span className="avatar avatar-fallback" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

function Person({ user }: { user: UserRef }) {
  return (
    <span className="person">
      <Avatar user={user} />
      <span>
        <a href={solscanAccount(user.id)} target="_blank" rel="noreferrer">
          {userName(user)}
        </a>
        {user.xHandle && user.displayName && <small>@{user.xHandle}</small>}
      </span>
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function Card({ title, subtitle, children, aside }: { title: string; subtitle?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function WalletSearch() {
  const [input, setInput] = useState("");
  const [wallet, setWallet] = useState<string>();
  const { data, error } = usePolling<WalletLookup>(WALLET_QUERY, { id: wallet ?? "" }, 15_000, wallet !== undefined);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    setWallet(v || undefined);
  };
  const user = data?.User_by_pk;
  return (
    <Card title="Look up a wallet" subtitle="Every registration and check-in a wallet made, straight from the index.">
      <form className="search" onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Solana wallet address"
          spellCheck={false}
          aria-label="Solana wallet address"
        />
        <button type="submit">Search</button>
      </form>
      {error && <p className="error">{error}</p>}
      {wallet && data && !user && <p className="muted">No IslandDAO activity found for {shortAddress(wallet)}.</p>}
      {user && (
        <div className="wallet">
          <div className="wallet-head">
            <Avatar user={user} size={44} />
            <div>
              <strong>{userName(user)}</strong>
              <div className="muted">
                {user.bio ? `${user.bio} · ` : ""}first seen {dateTime(user.firstSeenAt)}
              </div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Status</th>
                <th>Registered</th>
                <th className="num">Days checked in</th>
              </tr>
            </thead>
            <tbody>
              {user.registrations.map((r) => (
                <tr key={r.id}>
                  <td>{r.event.name}</td>
                  <td>
                    <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                  </td>
                  <td>{dateTime(r.registeredAt)}</td>
                  <td className="num">{num(r.checkInCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {user.checkIns.length > 0 && (
            <ul className="timeline">
              {user.checkIns.map((c) => (
                <li key={c.id}>
                  <span>
                    Day {c.dayNumber} · {c.event.name}
                  </span>
                  <a href={solscanTx(c.txSignature)} target="_blank" rel="noreferrer">
                    {dateTime(c.timestamp)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function EventDashboard({ eventId, now }: { eventId: string; now: number }) {
  const { data, error, updatedAt } = usePolling<Dashboard>(DASHBOARD_QUERY, { event: eventId }, POLL_MS);
  const event = data?.Event_by_pk;

  const days: DayPoint[] = useMemo(() => {
    const rows = data?.EventDay ?? [];
    if (!rows.length) return [];
    const byDay = new Map(rows.map((r) => [r.day, r]));
    return daysBetween(rows[0].day, rows[rows.length - 1].day).map((day) => {
      const r = byDay.get(day);
      return { day, first: r?.firstTimers ?? 0, returning: (r?.checkIns ?? 0) - (r?.firstTimers ?? 0) };
    });
  }, [data?.EventDay]);

  const histogram = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of data?.registrations ?? []) {
      if (r.checkInCount > 0) counts.set(r.checkInCount, (counts.get(r.checkInCount) ?? 0) + 1);
    }
    const max = Math.max(0, ...counts.keys());
    return Array.from({ length: max }, (_, i) => ({ x: i + 1, count: counts.get(i + 1) ?? 0 }));
  }, [data?.registrations]);

  if (error && !data) return <p className="error">Could not reach the indexer: {error}</p>;
  if (!data || !event) return <p className="muted loading">Loading…</p>;

  const live = isLive(event, now);
  const activeDays = days.filter((d) => d.first + d.returning > 0).length;
  const regulars = (data.registrations ?? []).filter((r) => r.checkInCount >= 5).length;
  const usesApprovals = event.approvedCount + event.rejectedCount > 0;
  const funnel = [
    { label: "Registered", value: event.registrationCount, hint: "Distinct registrations, any status" },
    ...(usesApprovals ? [{ label: "Approved", value: event.approvedCount, hint: "Accepted by the organizers" }] : []),
    { label: "Checked in", value: event.uniqueAttendeeCount, hint: "At least one on-chain check-in" },
    { label: "5+ days", value: regulars, hint: "Checked in on five or more days" },
  ];
  const sessionsByCategory = Object.entries(
    data.sessions.reduce<Record<string, number>>((acc, s) => ((acc[s.categoryLabel] = (acc[s.categoryLabel] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);
  const upcoming = data.sessions.filter((s) => s.endTime >= now).slice(0, 6);
  const shownSessions = upcoming.length ? upcoming : data.sessions.slice(-6);

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">
            {event.organization.name} · {event.location}
            {event.venue ? ` · ${event.venue}` : ""}
          </div>
          <h1>
            {event.name}
            {live && <span className="live-pill">Live</span>}
          </h1>
          <p className="muted">
            {dateRange(event.startTime, event.endTime)} ·{" "}
            {event.lastCheckInAt ? `last check-in ${ago(event.lastCheckInAt, now)}` : "no check-ins yet"}
            {updatedAt && <> · refreshed {ago(updatedAt / 1000, now)}</>}
          </p>
        </div>
      </section>

      <section className="stats">
        <Stat label="Registrations" value={num(event.registrationCount)} sub={`${num(event.cancelledCount)} cancelled`} />
        {usesApprovals ? (
          <Stat
            label="Approved"
            value={num(event.approvedCount)}
            sub={`${num(event.pendingCount)} pending · ${num(event.rejectedCount)} rejected`}
          />
        ) : (
          <Stat label="Sessions" value={num(event.sessionCount)} sub="talks, demos & socials" />
        )}
        <Stat
          label="Unique attendees"
          value={num(event.uniqueAttendeeCount)}
          sub={`${Math.round((event.uniqueAttendeeCount / Math.max(1, event.registrationCount)) * 100)}% of registrations`}
        />
        <Stat label="Check-ins" value={num(event.checkInCount)} sub={`over ${num(activeDays)} days`} />
        <Stat
          label="Avg days / attendee"
          value={(event.checkInCount / Math.max(1, event.uniqueAttendeeCount)).toFixed(1)}
          sub={`${num(regulars)} came 5+ days`}
        />
      </section>

      <div className="grid">
        <div className="span-2">
          <Card
            title="Daily check-ins"
            subtitle="One co-signed check-in per attendee per day. Weekends are off."
            aside={
              <Legend
                items={[
                  { label: "First check-in", color: "var(--series-1)" },
                  { label: "Returning", color: "var(--series-2)" },
                ]}
              />
            }
          >
            {days.length ? <DailyCheckIns data={days} /> : <p className="muted">No check-ins yet.</p>}
          </Card>
        </div>

        <Card title="Registration funnel" subtitle="From sign-up to showing up.">
          <Funnel steps={funnel} />
        </Card>

        <Card title="Days attended" subtitle="Attendees by number of days they checked in.">
          {histogram.length ? <Histogram data={histogram} xLabel="days checked in" /> : <p className="muted">No check-ins yet.</p>}
        </Card>

        <Card title="Latest check-ins" subtitle={live ? `Updates every ${POLL_MS / 1000}s.` : "Most recent first."}>
          <table>
            <thead>
              <tr>
                <th>Attendee</th>
                <th className="num">Day</th>
                <th className="num">When</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Person user={c.user} />
                  </td>
                  <td className="num">#{c.dayNumber}</td>
                  <td className="num">
                    <a href={solscanTx(c.txSignature)} target="_blank" rel="noreferrer" title={dateTime(c.timestamp)}>
                      {ago(c.timestamp, now)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Most days checked in" subtitle="Ties go to whoever showed up first.">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Attendee</th>
                <th className="num">Days</th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((r, i) => (
                <tr key={r.user.id}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <Person user={r.user} />
                  </td>
                  <td className="num">{num(r.checkInCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {data.sessions.length > 0 && (
          <Card title="Sessions" subtitle={`${num(data.sessions.length)} sessions on the on-chain calendar.`}>
            <div className="chips">
              {sessionsByCategory.map(([label, count]) => (
                <span key={label} className="chip">
                  {label} <b>{count}</b>
                </span>
              ))}
            </div>
            <ul className="sessions">
              {shownSessions.map((s) => (
                <li key={s.id}>
                  <span>{s.name}</span>
                  <small className="muted">
                    {s.categoryLabel} · {dateTime(s.startTime)}
                  </small>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {data.tiers.length > 0 && (
          <Card title="Weekly passes" subtitle="Metaplex Core passes paid in USDC.">
            <table>
              <thead>
                <tr>
                  <th>Pass</th>
                  <th className="num">Price</th>
                  <th className="num">Sold</th>
                </tr>
              </thead>
              <tbody>
                {data.tiers.map((t) => (
                  <tr key={t.name}>
                    <td>
                      {t.name} <small className="muted">{t.dates}</small>
                    </td>
                    <td className="num">{usdc(t.price)}</td>
                    <td className="num">
                      {num(t.sold)}
                      {t.maxSupply ? <span className="muted"> / {num(Number(t.maxSupply))}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <WalletSearch />
      <IndexerFooter data={data} />
    </>
  );
}

function IndexerFooter({ data }: { data: Dashboard }) {
  const meta = data._meta[0];
  const head = data.chain_metadata[0]?.block_height;
  const g = data.GlobalStats[0];
  return (
    <footer className="footer">
      <div>
        <span className={`dot ${meta?.isReady ? "dot-ok" : "dot-sync"}`} />
        {meta?.isReady ? "Synced" : "Syncing"} · slot {num(meta?.progressBlock ?? 0)}
        {head ? ` of ${num(head)}` : ""}
      </div>
      {g && (
        <div className="muted">
          All time: {num(g.events)} events & sessions · {num(g.users)} wallets · {num(g.registrations)} registrations ·{" "}
          {num(g.checkIns)} check-ins · {num(g.passesSold)} passes ({usdc(g.passRevenue)})
        </div>
      )}
      <div className="muted">
        Indexed with Envio HyperIndex from program{" "}
        <a href={solscanAccount(PROGRAM_ID)} target="_blank" rel="noreferrer">
          {shortAddress(PROGRAM_ID)}
        </a>{" "}
        via HyperSync.
      </div>
    </footer>
  );
}

export function App() {
  const now = useNow();
  const { data, error } = usePolling<{ Event: MainEvent[] }>(EVENTS_QUERY, {}, 60_000);
  const events = data?.Event ?? [];
  const [selected, setSelected] = useState<string>();
  const eventId = selected ?? events[0]?.id;

  return (
    <div className="page">
      <nav className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◎
          </span>
          IslandDAO <span className="muted">on-chain check-ins</span>
        </div>
        <div className="tabs" role="tablist">
          {events.map((e) => (
            <button
              key={e.id}
              role="tab"
              aria-selected={e.id === eventId}
              className={e.id === eventId ? "tab active" : "tab"}
              onClick={() => setSelected(e.id)}
            >
              {e.name.replace("IslandDAO ", "")}
              {isLive(e, now) && <span className="live-dot" aria-label="live" />}
            </button>
          ))}
        </div>
      </nav>
      <main>
        {error && !data && <p className="error">Could not reach the indexer GraphQL API: {error}</p>}
        {eventId && <EventDashboard key={eventId} eventId={eventId} now={now} />}
      </main>
    </div>
  );
}
