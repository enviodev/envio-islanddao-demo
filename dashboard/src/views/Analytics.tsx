import { useMemo, useState } from "react";
import { ANALYTICS_QUERY, usePolling, type AnalyticsData, type UserRef } from "../api";
import { EnvioCta } from "../brand";
import { DailyCheckIns, Funnel, Histogram, Legend, Signups, type DayPoint, type SignupPoint } from "../charts";
import {
  PROGRAM_ID,
  ago,
  dateRange,
  dateTime,
  daysBetween,
  eventDays,
  localDay,
  num,
  plural,
  shortAddress,
  solscanAccount,
  tzLabel,
  usdc,
} from "../format";
import type { Route } from "../router";
import { Link, Loading, Person, Section, Stat } from "../ui";

export function Analytics({ eventId, edition, now }: { eventId: string; edition?: string; now: number }) {
  const { data, error, updatedAt } = usePolling<AnalyticsData>(ANALYTICS_QUERY, { event: eventId }, 5_000);
  const event = data?.Event_by_pk;
  const [category, setCategory] = useState<string>();
  const [allSessions, setAllSessions] = useState(false);

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

  const signups: SignupPoint[] = useMemo(() => {
    const regs = data?.registrations ?? [];
    if (!regs.length || !event) return [];
    const perDay = new Map<string, number>();
    for (const r of regs) {
      const d = localDay(r.registeredAt, event.utcOffsetMinutes);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    const sorted = [...perDay.keys()].sort();
    let total = 0;
    return daysBetween(sorted[0], sorted[sorted.length - 1]).map((day) => {
      const added = perDay.get(day) ?? 0;
      total += added;
      return { day, added, total };
    });
  }, [data?.registrations, event]);

  const buyers = useMemo(() => {
    const byBuyer = new Map<string, { user: UserRef; passes: string[]; spent: number }>();
    for (const p of data?.passes ?? []) {
      const b = byBuyer.get(p.buyer.id) ?? { user: p.buyer, passes: [], spent: 0 };
      b.passes.push(p.tier.name);
      b.spent += Number(p.price);
      byBuyer.set(p.buyer.id, b);
    }
    return [...byBuyer.values()].sort((a, b) => b.spent - a.spent);
  }, [data?.passes]);

  if (error && !data) return <p className="error">Could not reach the indexer: {error}</p>;
  if (!data || !event) return <Loading>Loading analytics…</Loading>;

  const activeDays = days.filter((d) => d.first + d.returning > 0).length;
  const regulars = data.registrations.filter((r) => r.checkInCount >= 5).length;
  const accepted = event.confirmedCount;
  const funnel = [
    { label: "Registered", value: event.registrationCount, hint: "Distinct registrations, whatever their status now" },
    ...(event.requiresApproval ? [{ label: "Approved", value: accepted, hint: "Approved by the organizers" }] : []),
    { label: "Checked in", value: event.uniqueAttendeeCount, hint: "At least one daily check-in" },
    { label: "5+ days", value: regulars, hint: "Checked in on five or more days" },
  ];
  const visibleSessions = data.sessions.filter((s) => s.statusLabel !== "Cancelled");
  const cancelledSessions = data.sessions.length - visibleSessions.length;
  const sessionsByCategory = Object.entries(
    visibleSessions.reduce<Record<string, number>>((acc, s) => ((acc[s.categoryLabel] = (acc[s.categoryLabel] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);
  const filteredSessions = data.sessions.filter((s) => !category || s.categoryLabel === category);
  const upcoming = filteredSessions.filter((s) => s.endTime >= now);
  const shownSessions = allSessions ? filteredSessions : (upcoming.length ? upcoming : filteredSessions).slice(0, 8);
  const revenue = data.passes.reduce((sum, p) => sum + Number(p.price), 0);
  const meta = data._meta[0];
  const head = data.chain_metadata[0]?.block_height;
  const g = data.GlobalStats[0];
  const leaderboard: Route = { view: "leaderboard", edition };
  const startDay = eventDays(event)[0];

  return (
    <>
      <section className="page-head">
        <div className="kicker">Event analytics</div>
        <h1>{event.name}</h1>
        <p className="muted">
          {dateRange(event.startTime, event.endTime, event.utcOffsetMinutes)} · {event.location}
          {event.venue ? ` · ${event.venue}` : ""} · times in {tzLabel(event.utcOffsetMinutes)}
          {updatedAt && <> · refreshed {ago(updatedAt / 1000, now)}</>}
        </p>
      </section>

      <section className="stats">
        <Stat label="Registrations" value={num(event.registrationCount)} sub={`${num(event.cancelledCount)} cancelled`} />
        {event.requiresApproval ? (
          <Stat label="Approved" value={num(accepted)} sub={`${num(event.pendingCount)} pending · ${num(event.rejectedCount)} rejected`} />
        ) : (
          <Stat label="Confirmed" value={num(accepted)} sub="no approval step: confirmed on sign-up" />
        )}
        <Stat
          label="Show-up rate"
          value={`${Math.round((event.uniqueAttendeeCount / Math.max(1, accepted)) * 100)}%`}
          sub={`${num(event.uniqueAttendeeCount)} of ${num(accepted)} ${event.requiresApproval ? "approved" : "confirmed"} checked in`}
        />
        <Stat label="Check-ins" value={num(event.checkInCount)} sub={`over ${plural(activeDays, "day")}`} />
        <Stat
          label="Avg days / attendee"
          value={(event.checkInCount / Math.max(1, event.uniqueAttendeeCount)).toFixed(1)}
          sub={`${num(regulars)} came 5+ days`}
        />
        {data.passes.length > 0 && <Stat label="Pass revenue" value={usdc(revenue)} sub={`${plural(data.passes.length, "pass", "passes")} to ${plural(buyers.length, "buyer")}`} />}
      </section>

      <div className="grid">
        <div className="span-2">
          <Section
            title="Daily check-ins"
            subtitle="Each attendee can check in once per event day."
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
          </Section>
        </div>

        <Section title="Registration funnel" subtitle="From sign-up to showing up, as a share of all registrations.">
          <Funnel steps={funnel} />
        </Section>

        <Section title="Sign-ups over time" subtitle="Running total of registrations. The dashed line is the first event day.">
          {signups.length ? <Signups data={signups} startDay={startDay} /> : <p className="muted">No registrations yet.</p>}
        </Section>

        <div className="span-2">
          <Section
            title="Days attended"
            subtitle="Attendees by number of days checked in."
            aside={
              <Link to={leaderboard} className="text-link">
                Leaderboard →
              </Link>
            }
          >
            {histogram.length ? <Histogram data={histogram} xLabel="days checked in" /> : <p className="muted">No check-ins yet.</p>}
          </Section>
        </div>

        {data.sessions.length > 0 && (
          <div className="span-2">
            <Section
              title="Sessions"
              subtitle={`${plural(visibleSessions.length, "session")} on the on-chain calendar${cancelledSessions ? `, plus ${num(cancelledSessions)} cancelled` : ""}. Edits made on-chain after creation are counted.`}
            >
              <div className="chips">
                <button className={!category ? "chip active" : "chip"} onClick={() => setCategory(undefined)}>
                  All <b>{visibleSessions.length}</b>
                </button>
                {sessionsByCategory.map(([label, count]) => (
                  <button key={label} className={category === label ? "chip active" : "chip"} onClick={() => setCategory(category === label ? undefined : label)}>
                    {label} <b>{count}</b>
                  </button>
                ))}
              </div>
              <ul className="sessions">
                {shownSessions.map((s) => (
                  <li key={s.id} className={s.statusLabel === "Cancelled" ? "session-cancelled" : undefined}>
                    <span className="session-name">
                      {s.name}
                      {s.statusLabel !== "Scheduled" && <span className={`badge status-${s.statusLabel.toLowerCase()}`}>{s.statusLabel}</span>}
                      {s.editCount > 0 && (
                        <span className="badge" title="Changed on-chain after it was created">
                          edited {s.editCount}×
                        </span>
                      )}
                    </span>
                    <small className="muted">
                      {s.categoryLabel} · {dateTime(s.startTime, s.utcOffsetMinutes || event.utcOffsetMinutes)}
                      {s.venue ? ` · ${s.venue}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
              {filteredSessions.length > shownSessions.length || allSessions ? (
                <button className="ghost-button show-more" onClick={() => setAllSessions(!allSessions)}>
                  {allSessions ? "Show fewer" : `Show all ${filteredSessions.length}`}
                </button>
              ) : null}
            </Section>
          </div>
        )}

        {data.tiers.length > 0 && (
          <Section title="Weekly passes" subtitle="Metaplex Core passes, paid in USDC.">
            <table>
              <thead>
                <tr>
                  <th>Pass</th>
                  <th className="num">Price</th>
                  <th className="num">Sold</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.tiers.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.name} <small className="muted">{t.dates}</small>
                    </td>
                    <td className="num">{usdc(t.price)}</td>
                    <td className="num">
                      {num(t.sold)}
                      {t.maxSupply ? <span className="muted"> / {num(Number(t.maxSupply))}</span> : null}
                    </td>
                    <td className="num">{usdc(Number(t.price) * t.sold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {buyers.length > 0 && (
          <Section title="Pass buyers" subtitle="Who bought passes, by total spent. Open a profile for each purchase.">
            <table>
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th className="num">Passes</th>
                  <th className="num">Spent</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((b) => (
                  <tr key={b.user.id}>
                    <td>
                      <Person user={b.user} sub={<small>{b.passes.join(", ")}</small>} />
                    </td>
                    <td className="num">{b.passes.length}</td>
                    <td className="num">{usdc(b.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>

      <section className="indexer-status">
        <div>
          <span className={`dot ${meta?.isReady ? "dot-ok" : "dot-sync"}`} />
          {meta?.isReady ? "Synced" : "Syncing"} · slot {num(meta?.progressBlock ?? 0)}
          {head ? ` of ${num(head)}` : ""} · program{" "}
          <a href={solscanAccount(PROGRAM_ID)} target="_blank" rel="noreferrer">
            {shortAddress(PROGRAM_ID)}
          </a>
          {event.editCount > 0 && event.updatedAt && <> · event details last edited on-chain {ago(event.updatedAt, now)}</>}
        </div>
        {g && (
          <div className="muted">
            All editions: {num(g.events)} events & sessions · {num(g.users)} wallets · {num(g.registrations)} registrations · {num(g.checkIns)} check-ins
          </div>
        )}
      </section>

      <EnvioCta context="These charts read from an Envio indexer over IslandDAO's Solana program, and update within seconds of each check-in." />
    </>
  );
}
