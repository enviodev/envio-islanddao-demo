import { useEffect, useRef, useState } from "react";

/** The islanddao indexer's GraphQL API on Envio Cloud. Each deployment has its own URL. */
export const GRAPHQL_URL = "https://indexer.dev.hyperindex.xyz/3639903/v1/graphql";

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(body.errors.map((e: { message: string }) => e.message).join("; "));
  return body.data as T;
}

/** Re-runs a query on an interval; keeps the last good data while a refresh is in flight. */
export function usePolling<T>(query: string, variables: Record<string, unknown>, intervalMs: number, enabled = true) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [updatedAt, setUpdatedAt] = useState<number>();
  const key = JSON.stringify(variables);
  const latest = useRef(key);
  latest.current = key;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setData(undefined);
    const run = () =>
      gql<T>(query, variables)
        .then((d) => {
          if (cancelled || latest.current !== key) return;
          setData(d);
          setError(undefined);
          setUpdatedAt(Date.now());
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    run();
    const id = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [query, key, intervalMs, enabled]);

  return { data, error, updatedAt };
}

export type UserRef = { id: string; displayName: string | null; xHandle: string | null; avatarUrl: string | null };

export type EventTime = { startTime: number; endTime: number; utcOffsetMinutes: number };

export type MainEvent = EventTime & { id: string; name: string; location: string };

export const EVENTS_QUERY = /* GraphQL */ `
  query Events {
    Event(where: { category: { _eq: 0 }, parent_id: { _is_null: true } }, order_by: { startTime: desc }) {
      id
      name
      location
      startTime
      endTime
      utcOffsetMinutes
    }
  }
`;

const USER_FIELDS = "id displayName xHandle avatarUrl";

export type DayRow = { day: string; eventDay: number; checkIns: number; firstTimers: number };

export type RecentCheckIn = { id: string; timestamp: number; eventDay: number; dayNumber: number; txSignature: string; user: UserRef };

// ---------- Overview: the showcase for everyone ----------

export type Islander = { checkInCount: number; user: UserRef };

export type OverviewData = {
  Event_by_pk:
    | (EventTime & {
        id: string;
        name: string;
        description: string;
        imageUrl: string;
        location: string;
        venue: string;
        checkInCount: number;
        uniqueAttendeeCount: number;
        registrationCount: number;
        lastCheckInAt: number | null;
      })
    | null;
  EventDay: DayRow[];
  recent: RecentCheckIn[];
  regulars: (Islander & { checkIns: { day: string }[] })[];
  islanders: Islander[];
};

export const OVERVIEW_QUERY = /* GraphQL */ `
  query Overview($event: String!) {
    Event_by_pk(id: $event) {
      id name description imageUrl location venue startTime endTime utcOffsetMinutes
      checkInCount uniqueAttendeeCount registrationCount lastCheckInAt
    }
    EventDay(where: { event_id: { _eq: $event } }, order_by: { day: asc }) { day eventDay checkIns firstTimers }
    recent: CheckIn(where: { event_id: { _eq: $event } }, order_by: { timestamp: desc }, limit: 8) {
      id timestamp eventDay dayNumber txSignature user { ${USER_FIELDS} }
    }
    regulars: Registration(
      where: { event_id: { _eq: $event }, checkInCount: { _gt: 0 } }
      order_by: [{ checkInCount: desc }, { firstCheckInAt: asc }]
      limit: 8
    ) { checkInCount user { ${USER_FIELDS} } checkIns { day } }
    islanders: Registration(
      where: { event_id: { _eq: $event }, checkInCount: { _gt: 0 } }
      order_by: { firstCheckInAt: asc }
      limit: 1000
    ) { checkInCount user { ${USER_FIELDS} } }
  }
`;

// ---------- Event analytics ----------

export type Session = EventTime & {
  id: string;
  name: string;
  categoryLabel: string;
  statusLabel: string;
  venue: string;
  editCount: number;
};

export type AnalyticsData = {
  _meta: { progressBlock: number; isReady: boolean }[];
  chain_metadata: { block_height: number }[];
  GlobalStats: { users: number; registrations: number; checkIns: number; events: number }[];
  Event_by_pk:
    | (EventTime & {
        id: string;
        name: string;
        location: string;
        venue: string;
        createdTx: string;
        requiresApproval: boolean;
        editCount: number;
        updatedAt: number | null;
        sessionCount: number;
        registrationCount: number;
        pendingCount: number;
        confirmedCount: number;
        rejectedCount: number;
        cancelledCount: number;
        checkInCount: number;
        uniqueAttendeeCount: number;
        lastCheckInAt: number | null;
      })
    | null;
  EventDay: DayRow[];
  registrations: { status: string; checkInCount: number; registeredAt: number }[];
  sessions: Session[];
  tiers: { id: string; name: string; dates: string; price: string; sold: number; maxSupply: string | null }[];
  passes: { id: string; price: string; timestamp: number; txSignature: string; tier: { name: string }; buyer: UserRef }[];
};

export const ANALYTICS_QUERY = /* GraphQL */ `
  query Analytics($event: String!) {
    _meta { progressBlock isReady }
    chain_metadata { block_height }
    GlobalStats { users registrations checkIns events }
    Event_by_pk(id: $event) {
      id name location venue startTime endTime utcOffsetMinutes createdTx requiresApproval editCount updatedAt
      sessionCount registrationCount pendingCount confirmedCount rejectedCount cancelledCount
      checkInCount uniqueAttendeeCount lastCheckInAt
    }
    EventDay(where: { event_id: { _eq: $event } }, order_by: { day: asc }) { day eventDay checkIns firstTimers }
    registrations: Registration(where: { event_id: { _eq: $event } }, limit: 5000) { status checkInCount registeredAt }
    sessions: Event(where: { parent_id: { _eq: $event } }, order_by: { startTime: asc }) {
      id name categoryLabel statusLabel startTime endTime utcOffsetMinutes venue editCount
    }
    tiers: TicketTier(where: { event_id: { _eq: $event } }, order_by: { name: asc }) { id name dates price sold maxSupply }
    passes: PassPurchase(where: { event_id: { _eq: $event } }, order_by: { timestamp: asc }) {
      id price timestamp txSignature tier { name } buyer { ${USER_FIELDS} }
    }
  }
`;

// ---------- Leaderboard: everyone at an edition, ranked ----------

export type LeaderboardRow = {
  id: string;
  status: string;
  registeredAt: number;
  registrationNumber: number;
  checkInCount: number;
  firstCheckInAt: number | null;
  user: UserRef;
};

export type LeaderboardData = {
  Event_by_pk: (EventTime & { id: string; name: string; requiresApproval: boolean }) | null;
  EventDay: { day: string; firstIn_id: string }[];
  CheckIn: { user_id: string; day: string; timestamp: number }[];
  Registration: LeaderboardRow[];
};

export const LEADERBOARD_QUERY = /* GraphQL */ `
  query Leaderboard($event: String!) {
    Event_by_pk(id: $event) { id name startTime endTime utcOffsetMinutes requiresApproval }
    EventDay(where: { event_id: { _eq: $event } }, order_by: { day: asc }) { day firstIn_id }
    CheckIn(where: { event_id: { _eq: $event } }, limit: 20000) { user_id day timestamp }
    Registration(where: { event_id: { _eq: $event } }, limit: 5000) {
      id status registeredAt registrationNumber checkInCount firstCheckInAt
      user { ${USER_FIELDS} }
    }
  }
`;

// ---------- Islander profile ----------

export type ProfileRegistration = {
  id: string;
  user_id: string;
  status: string;
  registeredAt: number;
  registrationNumber: number;
  reviewedAt: number | null;
  arrivedAt: number | null;
  checkInCount: number;
  firstCheckInAt: number | null;
  event: EventTime & {
    id: string;
    name: string;
    location: string;
    /** Set when this is a session (talk, social) of an edition rather than the edition itself. */
    parent: { name: string } | null;
    categoryLabel: string;
    requiresApproval: boolean;
    checkInCount: number;
    uniqueAttendeeCount: number;
    registrationCount: number;
    days: { day: string; eventDay: number; checkIns: number; firstIn_id: string }[];
    /** Everyone who checked in, to rank this islander against. */
    attendees: { checkInCount: number; firstCheckInAt: number }[];
  };
  checkIns: { day: string; eventDay: number; timestamp: number; txSignature: string }[];
};

export type ProfilePass = {
  id: string;
  price: string;
  timestamp: number;
  txSignature: string;
  asset: string;
  tier: { name: string; dates: string };
  event: { id: string; name: string; utcOffsetMinutes: number };
};

export type Profile = UserRef & {
  bio: string | null;
  website: string | null;
  profile: string | null;
  firstSeenAt: number;
  passCount: number;
  passSpend: string;
  registrations: ProfileRegistration[];
  passes: ProfilePass[];
};

export type ProfileData = { User_by_pk: Profile | null };

export const PROFILE_QUERY = /* GraphQL */ `
  query Profile($id: String!) {
    User_by_pk(id: $id) {
      ${USER_FIELDS} bio website profile firstSeenAt passCount passSpend
      registrations(order_by: { registeredAt: desc }) {
        id user_id status registeredAt registrationNumber reviewedAt arrivedAt checkInCount firstCheckInAt
        event {
          id name location startTime endTime utcOffsetMinutes requiresApproval checkInCount uniqueAttendeeCount registrationCount
          categoryLabel parent { name }
          days(order_by: { day: asc }) { day eventDay checkIns firstIn_id }
          attendees: registrations(where: { checkInCount: { _gt: 0 } }) { checkInCount firstCheckInAt }
        }
        checkIns(order_by: { timestamp: asc }) { day eventDay timestamp txSignature }
      }
      passes(order_by: { timestamp: asc }) {
        id price timestamp txSignature asset
        tier { name dates }
        event { id name utcOffsetMinutes }
      }
    }
  }
`;

// ---------- Finding yourself ----------

export type SearchData = { User: (UserRef & { checkInCount: number; registrationCount: number })[] };

export const SEARCH_QUERY = /* GraphQL */ `
  query Search($q: String!) {
    User(
      where: { _or: [{ displayName: { _ilike: $q } }, { xHandle: { _ilike: $q } }], registrationCount: { _gt: 0 } }
      order_by: { checkInCount: desc }
      limit: 12
    ) { ${USER_FIELDS} checkInCount registrationCount }
  }
`;
