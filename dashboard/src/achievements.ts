import type { Profile, ProfileRegistration } from "./api";
import { editionName, shortDate, weekday } from "./format";

export type Achievement = {
  id: string;
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

/**
 * One edition, from this islander's point of view. "Island days" are the days
 * anyone checked in, so weekends and days off don't break a streak.
 */
export function editionStats(r: ProfileRegistration) {
  const islandDays = r.event.days.map((d) => d.day);
  const attended = new Set(r.checkIns.map((c) => c.day));
  const rank = r.checkInCount ? r.event.attendees.filter((a) => a.checkInCount > r.checkInCount).length + 1 : undefined;

  let streak = 0;
  let run = 0;
  let streakReachedOn: string | undefined;
  for (const d of islandDays) {
    run = attended.has(d) ? run + 1 : 0;
    if (run > streak) streak = run;
    if (run === 5 && !streakReachedOn) streakReachedOn = d;
  }

  const fullWeek = [...attended].sort().find((d) => weekday(d) === "Mon" && [1, 2, 3, 4].every((n) => attended.has(addDays(d, n))));

  return { islandDays, attended, rank, streak, streakReachedOn, fullWeek };
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

export function achievementsFor(user: Profile, now: number): Achievement[] {
  const regs = user.registrations;
  const attendedRegs = regs.filter((r) => r.checkInCount > 0);
  const stats = new Map(regs.map((r) => [r.id, editionStats(r)]));
  const s = (r: ProfileRegistration) => stats.get(r.id)!;
  const at = (r: ProfileRegistration) => editionName(r.event.name);
  const on = (t: number, r: ProfileRegistration) => shortDate(t, r.event.utcOffsetMinutes);

  const firstCheckIn = best(attendedRegs, (r) => r.firstCheckInAt ?? undefined, (a, b) => a < b);
  const dayOne = attendedRegs.find((r) => s(r).attended.has(s(r).islandDays[0]));
  const streak = best(regs, (r) => s(r).streak, (a, b) => a > b);
  const week = attendedRegs.find((r) => s(r).fullWeek);
  const days = best(regs, (r) => r.checkInCount, (a, b) => a > b);
  const rank = best(attendedRegs, (r) => s(r).rank, (a, b) => a < b);
  const finished = attendedRegs.filter((r) => now > r.event.endTime);
  const perfect = finished.find((r) => r.checkInCount >= s(r).islandDays.length);
  const closest = best(regs, (r) => (s(r).islandDays.length ? r.checkInCount / s(r).islandDays.length : undefined), (a, b) => a > b);
  const early = regs.find((r) => r.registeredAt <= r.event.startTime - 30 * 86_400);
  const firstPass = user.passes[0];

  return [
    {
      id: "landed",
      icon: "🌴",
      title: "Landed",
      rule: "Check in at an IslandDAO edition for the first time.",
      earned: !!firstCheckIn,
      detail: firstCheckIn && `${at(firstCheckIn.r)}, ${on(firstCheckIn.value, firstCheckIn.r)}`,
    },
    {
      id: "day-one",
      icon: "🌅",
      title: "Day one",
      rule: "Check in on the first island day of an edition.",
      earned: !!dayOne,
      detail: dayOne && `${at(dayOne)}, ${shortDate(Date.parse(`${s(dayOne).islandDays[0]}T12:00:00Z`) / 1000)}`,
    },
    {
      id: "streak",
      icon: "🔥",
      title: "On a roll",
      rule: "Check in on 5 island days in a row.",
      earned: (streak?.value ?? 0) >= 5,
      detail:
        (streak?.value ?? 0) >= 5
          ? `${streak!.value} in a row at ${at(streak!.r)}`
          : `Best run: ${streak?.value ?? 0} ${streak?.value === 1 ? "day" : "days"}`,
      progress: { value: Math.min(5, streak?.value ?? 0), target: 5 },
    },
    {
      id: "full-week",
      icon: "🗓️",
      title: "Full week",
      rule: "Check in Monday through Friday of the same week.",
      earned: !!week,
      detail: week && `Week of ${shortDate(Date.parse(`${s(week).fullWeek}T12:00:00Z`) / 1000)}, ${at(week)}`,
    },
    {
      id: "regular",
      icon: "🏝️",
      title: "Regular",
      rule: "Check in on 10 days at one edition.",
      earned: (days?.value ?? 0) >= 10,
      detail: days && days.value > 0 ? `${days.value} days at ${at(days.r)}` : undefined,
      progress: { value: Math.min(10, days?.value ?? 0), target: 10 },
    },
    {
      id: "top-ten",
      icon: "🏆",
      title: "Top 10",
      rule: "Rank in the top 10 by days checked in at an edition.",
      earned: (rank?.value ?? Infinity) <= 10,
      detail: rank ? `#${rank.value} at ${at(rank.r)}` : undefined,
    },
    {
      id: "perfect",
      icon: "💯",
      title: "Never missed a day",
      rule: "Check in on every island day of an edition, start to finish.",
      earned: !!perfect,
      detail: perfect
        ? at(perfect)
        : closest && closest.value > 0
          ? `${closest.r.checkInCount} of ${s(closest.r).islandDays.length} island days at ${at(closest.r)}${now <= closest.r.event.endTime ? " so far" : ""}`
          : undefined,
    },
    {
      id: "early-bird",
      icon: "🐦",
      title: "Early bird",
      rule: "Register at least 30 days before an edition starts.",
      earned: !!early,
      detail: early && `${at(early)}, registered ${on(early.registeredAt, early)}`,
    },
    {
      id: "returning",
      icon: "🔁",
      title: "Returning islander",
      rule: "Check in at two or more editions.",
      earned: attendedRegs.length >= 2,
      detail: attendedRegs.length ? attendedRegs.map(at).join(" and ") : undefined,
      progress: { value: Math.min(2, attendedRegs.length), target: 2 },
    },
    {
      id: "pass-holder",
      icon: "🎟️",
      title: "Pass holder",
      rule: "Buy a weekly pass on-chain.",
      earned: !!firstPass,
      detail: firstPass && `${firstPass.tier.name}, ${shortDate(firstPass.timestamp, firstPass.event.utcOffsetMinutes)}`,
    },
    {
      id: "verified",
      icon: "✅",
      title: "Verified",
      rule: "Link an X account, attested on-chain by IslandDAO's verifier.",
      earned: !!user.xHandle,
      detail: user.xHandle ? `@${user.xHandle}` : undefined,
    },
    {
      id: "profile",
      icon: "🪪",
      title: "On the record",
      rule: "Create an IslandDAO profile on Solana.",
      earned: !!user.profile,
      detail: user.displayName ?? undefined,
    },
  ];
}
