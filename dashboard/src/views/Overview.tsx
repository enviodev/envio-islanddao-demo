import { useMemo, useState } from "react";
import { OVERVIEW_QUERY, usePolling, type OverviewData } from "../api";
import { EnvioCta } from "../brand";
import { ago, dateRange, dayOfEvent, eventDays, isLive, num, ordinal, plural, solscanTx, tzLabel, userName } from "../format";
import { DayDots, IslandCalendar } from "../island";
import type { Route } from "../router";
import { AvatarLink, Link, Loading, Person, Section, profileRoute } from "../ui";

export function Overview({ eventId, edition, now }: { eventId: string; edition?: string; now: number }) {
  const { data, error } = usePolling<OverviewData>(OVERVIEW_QUERY, { event: eventId }, 5_000);
  const event = data?.Event_by_pk;
  const islandDays = useMemo(() => (data?.EventDay ?? []).map((d) => d.day), [data?.EventDay]);
  const [imageOk, setImageOk] = useState(true);

  if (error && !data) return <p className="error">Could not reach the indexer: {error}</p>;
  if (!data || !event) return <Loading>Loading the island…</Loading>;

  const live = isLive(event, now);
  const totalDays = eventDays(event).length;
  const today = dayOfEvent(event, now);
  const progress = live ? today / totalDays : now > event.endTime ? 1 : 0;
  const islandersRoute: Route = { view: "islanders", edition };
  const analyticsRoute: Route = { view: "analytics", edition };

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="kicker">
            {event.location} · {dateRange(event.startTime, event.endTime, event.utcOffsetMinutes)}
          </div>
          <h1>{event.name}</h1>
          <p className="hero-tagline">Weeks of coworking on an island, with the people building Solana. Every check-in lands on-chain.</p>
          <p className="hero-status">
            {live ? <span className="live-pill">Live</span> : <span className="wrapped-pill">{now > event.endTime ? "Wrapped" : "Coming up"}</span>}
            {event.lastCheckInAt ? <>last check-in {ago(event.lastCheckInAt, now)}</> : "no check-ins yet"}
          </p>
          <div className="hero-actions">
            <Link to={islandersRoute} className="primary-button">
              Meet the {num(event.uniqueAttendeeCount)} islanders →
            </Link>
            <Link to={analyticsRoute} className="ghost-button">
              Event analytics
            </Link>
          </div>
        </div>
        <div className="hero-side">
          {event.imageUrl && imageOk && (
            <img className="hero-image" src={event.imageUrl} alt="" onError={() => setImageOk(false)} />
          )}
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
                    Day {today}
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
        </div>
      </section>

      <Section
        title="Island calendar"
        subtitle={`One tile per event day, in local time (${tzLabel(event.utcOffsetMinutes)}). The brighter the tile, the more islanders checked in.`}
      >
        <IslandCalendar event={event} days={data.EventDay} now={now} />
      </Section>

      <div className="columns">
        <Section title="Just landed" subtitle={live ? "The latest check-ins, updated live." : "The last check-ins of the event."}>
          {data.recent.length ? (
            <ul className="feed">
              {data.recent.map((c) => (
                <li key={c.id}>
                  <AvatarLink user={c.user} size={36} />
                  <span className="feed-text">
                    <Link to={profileRoute(c.user)} className="feed-name">
                      {userName(c.user)}
                    </Link>
                    <span className="muted">
                      {c.dayNumber === 1 ? "first day on the island 🌴" : `${ordinal(c.dayNumber)} day on the island`} · event day {c.eventDay}
                    </span>
                  </span>
                  <a className="feed-time" href={solscanTx(c.txSignature)} target="_blank" rel="noreferrer" title="View the transaction on Solscan">
                    {ago(c.timestamp, now)} ↗
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No check-ins yet. The first ones land here within seconds.</p>
          )}
        </Section>

        <Section
          title="Island regulars"
          subtitle="Most days checked in. Each dot is an island day: a day anyone checked in."
          aside={
            <Link to={islandersRoute} className="text-link">
              Everyone →
            </Link>
          }
        >
          <ol className="regulars">
            {data.regulars.map((r, i) => (
              <li key={r.user.id}>
                <span className="rank">{i + 1}</span>
                <span className="regular-main">
                  <Person user={r.user} size={36} sub={<DayDots islandDays={islandDays} attended={new Set(r.checkIns.map((c) => c.day))} />} />
                </span>
                <span className="regular-count" title={plural(r.checkInCount, "day")}>
                  {r.checkInCount}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <Section
        title={`${num(data.islanders.length)} islanders`}
        subtitle="Everyone who checked in, in the order they arrived. Tap a face to open their profile."
        aside={
          <Link to={{ view: "me" }} className="ghost-button">
            Find your profile →
          </Link>
        }
      >
        <div className="wall">
          {data.islanders.map((r) => (
            <span key={r.user.id} className="wall-item">
              <AvatarLink user={r.user} size={40} title={`${userName(r.user)} · ${plural(r.checkInCount, "day")}`} />
            </span>
          ))}
        </div>
      </Section>

      <EnvioCta title="This island runs on Envio" />
    </>
  );
}
