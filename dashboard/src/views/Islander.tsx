import { useMemo, useState } from "react";
import { achievementsFor, editionStats, type Achievement } from "../achievements";
import { PROFILE_QUERY, usePolling, type Profile, type ProfileData, type ProfileRegistration } from "../api";
import { EnvioCta } from "../brand";
import {
  clockTime,
  dateTime,
  editionName,
  num,
  plural,
  shortAddress,
  shortDate,
  shortDay,
  solscanAccount,
  solscanTx,
  tzLabel,
  usdc,
  userName,
} from "../format";
import { Avatar, Passport } from "../island";
import { Link, Loading, Section, Stat, StatusBadge } from "../ui";

function Achievements({ list }: { list: Achievement[] }) {
  const earned = list.filter((a) => a.earned).length;
  return (
    <Section
      title="Achievements"
      subtitle={`${earned} of ${list.length} unlocked. Every one is worked out from on-chain data; locked ones show what's left.`}
      id="achievements"
    >
      <ul className="achievements">
        {list.map((a) => (
          <li key={a.id} className={a.earned ? "achievement earned" : "achievement"}>
            <span className="achievement-icon" aria-hidden>
              {a.icon}
            </span>
            <span className="achievement-body">
              <strong>
                {a.title}
                <span className="sr-only">{a.earned ? " (unlocked)" : " (locked)"}</span>
              </strong>
              <span className="achievement-rule">{a.rule}</span>
              {a.detail && <span className="achievement-detail">{a.detail}</span>}
              {!a.earned && a.progress && (
                <span className="achievement-progress" aria-label={`${a.progress.value} of ${a.progress.target}`}>
                  <i style={{ width: `${(a.progress.value / a.progress.target) * 100}%` }} />
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The registration's life on-chain, oldest first. */
function Timeline({ r }: { r: ProfileRegistration }) {
  const tz = r.event.utcOffsetMinutes;
  const steps: { label: string; at?: number; note?: string }[] = [{ label: "Registered", at: r.registeredAt }];
  // Timed steps after the registration and its review, in the order they happened.
  const timed: { label: string; at: number }[] = [];
  if (r.status === "Pending") steps.push({ label: "Waiting for approval" });
  else if (r.status === "Rejected") steps.push({ label: "Rejected by the organizers", at: r.reviewedAt ?? undefined });
  else if (r.status === "Cancelled") steps.push({ label: "Cancelled" });
  else if (r.event.requiresApproval) steps.push({ label: "Approved", at: r.reviewedAt ?? undefined });
  else steps.push({ label: "Confirmed", note: "no approval step at this edition" });
  if (r.arrivedAt) timed.push({ label: "Checked in at the event desk", at: r.arrivedAt });
  if (r.firstCheckInAt) timed.push({ label: "First daily check-in", at: r.firstCheckInAt });
  const last = r.checkIns[r.checkIns.length - 1];
  if (last && r.checkIns.length > 1) timed.push({ label: `Latest check-in, day ${r.checkIns.length}`, at: last.timestamp });
  steps.push(...timed.sort((a, b) => a.at - b.at));
  return (
    <ol className="timeline">
      {steps.map((s) => (
        <li key={s.label}>
          <b>{s.label}</b>
          <span className="muted">{s.at ? dateTime(s.at, tz) : s.note}</span>
        </li>
      ))}
    </ol>
  );
}

function EditionStory({ user, r }: { user: Profile; r: ProfileRegistration }) {
  const s = editionStats(r);
  const tz = r.event.utcOffsetMinutes;
  const others = r.event.attendees;
  const arrival = r.firstCheckInAt === null ? undefined : others.filter((a) => a.firstCheckInAt < r.firstCheckInAt!).length + 1;
  // Median time of day, local to the event.
  const secondsIntoDay = r.checkIns.map((c) => (((c.timestamp + tz * 60) % 86_400) + 86_400) % 86_400).sort((a, b) => a - b);
  const median = secondsIntoDay[Math.floor(secondsIntoDay.length / 2)];
  const usualTime = median === undefined ? undefined : clockTime(median);
  const busiest = r.event.days.filter((d) => s.attended.has(d.day)).sort((a, b) => b.checkIns - a.checkIns)[0];
  const average = r.event.checkInCount / Math.max(1, r.event.uniqueAttendeeCount);
  const topShare = s.rank && others.length ? Math.max(1, Math.round((s.rank / others.length) * 100)) : undefined;
  const edition = r.event.name.match(/\bV\d+\b/i)?.[0].toLowerCase();

  return (
    <Section
      title={r.event.name}
      subtitle={`${r.event.location} · times in ${tzLabel(tz)}`}
      aside={<StatusBadge status={r.status} />}
    >
      <div className="story">
        <div className="story-side">
          <Passport user={user} event={r.event} status={r.status} checkIns={r.checkIns} />
          <Timeline r={r} />
        </div>
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
              sub={
                <>
                  of {num(others.length)} islanders{topShare !== undefined && topShare <= 50 ? ` · top ${topShare}%` : ""} ·{" "}
                  <Link to={{ view: "islanders", edition }}>see all</Link>
                </>
              }
            />
            <Stat label="Islander number" value={arrival ? `#${arrival}` : "–"} sub={`by first check-in, ${dateTime(r.firstCheckInAt!, tz)}`} />
            <Stat label="Longest streak" value={plural(s.streak, "day")} sub="in a row, counting island days" />
            <Stat label="Usual check-in" value={usualTime ?? "–"} sub={`median time, local (${tzLabel(tz)})`} />
            <Stat
              label="Vs. the average islander"
              value={`${r.checkInCount >= average ? "+" : ""}${(r.checkInCount - average).toFixed(1)}`}
              sub={`days (average is ${average.toFixed(1)})`}
            />
            {busiest && (
              <p className="story-note">
                Busiest day: <b>{shortDay(busiest.day)}</b>, with {num(busiest.checkIns)} islanders checking in.
              </p>
            )}
          </div>
        ) : (
          <div className="story-stats story-empty">
            <p>
              {r.status === "Confirmed"
                ? r.arrivedAt
                  ? "Checked in at the event desk, but no daily check-ins yet. Stamps land here as soon as there are."
                  : "Confirmed. The first daily check-in at the venue adds the first stamp within seconds."
                : r.status === "Pending"
                  ? "Registered and waiting for the organizers to approve. The passport fills up after the first check-in."
                  : `This registration was ${r.status.toLowerCase()}.`}
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}

function Purchases({ user, revenue }: { user: Profile; revenue: ProfileData["revenue"] }) {
  const byEvent = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of revenue) totals.set(p.event_id, (totals.get(p.event_id) ?? 0) + Number(p.price));
    return totals;
  }, [revenue]);
  const editions = [...new Set(user.passes.map((p) => p.event.id))];
  return (
    <Section
      title="Passes & spending"
      subtitle={`${plural(user.passes.length, "weekly pass", "weekly passes")}, ${usdc(user.passSpend)} in USDC. Each pass is a Metaplex Core asset in this wallet.`}
    >
      <div className="stats compact">
        {editions.map((id) => {
          const mine = user.passes.filter((p) => p.event.id === id).reduce((sum, p) => sum + Number(p.price), 0);
          const total = byEvent.get(id) ?? 0;
          const name = user.passes.find((p) => p.event.id === id)!.event.name;
          return (
            <Stat
              key={id}
              label={`Spent at ${editionName(name)}`}
              value={usdc(mine)}
              sub={total ? `${Math.round((mine / total) * 100)}% of the edition's ${usdc(total)} pass revenue` : undefined}
            />
          );
        })}
      </div>
      <table>
        <thead>
          <tr>
            <th>Pass</th>
            <th>Bought</th>
            <th className="num">Paid</th>
            <th className="num">On-chain</th>
          </tr>
        </thead>
        <tbody>
          {user.passes.map((p) => (
            <tr key={p.id}>
              <td>
                {p.tier.name} <small className="muted">{p.tier.dates}</small>
              </td>
              <td className="muted">{shortDate(p.timestamp, p.event.utcOffsetMinutes)}</td>
              <td className="num">{usdc(p.price)}</td>
              <td className="num">
                <a href={solscanTx(p.txSignature)} target="_blank" rel="noreferrer">
                  tx ↗
                </a>{" "}
                ·{" "}
                <a href={solscanAccount(p.asset)} target="_blank" rel="noreferrer">
                  asset ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function SessionSignups({ regs }: { regs: ProfileRegistration[] }) {
  return (
    <Section title="Session sign-ups" subtitle="Talks, socials and 1:1s registered for on-chain, separately from the editions.">
      <ul className="sessions">
        {regs.map((r) => (
          <li key={r.id}>
            <span className="session-name">
              {r.event.name} <StatusBadge status={r.status} />
            </span>
            <small className="muted">
              {r.event.categoryLabel} at {r.event.parent ? editionName(r.event.parent.name) : "IslandDAO"} · {dateTime(r.event.startTime, r.event.utcOffsetMinutes)}
            </small>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      title="Copy the wallet address"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function Islander({
  wallet,
  now,
  isMine,
  onClaim,
}: {
  wallet: string;
  now: number;
  isMine: boolean;
  onClaim: (mine: boolean) => void;
}) {
  const { data, error } = usePolling<ProfileData>(PROFILE_QUERY, { id: wallet }, 10_000);
  const user = data?.User_by_pk;
  // Editions get a passport each; registrations for single sessions are listed on their own.
  const editions = useMemo(() => user?.registrations.filter((r) => !r.event.parent) ?? [], [user]);
  const sessions = useMemo(() => user?.registrations.filter((r) => r.event.parent) ?? [], [user]);
  const achievements = useMemo(
    () => (user ? achievementsFor({ ...user, registrations: editions }, now) : []),
    [user, editions, Math.floor(now / 60)],
  );

  if (error && !data) return <p className="error">Could not reach the indexer: {error}</p>;
  if (!data) return <Loading>Looking up {shortAddress(wallet)}…</Loading>;
  if (!user || user.registrations.length === 0) {
    return (
      <Section title="No islander here yet" subtitle={`There are no IslandDAO registrations for ${shortAddress(wallet)}.`}>
        <p className="muted">
          Double-check that this is the wallet used on islanddao.org, or <Link to={{ view: "me" }}>search by name</Link>.
        </p>
      </Section>
    );
  }

  const attended = editions.filter((r) => r.checkInCount > 0);
  const totalDays = attended.reduce((sum, r) => sum + r.checkInCount, 0);
  const earned = achievements.filter((a) => a.earned);

  return (
    <>
      <section className="profile-card">
        <div className="profile-main">
          <Avatar user={user} size={96} />
          <div className="profile-text">
            <div className="kicker">{isMine ? "Your island" : "Islander"}</div>
            <h1>{userName(user)}</h1>
            <p className="profile-links">
              {user.xHandle && (
                <a href={`https://x.com/${user.xHandle}`} target="_blank" rel="noreferrer" title="Attested on-chain by IslandDAO's verifier">
                  @{user.xHandle} <span className="verified">✓ verified</span>
                </a>
              )}
              {user.website && (
                <a href={user.website.startsWith("http") ? user.website : `https://${user.website}`} target="_blank" rel="noreferrer">
                  {user.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              )}
              <span className="wallet">
                <a href={solscanAccount(user.id)} target="_blank" rel="noreferrer" title={user.id}>
                  {shortAddress(user.id)}
                </a>
                <CopyButton text={user.id} />
              </span>
            </p>
            {user.bio && <p className="profile-bio">{user.bio}</p>}
            <p className="muted profile-since">On Solana with IslandDAO since {shortDate(user.firstSeenAt)}</p>
          </div>
        </div>
        <div className="profile-side">
          {earned.length > 0 && (
            <a className="badge-strip" href="#achievements" title="Jump to achievements">
              {earned.map((a) => (
                <span key={a.id} title={a.title}>
                  {a.icon}
                </span>
              ))}
            </a>
          )}
          <button className={isMine ? "ghost-button" : "primary-button"} onClick={() => onClaim(!isMine)}>
            {isMine ? "Not my wallet" : "This is me"}
          </button>
          <span className="muted claim-hint">
            {isMine ? "“My island” opens this profile on this device." : "Remember it on this device for “My island”. Nothing to sign."}
          </span>
        </div>
      </section>

      <section className="stats">
        <Stat label="Editions" value={num(attended.length)} sub={`checked in, of ${num(editions.length)} registered`} />
        <Stat label="Days on the island" value={num(totalDays)} sub="across every edition" />
        <Stat label="Achievements" value={`${earned.length} / ${achievements.length}`} sub="unlocked" accent />
        <Stat label="Spent on passes" value={usdc(user.passSpend)} sub={user.passCount ? plural(user.passCount, "pass", "passes") : "no passes bought"} />
      </section>

      <Achievements list={achievements} />

      {editions.map((r) => (
        <EditionStory key={r.id} user={user} r={r} />
      ))}

      {sessions.length > 0 && <SessionSignups regs={sessions} />}

      {user.passes.length > 0 && <Purchases user={user} revenue={data.revenue} />}

      <EnvioCta title="This profile is an API call away">
        Every stamp, rank and achievement here is read from Solana by an Envio HyperIndex indexer and served as GraphQL. Get a free
        API token and you can index any program the same way.
      </EnvioCta>
    </>
  );
}
