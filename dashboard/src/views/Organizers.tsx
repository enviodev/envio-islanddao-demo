import { useMemo } from "react";
import { ORGANIZER_QUERY, usePolling, type OrganizerData } from "../api";
import { EnvioCta } from "../brand";
import { DailyCheckIns, Funnel, Histogram, Legend, type DayPoint } from "../charts";
import { PROGRAM_ID, ago, dateRange, dateTime, daysBetween, num, shortAddress, solscanAccount, solscanTx, usdc } from "../format";
import { Person, Section, Stat } from "../ui";

export function Organizers({ eventId, now }: { eventId: string; now: number }) {
  const { data, error, updatedAt } = usePolling<OrganizerData>(ORGANIZER_QUERY, { event: eventId }, 5_000);
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
  if (!data || !event) return <p className="muted loading">Loading analytics…</p>;

  const activeDays = days.filter((d) => d.first + d.returning > 0).length;
  const regulars = data.registrations.filter((r) => r.checkInCount >= 5).length;
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
  const meta = data._meta[0];
  const head = data.chain_metadata[0]?.block_height;
  const g = data.GlobalStats[0];

  return (
    <>
      <section className="page-head">
        <div className="kicker">Organizer analytics</div>
        <h1>{event.name}</h1>
        <p className="muted">
          {dateRange(event.startTime, event.endTime)} · {event.location}
          {event.venue ? ` · ${event.venue}` : ""}
          {updatedAt && <> · refreshed {ago(updatedAt / 1000, now)}</>}
        </p>
      </section>

      <section className="stats">
        <Stat label="Registrations" value={num(event.registrationCount)} sub={`${num(event.cancelledCount)} cancelled`} />
        {usesApprovals ? (
          <Stat label="Approved" value={num(event.approvedCount)} sub={`${num(event.pendingCount)} pending · ${num(event.rejectedCount)} rejected`} />
        ) : (
          <Stat label="Sessions" value={num(event.sessionCount)} sub="talks, demos & socials" />
        )}
        <Stat
          label="Show-up rate"
          value={`${Math.round((event.uniqueAttendeeCount / Math.max(1, usesApprovals ? event.approvedCount : event.registrationCount)) * 100)}%`}
          sub={`${num(event.uniqueAttendeeCount)} of ${num(usesApprovals ? event.approvedCount : event.registrationCount)} ${usesApprovals ? "approved" : "registered"}`}
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
          <Section
            title="Daily check-ins"
            subtitle="One co-signed check-in per attendee per day."
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

        <Section title="Registration funnel" subtitle="From sign-up to showing up.">
          <Funnel steps={funnel} />
        </Section>

        <Section title="Days attended" subtitle="Attendees by number of days checked in.">
          {histogram.length ? <Histogram data={histogram} xLabel="days checked in" /> : <p className="muted">No check-ins yet.</p>}
        </Section>

        <Section title="Latest check-ins" subtitle="Most recent first, linked to the transaction.">
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
        </Section>

        <Section title="Most days checked in" subtitle="Ties go to whoever showed up first.">
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
        </Section>

        {data.sessions.length > 0 && (
          <Section title="Sessions" subtitle={`${num(data.sessions.length)} sessions on the on-chain calendar.`}>
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
          </Section>
        )}

        {data.tiers.length > 0 && (
          <Section title="Weekly passes" subtitle="Metaplex Core passes paid in USDC.">
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
        </div>
        {g && (
          <div className="muted">
            All time: {num(g.events)} events & sessions · {num(g.users)} wallets · {num(g.registrations)} registrations · {num(g.checkIns)} check-ins ·{" "}
            {num(g.passesSold)} passes ({usdc(g.passRevenue)})
          </div>
        )}
      </section>

      <EnvioCta title="Run analytics like this for your own event">
        The data behind these charts comes from a HyperIndex indexer: a config file, a schema and a few TypeScript handlers.
        HyperSync backfilled the whole program in minutes, and new check-ins show up within seconds.
      </EnvioCta>
    </>
  );
}
