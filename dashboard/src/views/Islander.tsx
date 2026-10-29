import { useMemo, useState } from "react";
import { achievementsFor, editionStats, localSeconds, type Achievement, type AchievementGroup } from "../achievements";
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
  solscanAccount,
  solscanTx,
  tzLabel,
  usdc,
  userName,
} from "../format";
import { Avatar, Passport } from "../island";
import { Link, Loading, Section, Stat, StatusBadge } from "../ui";

const GROUPS: AchievementGroup[] = ["Showing up", "Consistency", "Timing"];

function Achievements({ list }: { list: Achievement[] }) {
  const earned = list.filter((a) => a.earned).length;
  return (
    <Section
      title="Achievements"
      subtitle={`${earned} of ${list.length} unlocked, all worked out from on-chain data. Locked ones show what's left.`}
      id="achievements"
    >
      {GROUPS.map((group) => {
        // Unlocked first, then the rest in their usual order.
        const items = list.filter((a) => a.group === group).sort((a, b) => Number(b.earned) - Number(a.earned));
        return (
          <div key={group} className="achievement-group">
            <h3>
              {group} <span>{items.filter((a) => a.earned).length} / {items.length}</span>
            </h3>
            <AchievementList items={items} />
          </div>
        );
      })}
    </Section>
  );
}

function AchievementList({ items }: { items: Achievement[] }) {
  return (
      <ul className="achievements">
        {items.map((a) => (
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
  );
}

/** The registration's life on-chain, oldest first. */
function Timeline({ r, arrival }: { r: ProfileRegistration; arrival?: number }) {
  const tz = r.event.utcOffsetMinutes;
  const steps: { label: string; at?: number; note?: string }[] = [
    { label: "Registered", at: r.registeredAt, note: `sign-up #${r.registrationNumber} of ${num(r.event.registrationCount)}` },
  ];
  // Timed steps after the registration and its review, in the order they happened.
  const timed: { label: string; at: number; note?: string }[] = [];
  if (r.status === "Pending") steps.push({ label: "Waiting for approval" });
  else if (r.status === "Rejected") steps.push({ label: "Rejected by the organizers", at: r.reviewedAt ?? undefined });
  else if (r.status === "Cancelled") steps.push({ label: "Cancelled" });
  else if (r.event.requiresApproval) steps.push({ label: "Approved", at: r.reviewedAt ?? undefined });
  else steps.push({ label: "Confirmed", note: "no approval step at this edition" });
  if (r.arrivedAt) timed.push({ label: "Checked in at the event desk", at: r.arrivedAt });
  if (r.firstCheckInAt) timed.push({ label: "First daily check-in", at: r.firstCheckInAt, note: arrival ? `islander #${arrival} to arrive` : undefined });
  const last = r.checkIns[r.checkIns.length - 1];
  if (last && r.checkIns.length > 1) timed.push({ label: `Latest check-in, day ${r.checkIns.length}`, at: last.timestamp });
  steps.push(...timed.sort((a, b) => a.at - b.at));
  return (
    <ol className="timeline">
      {steps.map((s) => (
        <li key={s.label}>
          <b>{s.label}</b>
          <span className="muted">{[s.at && dateTime(s.at, tz), s.note].filter(Boolean).join(" · ")}</span>
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
  const secondsIntoDay = r.checkIns.map((c) => localSeconds(c.timestamp, tz)).sort((a, b) => a - b);
  const median = secondsIntoDay[Math.floor(secondsIntoDay.length / 2)];
  const usualTime = median === undefined ? undefined : clockTime(median);
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
          <Timeline r={r} arrival={arrival} />
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
                  of {num(others.length)} · <Link to={{ view: "leaderboard", edition }}>see the board</Link>
                </>
              }
            />
            <Stat label="Longest streak" value={plural(s.streak.best, "day")} sub="island days in a row" />
            <Stat label="Usual check-in" value={usualTime ?? "–"} sub={`median, local time (${tzLabel(tz)})`} />
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

/** Weekly passes were only sold at V4, so this shows up only for the islanders who bought one. */
function Passes({ passes }: { passes: Profile["passes"] }) {
  const total = passes.reduce((sum, p) => sum + Number(p.price), 0);
  const editions = [...new Set(passes.map((p) => editionName(p.event.name)))].join(" and ");
  return (
    <Section title="Weekly passes" subtitle={`${plural(passes.length, "pass", "passes")} bought for ${editions}, ${usdc(total)} in USDC.`}>
      <ul className="sessions">
        {passes.map((p) => (
          <li key={p.id}>
            <span>
              {p.tier.name} <small className="muted">{p.tier.dates}</small>
            </span>
            <small className="muted">
              {usdc(p.price)} on {shortDate(p.timestamp, p.event.utcOffsetMinutes)} ·{" "}
              <a href={solscanTx(p.txSignature)} target="_blank" rel="noreferrer">
                tx ↗
              </a>{" "}
              ·{" "}
              <a href={solscanAccount(p.asset)} target="_blank" rel="noreferrer">
                pass ↗
              </a>
            </small>
          </li>
        ))}
      </ul>
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
  const achievements = useMemo(() => (user ? achievementsFor(editions, now) : []), [user, editions, Math.floor(now / 60)]);

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
          <button className={isMine ? "ghost-button" : "primary-button"} onClick={() => onClaim(!isMine)}>
            {isMine ? "Not my wallet" : "This is me"}
          </button>
          <span className="muted claim-hint">
            {isMine ? "“My island” opens this profile on this device." : "Remember it on this device for “My island”. Nothing to sign."}
          </span>
        </div>
      </section>

      <section className="stats stats-3">
        <Stat label="Editions" value={num(attended.length)} sub={`of ${num(editions.length)} registered`} />
        <Stat label="Days on the island" value={num(totalDays)} sub="all editions" />
        <Stat label="Achievements" value={`${earned.length} / ${achievements.length}`} sub={<a href="#achievements">see all</a>} accent />
      </section>

      <Achievements list={achievements} />

      {editions.map((r) => (
        <EditionStory key={r.id} user={user} r={r} />
      ))}

      {sessions.length > 0 && <SessionSignups regs={sessions} />}

      {user.passes.length > 0 && <Passes passes={user.passes} />}

      <EnvioCta context="Every stamp, rank and achievement on this profile is read from Solana by an Envio indexer." />
    </>
  );
}
