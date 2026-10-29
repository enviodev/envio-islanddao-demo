import { useMemo, useState } from "react";
import { ISLANDERS_QUERY, usePolling, type IslandersData, type IslanderRow } from "../api";
import { ago, dateTime, num, plural, shortAddress, usdc, userName } from "../format";
import { Loading, Person, Section, StatusBadge } from "../ui";

type Sort = "days" | "arrival" | "registered" | "name";
type Filter = "attended" | "all" | "pending";

const SORTS: { id: Sort; label: string }[] = [
  { id: "days", label: "Most days" },
  { id: "arrival", label: "First to arrive" },
  { id: "registered", label: "Newest sign-ups" },
  { id: "name", label: "Name" },
];

const compare: Record<Sort, (a: IslanderRow, b: IslanderRow) => number> = {
  days: (a, b) => b.checkInCount - a.checkInCount || (a.firstCheckInAt ?? Infinity) - (b.firstCheckInAt ?? Infinity),
  arrival: (a, b) => (a.firstCheckInAt ?? Infinity) - (b.firstCheckInAt ?? Infinity),
  registered: (a, b) => b.registeredAt - a.registeredAt,
  name: (a, b) => userName(a.user).localeCompare(userName(b.user)),
};

export function Islanders({ eventId, now }: { eventId: string; now: number }) {
  const { data, error } = usePolling<IslandersData>(ISLANDERS_QUERY, { event: eventId }, 15_000);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("days");
  const [filter, setFilter] = useState<Filter>("attended");

  const ranks = useMemo(() => {
    // Rank by days, ties sharing a rank, so the number matches the profile page.
    const rows = (data?.Registration ?? []).filter((r) => r.checkInCount > 0);
    return new Map(rows.map((r) => [r.id, rows.filter((o) => o.checkInCount > r.checkInCount).length + 1]));
  }, [data?.Registration]);

  if (error && !data) return <p className="error">Could not reach the indexer: {error}</p>;
  if (!data || !data.Event_by_pk) return <Loading>Gathering the islanders…</Loading>;

  const event = data.Event_by_pk;
  const rows = data.Registration;
  const islandDays = data.EventDay.length;
  const q = query.trim().toLowerCase();
  const counts = {
    attended: rows.filter((r) => r.checkInCount > 0).length,
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

  const sellsPasses = rows.some((r) => r.user.passes.length > 0);
  const filters: { id: Filter; label: string }[] = [
    { id: "attended", label: "Checked in" },
    { id: "all", label: "All registrations" },
    ...(event.requiresApproval ? [{ id: "pending" as const, label: "Waiting for approval" }] : []),
  ];

  return (
    <>
      <section className="page-head">
        <div className="kicker">Islanders</div>
        <h1>Who's on the island</h1>
        <p className="muted">
          Everyone registered for {event.name}, straight from Solana. Rank is by days checked in; open anyone to see their passport,
          achievements and purchases.
        </p>
      </section>

      <Section
        title={`${plural(shown.length, "islander")}${q ? ` matching “${query.trim()}”` : ""}`}
        subtitle={`${plural(islandDays, "island day")} so far. An island day is a day anyone checked in.`}
      >
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
                  <th>Status</th>
                  {sellsPasses && <th className="num">Passes</th>}
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
                        <span title={dateTime(r.firstCheckInAt, event.utcOffsetMinutes)}>{dateTime(r.firstCheckInAt, event.utcOffsetMinutes).replace(/ UTC.*/, "")}</span>
                      ) : (
                        <span title={`Registered ${dateTime(r.registeredAt, event.utcOffsetMinutes)}`}>registered {ago(r.registeredAt, now)}</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    {sellsPasses && (
                      <td className="num">
                        {r.user.passes.length ? (
                          <span title={`${usdc(r.user.passes.reduce((sum, p) => sum + Number(p.price), 0))} spent on passes`}>{r.user.passes.length}</span>
                        ) : (
                          <span className="muted">–</span>
                        )}
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
    </>
  );
}
