import { useState } from "react";
import type { EventTime, UserRef } from "./api";
import { eventDays, localDay, num, shortDay, solscanTx, userName, weekday } from "./format";

/** A gradient derived from the wallet, kept to island colours (lagoon to palm, with the odd sunset). */
function walletGradient(address: string) {
  let h = 2166136261;
  for (let i = 0; i < address.length; i++) h = Math.imul(h ^ address.charCodeAt(i), 16777619);
  const r = Math.abs(h);
  const sunset = r % 7 === 0;
  const hue = sunset ? 20 + (r % 25) : 140 + (r % 60);
  const light = 52 + ((r >> 5) % 18);
  return `linear-gradient(135deg, hsl(${hue} 62% ${light}%), hsl(${hue + 25} 70% ${light - 26}%))`;
}

export function Avatar({ user, size = 32 }: { user: UserRef; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (user.avatarUrl && !broken) {
    return <img className="avatar" src={user.avatarUrl} width={size} height={size} alt="" onError={() => setBroken(true)} />;
  }
  return <span className="avatar" aria-hidden style={{ width: size, height: size, background: walletGradient(user.id) }} />;
}

/** The event's calendar, one tile per event day, shaded by how many islanders checked in. */
export function IslandCalendar({
  event,
  days,
  now,
}: {
  event: EventTime;
  days: { day: string; checkIns: number; firstTimers: number }[];
  now: number;
}) {
  const counts = new Map(days.map((d) => [d.day, d]));
  const all = eventDays(event);
  const first = all[0];
  const today = localDay(now, event.utcOffsetMinutes);
  const max = Math.max(1, ...days.map((d) => d.checkIns));
  // Pad the first row so columns line up with weekdays (Mon first).
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const [hover, setHover] = useState<string>();
  const h = hover ? counts.get(hover) : undefined;

  return (
    <div className="calendar">
      <div className="calendar-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="calendar-weekday">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {all.map((day) => {
          const c = counts.get(day)?.checkIns ?? 0;
          const future = day > today;
          const level = c ? 0.18 + 0.82 * (c / max) : 0;
          const weekend = ["Sat", "Sun"].includes(weekday(day));
          const cls = ["tile", future && "tile-future", day === today && "tile-today", c === 0 && !future && "tile-empty", level > 0.55 && "tile-strong"]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={day}
              className={cls}
              style={c ? { background: `color-mix(in oklab, var(--accent) ${Math.round(level * 100)}%, var(--tile-base))` } : undefined}
              onMouseEnter={() => setHover(day)}
              onMouseLeave={() => setHover(undefined)}
              aria-label={`${shortDay(day)}: ${c} check-ins`}
            >
              <span className="tile-date">{Number(day.slice(8))}</span>
              <span className="tile-count">{c ? num(c) : future ? "" : weekend ? "off" : "–"}</span>
            </div>
          );
        })}
      </div>
      <div className="calendar-foot">
        <span className="muted">
          {hover ? (
            <>
              <b>
                {weekday(hover)} {shortDay(hover)}
              </b>{" "}
              · {h ? `${num(h.checkIns)} check-ins, ${num(h.firstTimers)} first-timers` : hover > today ? "coming up" : "no check-ins"}
            </>
          ) : (
            "Tap or hover a day for details"
          )}
        </span>
        <span className="scale" aria-hidden>
          fewer
          {[0.18, 0.45, 0.72, 1].map((l) => (
            <i key={l} style={{ background: `color-mix(in oklab, var(--accent) ${l * 100}%, var(--tile-base))` }} />
          ))}
          more
        </span>
      </div>
    </div>
  );
}

/** A dot per island day (a day anyone checked in), filled where this islander showed up. */
export function DayDots({ islandDays, attended }: { islandDays: string[]; attended: Set<string> }) {
  return (
    <span className="dots" aria-label={`${attended.size} of ${islandDays.length} island days`}>
      {islandDays.map((d) => (
        <i key={d} className={attended.has(d) ? "on" : ""} title={shortDay(d)} />
      ))}
    </span>
  );
}

export function Passport({
  user,
  event,
  status,
  checkIns,
}: {
  user: UserRef;
  event: { name: string; location: string; days: { day: string }[] };
  status: string;
  checkIns: { day: string; txSignature: string }[];
}) {
  const stamped = new Map(checkIns.map((c) => [c.day, c.txSignature]));
  return (
    <article className="passport">
      <header>
        <span className="passport-kicker">Island passport</span>
        <span className={`badge status-${status.toLowerCase()}`}>{status}</span>
      </header>
      <div className="passport-holder">
        <Avatar user={user} size={52} />
        <div>
          <strong>{userName(user)}</strong>
          <span>
            {event.name} · {event.location}
          </span>
        </div>
      </div>
      <div className="stamps">
        {event.days.map(({ day }, i) => {
          const tx = stamped.get(day);
          const label = shortDay(day).toUpperCase();
          return tx ? (
            <a
              key={day}
              className="stamp on"
              href={solscanTx(tx)}
              target="_blank"
              rel="noreferrer"
              style={{ rotate: `${((i * 37) % 17) - 8}deg` }}
              title={`Checked in ${label}, view transaction`}
            >
              <b>✓</b>
              {label}
            </a>
          ) : (
            <span key={day} className="stamp" title={`${label}: not checked in`}>
              {label}
            </span>
          );
        })}
      </div>
      <footer>
        {event.days.length ? (
          <>
            <b>{stamped.size}</b> of {event.days.length} island days stamped. Each stamp links to its check-in transaction.
          </>
        ) : (
          "Stamps appear here once the edition's first check-ins land."
        )}
      </footer>
    </article>
  );
}
