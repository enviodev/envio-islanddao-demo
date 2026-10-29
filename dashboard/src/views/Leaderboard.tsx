import { useMemo, useState } from "react";
import { EARLY_HOUR, localSeconds, longestStreak } from "../achievements";
import { EnvioCta } from "../brand";
import { LEADERBOARD_QUERY, usePolling, type LeaderboardData, type LeaderboardRow, type UserRef } from "../api";
import { ago, dateTime, num, plural, shortAddress, userName } from "../format";
import { Avatar } from "../island";
import { Link, Loading, Person, Section, StatusBadge, profileRoute } from "../ui";

type Sort = "rank" | "arrival" | "registered" | "name";
type Filter = "attended" | "all" | "pending";

const SORTS: { id: Sort; label: string }[] = [
  { id: "rank", label: "Rank" },
  { id: "arrival", label: "First to arrive" },
  { id: "registered", label: "Newest sign-ups" },
  { id: "name", label: "Name" },
];

/** Most days first; ties go to whoever checked in first. The same rule ranks profiles. */
export const byRank = (a: LeaderboardRow, b: LeaderboardRow) =>
  b.checkInCount - a.checkInCount || (a.firstCheckInAt ?? Infinity) - (b.firstCheckInAt ?? Infinity);

const compare: Record<Sort, (a: LeaderboardRow, b: LeaderboardRow) => number> = {
  rank: byRank,
  arrival: (a, b) => (a.firstCheckInAt ?? Infinity) - (b.firstCheckInAt ?? Infinity),
  registered: (a, b) => b.registeredAt - a.registeredAt,
  name: (a, b) => userName(a.user).localeCompare(userName(b.user)),
};

type BoardEntry = { user: UserRef; value: number };

/** Top five by `value`, skipping zeros; ties keep leaderboard order. */
function topFive(rows: LeaderboardRow[], value: (r: LeaderboardRow) => number): BoardEntry[] {
  return rows
    .map((r) => ({ user: r.user, value: value(r) }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function Board({ icon, title, rule, unit, entries }: { icon: string; title: string; rule: string; unit: string; entries: BoardEntry[] }) {
  return (
    <Section title={`${icon} ${title}`} subtitle={rule} className="board">
      {entries.length ? (
        <ol className="board-list">
          {entries.map((e, i) => (
            <li key={e.user.id}>
              <span className="rank">{i + 1}</span>
              <Person user={e.user} size={28} sub={null} />
              <span className="board-value">
                {num(e.value)} <small>{e.value === 1 ? unit : `${unit}s`}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Nobody yet.</p>
      )}
    </Section>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ eventId, now }: { eventId: string; now: number }) {
  const { data, error } = usePolling<LeaderboardData>(LEADERBOARD_QUERY, { event: eventId }, 15_000);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("rank");
  const [filter, setFilter] = useState<Filter>("attended");

  const ranked = useMemo(() => (data?.Registration ?? []).filter((r) => r.checkInCount > 0).sort(byRank), [data?.Registration]);
  const ranks = useMemo(() => new Map(ranked.map((r, i) => [r.id, i + 1])), [ranked]);

  const boards = useMemo(() => {
    if (!data?.Event_by_pk) return undefined;
    const tz = data.Event_by_pk.utcOffsetMinutes;
    const islandDays = data.EventDay.map((d) => d.day);
    const daysByUser = new Map<string, Set<string>>();
    const early = new Map<string, number>();
    for (const c of data.CheckIn) {
      if (!daysByUser.has(c.user_id)) daysByUser.set(c.user_id, new Set());
      daysByUser.get(c.user_id)!.add(c.day);
      if (localSeconds(c.timestamp, tz) < EARLY_HOUR * 3600) early.set(c.user_id, (early.get(c.user_id) ?? 0) + 1);
    }
    const firstIn = new Map<string, number>();
    for (const d of data.EventDay) firstIn.set(d.firstIn_id, (firstIn.get(d.firstIn_id) ?? 0) + 1);
    return {
      streak: topFive(ranked, (r) => longestStreak(islandDays, daysByUser.get(r.user.id) ?? new Set()).best),
      firstIn: topFive(ranked, (r) => firstIn.get(r.user.id) ?? 0),
      early: topFive(ranked, (r) => early.get(r.user.id) ?? 0),
    };
  }, [data, ranked]);

  if (error && !data) return <p className="error">Could not reach the indexer: {error}</p>;
  if (!data || !data.Event_by_pk || !boards) return <Loading>Ranking the islanders…</Loading>;

  const event = data.Event_by_pk;
  const rows = data.Registration;
  const islandDays = data.EventDay.length;
  const q = query.trim().toLowerCase();
  const counts = {
    attended: ranked.length,
    all: rows.length,
    pending: rows.filter((r) => r.status === "Pending").length,
  };
  const shown = rows
    .filter((r) => (filter === "attended" ? r.checkInCount > 0 : filter === "pending" ? r.status === "Pending" : true))
    .filter(
      (r) =>
        !q ||
        r.user.id.toLowerCase().includes(q) ||
        r.user.displayName?.toLowerCase().includes(q) ||
        r.user.xHandle?.toLowerCase().includes(q),
    )
    .sort(compare[sort]);
  const showStatus = filter !== "attended";
  const filters: { id: Filter; label: string }[] = [
    { id: "attended", label: "Checked in" },
    { id: "all", label: "All registrations" },
    ...(event.requiresApproval ? [{ id: "pending" as const, label: "Waiting for approval" }] : []),
  ];

  return (
    <>
      <section className="page-head">
        <div className="kicker">Leaderboard · {event.name}</div>
        <h1>Who showed up the most</h1>
        <p className="muted">
          Ranked by days checked in; ties go to whoever checked in first. {plural(islandDays, "island day")} so far, an island day being
          any day someone checked in.
        </p>
      </section>

      {ranked.length > 0 && (
        <section className="podium" aria-label="Top three">
          {ranked.slice(0, 3).map((r, i) => (
            <Link key={r.id} to={profileRoute(r.user)} className={`podium-step podium-${i + 1}`}>
              <span className="podium-medal" aria-hidden>
                {MEDALS[i]}
              </span>
              {/* The whole step is the link, so the avatar inside isn't one. */}
              <Avatar user={r.user} size={72} />
              <strong>{userName(r.user)}</strong>
              <span className="podium-days">
                {r.checkInCount} <small>/ {islandDays} days</small>
              </span>
            </Link>
          ))}
        </section>
      )}

      <div className="boards">
        <Board icon="🔥" title="Longest streak" rule="Island days in a row." unit="day" entries={boards.streak} />
        <Board icon="🚪" title="First one in" rule="Days they were the first to check in." unit="day" entries={boards.firstIn} />
        <Board icon="☀️" title="Early risers" rule={`Check-ins before ${EARLY_HOUR}:00 local time.`} unit="day" entries={boards.early} />
      </div>

      <Section title="Everyone" subtitle="Search, filter or re-sort. Every row opens that islander's profile.">
        <div className="toolbar">
          <input
            className="filter-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, X handle or wallet"
            aria-label="Search islanders"
          />
          <div className="segmented" role="radiogroup" aria-label="Show">
            {filters.map((f) => (
              <button key={f.id} role="radio" aria-checked={filter === f.id} className={filter === f.id ? "active" : ""} onClick={() => setFilter(f.id)}>
                {f.label} <b>{num(counts[f.id])}</b>
              </button>
            ))}
          </div>
          <label className="sort">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {shown.length ? (
          <div className="table-scroll">
            <table className="directory">
              <thead>
                <tr>
                  <th className="num">Rank</th>
                  <th>Islander</th>
                  <th>Days</th>
                  <th>First check-in</th>
                  {showStatus && <th>Status</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="num rank-cell">{ranks.get(r.id) ? `#${ranks.get(r.id)}` : "–"}</td>
                    <td>
                      <Person
                        user={r.user}
                        size={32}
                        sub={r.user.displayName ? <small>{r.user.xHandle ? `@${r.user.xHandle}` : shortAddress(r.user.id)}</small> : null}
                      />
                    </td>
                    <td>
                      <span className="days-cell">
                        <b>{r.checkInCount}</b>
                        <span className="days-bar" aria-hidden>
                          <i style={{ width: `${(r.checkInCount / Math.max(1, islandDays)) * 100}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="muted">
                      {r.firstCheckInAt ? (
                        dateTime(r.firstCheckInAt, event.utcOffsetMinutes).replace(/ UTC.*/, "")
                      ) : (
                        <span title={dateTime(r.registeredAt, event.utcOffsetMinutes)}>registered {ago(r.registeredAt, now)}</span>
                      )}
                    </td>
                    {showStatus && (
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nobody matches. Try a shorter search or another filter.</p>
        )}
      </Section>

      <EnvioCta context="The rankings are computed from every on-chain check-in, served by an Envio indexer." />
    </>
  );
}
