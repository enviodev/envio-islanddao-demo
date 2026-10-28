import { useState, type FormEvent } from "react";
import { MY_ISLAND_QUERY, usePolling, type MyIslandData, type MyRegistration } from "../api";
import { EnvioCta } from "../brand";
import { dateTime, num, shortAddress, shortDay, solscanAccount, userName } from "../format";
import { Avatar, Passport } from "../island";
import { Section, Stat } from "../ui";

/** Personal numbers for one registration, ranked against everyone who checked in. */
function personalStats(r: MyRegistration) {
  const islandDays = r.event.days.map((d) => d.day);
  const attended = new Set(r.checkIns.map((c) => c.day));
  const others = r.event.attendees;
  const rank = others.filter((a) => a.checkInCount > r.checkInCount).length + 1;
  const arrival = r.firstCheckInAt === null ? undefined : others.filter((a) => a.firstCheckInAt < r.firstCheckInAt!).length + 1;

  let streak = 0;
  let run = 0;
  for (const d of islandDays) {
    run = attended.has(d) ? run + 1 : 0;
    streak = Math.max(streak, run);
  }

  // Median time of day in the viewer's timezone (attendees are usually on the island when they look).
  const minutes = r.checkIns
    .map((c) => {
      const d = new Date(c.timestamp * 1000);
      return d.getHours() * 60 + d.getMinutes();
    })
    .sort((a, b) => a - b);
  const median = minutes.length ? minutes[Math.floor(minutes.length / 2)] : undefined;
  const usualTime =
    median === undefined ? undefined : `${String(Math.floor(median / 60)).padStart(2, "0")}:${String(median % 60).padStart(2, "0")}`;

  const busiest = r.event.days.filter((d) => attended.has(d.day)).sort((a, b) => b.checkIns - a.checkIns)[0];
  const average = r.event.checkInCount / Math.max(1, r.event.uniqueAttendeeCount);

  return { islandDays, attended, rank, total: others.length, arrival, streak, usualTime, busiest, average };
}

function EventStory({ user, r }: { user: Parameters<typeof Passport>[0]["user"]; r: MyRegistration }) {
  const s = personalStats(r);
  const topShare = s.total ? Math.max(1, Math.round((s.rank / s.total) * 100)) : undefined;
  return (
    <div className="story">
      <Passport user={user} event={r.event} status={r.status} checkIns={r.checkIns} />
      {r.checkInCount > 0 ? (
        <div className="story-stats">
          <Stat
            label="Days on the island"
            value={
              <>
                {r.checkInCount}
                <small> / {s.islandDays.length}</small>
              </>
            }
            sub={`${Math.round((r.checkInCount / Math.max(1, s.islandDays.length)) * 100)}% of island days`}
          />
          <Stat
            label="Leaderboard"
            value={`#${s.rank}`}
            sub={`of ${num(s.total)} islanders${topShare !== undefined && topShare <= 50 ? ` · top ${topShare}%` : ""}`}
          />
          <Stat label="Islander number" value={s.arrival ? `#${s.arrival}` : "–"} sub={`by first check-in, ${dateTime(r.firstCheckInAt!)}`} />
          <Stat label="Longest streak" value={`${s.streak} ${s.streak === 1 ? "day" : "days"}`} sub="in a row, counting island days" />
          <Stat label="Usual check-in" value={s.usualTime ?? "–"} sub="median time, your timezone" />
          <Stat
            label="Vs. the average islander"
            value={`${r.checkInCount >= s.average ? "+" : ""}${(r.checkInCount - s.average).toFixed(1)}`}
            sub={`days (average is ${s.average.toFixed(1)})`}
          />
          {s.busiest && (
            <p className="story-note">
              Your busiest day was <b>{shortDay(s.busiest.day)}</b>, with {num(s.busiest.checkIns)} islanders checking in alongside you.
            </p>
          )}
        </div>
      ) : (
        <div className="story-stats story-empty">
          <p>
            {r.status === "Approved"
              ? "You're approved. Check in at the villa and your first stamp lands here within seconds."
              : r.status === "Registered"
                ? "Registered and waiting for the organizers. Your passport fills up once you check in."
                : `This registration is ${r.status.toLowerCase()}.`}
          </p>
        </div>
      )}
    </div>
  );
}

export function MyIsland({ wallet, onWallet }: { wallet?: string; onWallet: (w?: string) => void }) {
  const [input, setInput] = useState(wallet ?? "");
  const { data, error } = usePolling<MyIslandData>(MY_ISLAND_QUERY, { id: wallet ?? "" }, 10_000, wallet !== undefined);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onWallet(input.trim() || undefined);
  };
  const user = data?.User_by_pk;

  return (
    <>
      <section className="page-head">
        <div className="kicker">My island</div>
        <h1>Your IslandDAO, on-chain</h1>
        <p className="muted">Paste the wallet you registered with to see your passport, streaks and where you rank. Nothing to connect or sign.</p>
        <form className="search" onSubmit={submit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Your Solana wallet address"
            spellCheck={false}
            aria-label="Solana wallet address"
          />
          <button type="submit">Show my island</button>
        </form>
      </section>

      {error && <p className="error">{error}</p>}
      {wallet && !data && !error && <p className="muted loading">Looking you up…</p>}
      {wallet && data && (!user || user.registrations.length === 0) && (
        <Section title="No passport yet" subtitle={`We couldn't find IslandDAO registrations for ${shortAddress(wallet)}.`}>
          <p className="muted">Double-check that this is the wallet you used on islanddao.org, or register for the next edition.</p>
        </Section>
      )}

      {user && user.registrations.length > 0 && (
        <>
          <section className="profile">
            <Avatar user={user} size={64} />
            <div>
              <h2>{userName(user)}</h2>
              <p className="muted">
                {user.xHandle && (
                  <>
                    <a href={`https://x.com/${user.xHandle}`} target="_blank" rel="noreferrer">
                      @{user.xHandle}
                    </a>{" "}
                    ·{" "}
                  </>
                )}
                {user.bio ? `${user.bio} · ` : ""}
                <a href={solscanAccount(user.id)} target="_blank" rel="noreferrer">
                  {shortAddress(user.id)}
                </a>{" "}
                · on-chain since {dateTime(user.firstSeenAt)}
              </p>
            </div>
          </section>
          {user.registrations.map((r) => (
            <Section key={r.id} title={r.event.name} subtitle={r.event.location}>
              <EventStory user={user} r={r} />
            </Section>
          ))}
        </>
      )}

      <EnvioCta title="Your passport is an API call away">
        Your stamps are read from Solana by an Envio HyperIndex indexer and served as GraphQL. Get a free API token and you
        can index any program the same way: check-ins, swaps, NFTs, anything.
      </EnvioCta>
    </>
  );
}
