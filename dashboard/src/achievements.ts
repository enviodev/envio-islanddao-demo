import type { ProfileRegistration } from "./api";
import { editionName, shortDate, weekday } from "./format";

export type AchievementGroup = "Showing up" | "Consistency" | "Timing";

export type Achievement = {
  id: string;
  group: AchievementGroup;
  icon: string;
  title: string;
  /** How to earn it, in one line. */
  rule: string;
  earned: boolean;
  /** When earned: where and when. When not: how close. */
  detail?: string;
  progress?: { value: number; target: number };
};

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dayDate = (day: string) => shortDate(Date.parse(`${day}T12:00:00Z`) / 1000);

/** Check-ins before this local time count as early. */
export const EARLY_HOUR = 10;
export const EARLY_DAYS = 3;
export const FIRST_WAVE = 50;

/** Seconds since local midnight. */
export const localSeconds = (t: number, utcOffsetMinutes: number) => (((t + utcOffsetMinutes * 60) % 86_400) + 86_400) % 86_400;

/**
 * Longest run of consecutive island days in `attended`. "Island days" are the
 * days anyone checked in, so weekends and days off don't break a streak.
 */
export function longestStreak(islandDays: string[], attended: Set<string>) {
  let best = 0;
  let run = 0;
  let reachedFiveOn: string | undefined;
  for (const d of islandDays) {
    run = attended.has(d) ? run + 1 : 0;
    best = Math.max(best, run);
    if (run === 5 && !reachedFiveOn) reachedFiveOn = d;
  }
  return { best, reachedFiveOn };
}

/** One edition, from this islander's point of view. */
export function editionStats(r: ProfileRegistration) {
  const islandDays = r.event.days.map((d) => d.day);
  const attended = new Set(r.checkIns.map((c) => c.day));
  // Most days first; ties go to whoever checked in first, as on the leaderboard.
  const rank = r.checkInCount
    ? r.event.attendees.filter(
        (a) => a.checkInCount > r.checkInCount || (a.checkInCount === r.checkInCount && a.firstCheckInAt < r.firstCheckInAt!),
      ).length + 1
    : undefined;
  const streak = longestStreak(islandDays, attended);
  const fullWeek = [...attended].sort().find((d) => weekday(d) === "Mon" && [1, 2, 3, 4].every((n) => attended.has(addDays(d, n))));
  const firstIn = r.event.days.filter((d) => d.firstIn_id === r.user_id).map((d) => d.day);
  const early = r.checkIns.filter((c) => localSeconds(c.timestamp, r.event.utcOffsetMinutes) < EARLY_HOUR * 3600);
  return { islandDays, attended, rank, streak, fullWeek, firstIn, early };
}

/** Best value across editions, with the edition it came from. */
function best<T>(regs: ProfileRegistration[], score: (r: ProfileRegistration) => T | undefined, better: (a: T, b: T) => boolean) {
  let top: { value: T; r: ProfileRegistration } | undefined;
  for (const r of regs) {
    const v = score(r);
    if (v !== undefined && (!top || better(v, top.value))) top = { value: v, r };
  }
  return top;
}

/** Achievements across every edition this islander registered for (sessions excluded). */
export function achievementsFor(editions: ProfileRegistration[], now: number): Achievement[] {
  const attendedRegs = editions.filter((r) => r.checkInCount > 0);
  const stats = new Map(editions.map((r) => [r.id, editionStats(r)]));
  const s = (r: ProfileRegistration) => stats.get(r.id)!;
  const at = (r: ProfileRegistration) => editionName(r.event.name);
  const on = (t: number, r: ProfileRegistration) => shortDate(t, r.event.utcOffsetMinutes);

  const firstCheckIn = best(attendedRegs, (r) => r.firstCheckInAt ?? undefined, (a, b) => a < b);
  const dayOne = attendedRegs.find((r) => s(r).attended.has(s(r).islandDays[0]));
  const days = best(editions, (r) => r.checkInCount, (a, b) => a > b);
  const finished = attendedRegs.filter((r) => now > r.event.endTime);
  const perfect = finished.find((r) => r.checkInCount >= s(r).islandDays.length);
  const closest = best(editions, (r) => (s(r).islandDays.length ? r.checkInCount / s(r).islandDays.length : undefined), (a, b) => a > b);
  const streak = best(editions, (r) => s(r).streak.best, (a, b) => a > b);
  const week = attendedRegs.find((r) => s(r).fullWeek);
  const rank = best(attendedRegs, (r) => s(r).rank, (a, b) => a < b);
  const early = editions.find((r) => r.registeredAt <= r.event.startTime - 30 * 86_400);
  const wave = best(editions, (r) => r.registrationNumber, (a, b) => a < b);
  const firstIn = best(attendedRegs, (r) => s(r).firstIn.length || undefined, (a, b) => a > b);
  const riser = best(attendedRegs, (r) => s(r).early.length, (a, b) => a > b);

  return [
    {
      id: "landed",
      group: "Showing up",
      icon: "🌴",
      title: "Landed",
      rule: "Check in at an IslandDAO edition for the first time.",
      earned: !!firstCheckIn,
      detail: firstCheckIn && `${at(firstCheckIn.r)}, ${on(firstCheckIn.value, firstCheckIn.r)}`,
    },
    {
      id: "day-one",
      group: "Showing up",
      icon: "🌅",
      title: "Day one",
      rule: "Check in on the first island day of an edition.",
      earned: !!dayOne,
      detail: dayOne && `${at(dayOne)}, ${dayDate(s(dayOne).islandDays[0])}`,
    },
    {
      id: "regular",
      group: "Showing up",
      icon: "🏝️",
      title: "Regular",
      rule: "Check in on 10 days at one edition.",
      earned: (days?.value ?? 0) >= 10,
      detail: days && days.value > 0 ? `${days.value} days at ${at(days.r)}` : undefined,
      progress: { value: Math.min(10, days?.value ?? 0), target: 10 },
    },
    {
      id: "perfect",
      group: "Showing up",
      icon: "💯",
      title: "Never missed a day",
      rule: "Check in on every island day of an edition, start to finish.",
      earned: !!perfect,
      detail: perfect
        ? at(perfect)
        : closest && closest.value > 0
          ? `${closest.r.checkInCount} of ${s(closest.r).islandDays.length} at ${at(closest.r)}${now <= closest.r.event.endTime ? " so far" : ""}`
          : undefined,
    },
    {
      id: "streak",
      group: "Consistency",
      icon: "🔥",
      title: "On a roll",
      rule: "Check in on 5 island days in a row.",
      earned: (streak?.value ?? 0) >= 5,
      detail: (streak?.value ?? 0) >= 5 ? `${streak!.value} in a row at ${at(streak!.r)}` : `Best run: ${streak?.value ?? 0}`,
      progress: { value: Math.min(5, streak?.value ?? 0), target: 5 },
    },
    {
      id: "full-week",
      group: "Consistency",
      icon: "🗓️",
      title: "Full week",
      rule: "Check in Monday through Friday of the same week.",
      earned: !!week,
      detail: week && `Week of ${dayDate(s(week).fullWeek!)}, ${at(week)}`,
    },
    {
      id: "top-ten",
      group: "Consistency",
      icon: "🏆",
      title: "Top 10",
      rule: "Rank in the top 10 by days checked in at an edition.",
      earned: (rank?.value ?? Infinity) <= 10,
      detail: rank ? `#${rank.value} at ${at(rank.r)}` : undefined,
    },
    {
      id: "returning",
      group: "Consistency",
      icon: "🔁",
      title: "Returning islander",
      rule: "Check in at two or more editions.",
      earned: attendedRegs.length >= 2,
      detail: attendedRegs.length ? attendedRegs.map(at).join(" and ") : undefined,
      progress: { value: Math.min(2, attendedRegs.length), target: 2 },
    },
    {
      id: "early-bird",
      group: "Timing",
      icon: "🐦",
      title: "Early bird",
      rule: "Register at least 30 days before an edition starts.",
      earned: !!early,
      detail: early && `${at(early)}, registered ${on(early.registeredAt, early)}`,
    },
    {
      id: "first-wave",
      group: "Timing",
      icon: "🌊",
      title: "First wave",
      rule: `Be one of the first ${FIRST_WAVE} to register for an edition.`,
      earned: (wave?.value ?? Infinity) <= FIRST_WAVE,
      detail: wave && `Sign-up #${wave.value} at ${at(wave.r)}`,
    },
    {
      id: "first-in",
      group: "Timing",
      icon: "🚪",
      title: "First one in",
      rule: "Be the first islander to check in on an island day.",
      earned: !!firstIn,
      detail: firstIn && `${firstIn.value === 1 ? "Once" : `${firstIn.value} times`} at ${at(firstIn.r)}`,
    },
    {
      id: "early-riser",
      group: "Timing",
      icon: "☀️",
      title: "Early riser",
      rule: `Check in before ${EARLY_HOUR}:00 local time on ${EARLY_DAYS} days.`,
      earned: (riser?.value ?? 0) >= EARLY_DAYS,
      detail: riser && riser.value > 0 ? `${riser.value} early ${riser.value === 1 ? "start" : "starts"} at ${at(riser.r)}` : undefined,
      progress: { value: Math.min(EARLY_DAYS, riser?.value ?? 0), target: EARLY_DAYS },
    },
  ];
}
