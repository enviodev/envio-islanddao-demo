import { useMemo } from "react";
import { OVERVIEW_QUERY, usePolling, type OverviewData } from "../api";
import { EnvioCta } from "../brand";
import { ago, dateRange, daysBetween, isLive, num, solscanAccount, solscanTx, userName, utcDay } from "../format";
import { Avatar, DayDots, IslandCalendar } from "../island";
import { Section } from "../ui";

export function Overview({ eventId, now, onFindPassport }: { eventId: string; now: number; onFindPassport: () => void }) {
  const { data, error } = usePolling<OverviewData>(OVERVIEW_QUERY, { event: eventId }, 5_000);
  const event = data?.Event_by_pk;
  const islandDays = useMemo(() => (data?.EventDay ?? []).map((d) => d.day), [data?.EventDay]);

  if (error && !data) return <p className="error">Could not reach the indexer: {error}</p>;
  if (!data || !event) return <p className="muted loading">Loading the island…</p>;

  const live = isLive(event, now);
  const totalDays = daysBetween(utcDay(event.startTime), utcDay(event.endTime)).length;
  const dayOfEvent = Math.min(totalDays, Math.max(0, Math.floor((now - event.startTime) / 86_400) + 1));
  const progress = live ? dayOfEvent / totalDays : now > event.endTime ? 1 : 0;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="kicker">
            {event.location} · {dateRange(event.startTime, event.endTime)}
          </div>
          <h1>{event.name}</h1>
          <p className="hero-tagline">Four weeks of coworking on an island, with the people building Solana. Every check-in lands on-chain.</p>
          <p className="hero-status">
            {live ? <span className="live-pill">Live</span> : <span className="wrapped-pill">{now > event.endTime ? "Wrapped" : "Coming up"}</span>}
            {event.lastCheckInAt ? <>last check-in {ago(event.lastCheckInAt, now)}</> : "no check-ins yet"}
          </p>
        </div>
        <div className="hero-numbers">
          <div className="big">
            <span className="big-value">{num(event.uniqueAttendeeCount)}</span>
            <span className="big-label">islanders checked in</span>
          </div>
          <div className="big">
            <span className="big-value">{num(event.checkInCount)}</span>
            <span className="big-label">check-ins on Solana</span>
          </div>
          <div className="big">
            <span className="big-value">
              {live ? (
                <>
                  Day {dayOfEvent}
                  <small> / {totalDays}</small>
                </>
              ) : (
                <>
                  {totalDays}
                  <small> days</small>
                </>
              )}
            </span>
            <span className="progress" aria-label={`${Math.round(progress * 100)}% of the event`}>
              <i style={{ width: `${progress * 100}%` }} />
            </span>
          </div>
        </div>
      </section>

      <Section title="Island calendar" subtitle="One tile per day. The brighter the tile, the more islanders checked in.">
        <IslandCalendar startTime={event.startTime} endTime={event.endTime} days={data.EventDay} now={now} />
      </Section>

      <div className="columns">
        <Section title="Just landed" subtitle={live ? "The latest check-ins, updated live." : "The last check-ins of the event."}>
          <ul className="feed">
            {data.recent.map((c) => (
              <li key={c.id}>
                <Avatar user={c.user} size={36} />
                <span className="feed-text">
                  <b>{userName(c.user)}</b>
                  <span className="muted">{c.dayNumber === 1 ? "first day on the island 🌴" : `day ${c.dayNumber} on the island`}</span>
                </span>
                <a className="feed-time" href={solscanTx(c.txSignature)} target="_blank" rel="noreferrer">
                  {ago(c.timestamp, now)}
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Island regulars" subtitle="Most days checked in. Each dot is an island day.">
          <ol className="regulars">
            {data.regulars.map((r, i) => (
              <li key={r.user.id}>
                <span className="rank">{i + 1}</span>
                <Avatar user={r.user} size={36} />
                <span className="regular-main">
                  <a href={solscanAccount(r.user.id)} target="_blank" rel="noreferrer">
                    {userName(r.user)}
                  </a>
                  <DayDots islandDays={islandDays} attended={new Set(r.checkIns.map((c) => c.day))} />
                </span>
                <span className="regular-count">{r.checkInCount}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <Section
        title={`${num(data.islanders.length)} islanders`}
        subtitle="Everyone who checked in, in the order they arrived."
        aside={
          <button className="ghost-button" onClick={onFindPassport}>
            Find your passport →
          </button>
        }
      >
        <div className="wall">
          {data.islanders.map((r) => (
            <span key={r.user.id} className="wall-item" title={`${userName(r.user)} · ${r.checkInCount} ${r.checkInCount === 1 ? "day" : "days"}`}>
              <Avatar user={r.user} size={40} />
            </span>
          ))}
        </div>
      </Section>

      <EnvioCta title="This island runs on Envio" />
    </>
  );
}
