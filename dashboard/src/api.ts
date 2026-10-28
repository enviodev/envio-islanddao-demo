import { useEffect, useRef, useState } from "react";

const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || "/v1/graphql";

/** Dev proxies /v1/graphql to the local indexer; a production build needs VITE_GRAPHQL_URL. */
export const INDEXER_CONFIGURED = !import.meta.env.PROD || Boolean(import.meta.env.VITE_GRAPHQL_URL);

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

export type MainEvent = { id: string; name: string; location: string; startTime: number; endTime: number };

export const EVENTS_QUERY = /* GraphQL */ `
  query Events {
    Event(where: { category: { _eq: 0 }, parent_id: { _is_null: true } }, order_by: { startTime: desc }) {
      id
      name
      location
      startTime
      endTime
    }
  }
`;

const USER_FIELDS = "id displayName xHandle avatarUrl";

// ---------- Overview: the showcase for everyone ----------

export type Islander = { checkInCount: number; user: UserRef };

export type OverviewData = {
  _meta: { progressBlock: number; isReady: boolean }[];
  Event_by_pk: {
    id: string;
    name: string;
    location: string;
    venue: string;
    startTime: number;
    endTime: number;
    checkInCount: number;
    uniqueAttendeeCount: number;
    lastCheckInAt: number | null;
  } | null;
  EventDay: { day: string; checkIns: number; firstTimers: number }[];
  recent: { id: string; timestamp: number; dayNumber: number; txSignature: string; user: UserRef }[];
  regulars: (Islander & { checkIns: { day: string }[] })[];
  islanders: Islander[];
};

export const OVERVIEW_QUERY = /* GraphQL */ `
  query Overview($event: String!) {
    _meta { progressBlock isReady }
    Event_by_pk(id: $event) {
      id name location venue startTime endTime checkInCount uniqueAttendeeCount lastCheckInAt
    }
    EventDay(where: { event_id: { _eq: $event } }, order_by: { day: asc }) { day checkIns firstTimers }
    recent: CheckIn(where: { event_id: { _eq: $event } }, order_by: { timestamp: desc }, limit: 8) {
      id timestamp dayNumber txSignature user { ${USER_FIELDS} }
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

// ---------- Organizers: detailed analytics ----------

export type OrganizerData = {
  _meta: { progressBlock: number; isReady: boolean }[];
  chain_metadata: { block_height: number }[];
  GlobalStats: {
    users: number;
    profiles: number;
    registrations: number;
    checkIns: number;
    events: number;
    sessions: number;
    passesSold: number;
    passRevenue: string;
  }[];
  Event_by_pk: {
    id: string;
    name: string;
    description: string;
    location: string;
    venue: string;
    latitude: number | null;
    longitude: number | null;
    startTime: number;
    endTime: number;
    createdTx: string;
    sessionCount: number;
    registrationCount: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    cancelledCount: number;
    checkInCount: number;
    uniqueAttendeeCount: number;
    lastCheckInAt: number | null;
    organization: { name: string; website: string };
  } | null;
  EventDay: { day: string; checkIns: number; firstTimers: number }[];
  registrations: { status: string; checkInCount: number }[];
  recent: { id: string; timestamp: number; dayNumber: number; txSignature: string; user: UserRef }[];
  top: { checkInCount: number; firstCheckInAt: number; user: UserRef }[];
  sessions: { id: string; name: string; categoryLabel: string; startTime: number; endTime: number; venue: string }[];
  tiers: { name: string; dates: string; price: string; sold: number; maxSupply: string | null }[];
};

export const ORGANIZER_QUERY = /* GraphQL */ `
  query Organizer($event: String!) {
    _meta { progressBlock isReady }
    chain_metadata { block_height }
    GlobalStats { users profiles registrations checkIns events sessions passesSold passRevenue }
    Event_by_pk(id: $event) {
      id name description location venue latitude longitude startTime endTime createdTx
      sessionCount registrationCount pendingCount approvedCount rejectedCount cancelledCount
      checkInCount uniqueAttendeeCount lastCheckInAt
      organization { name website }
    }
    EventDay(where: { event_id: { _eq: $event } }, order_by: { day: asc }) { day checkIns firstTimers }
    registrations: Registration(where: { event_id: { _eq: $event } }, limit: 5000) { status checkInCount }
    recent: CheckIn(where: { event_id: { _eq: $event } }, order_by: { timestamp: desc }, limit: 12) {
      id timestamp dayNumber txSignature user { ${USER_FIELDS} }
    }
    top: Registration(
      where: { event_id: { _eq: $event }, checkInCount: { _gt: 0 } }
      order_by: [{ checkInCount: desc }, { firstCheckInAt: asc }]
      limit: 10
    ) { checkInCount firstCheckInAt user { ${USER_FIELDS} } }
    sessions: Event(where: { parent_id: { _eq: $event } }, order_by: { startTime: asc }) {
      id name categoryLabel startTime endTime venue
    }
    tiers: TicketTier(where: { event_id: { _eq: $event } }, order_by: { name: asc }) { name dates price sold maxSupply }
  }
`;

// ---------- My island: one attendee ----------

export type MyRegistration = {
  id: string;
  status: string;
  registeredAt: number;
  reviewedAt: number | null;
  checkInCount: number;
  firstCheckInAt: number | null;
  event: {
    id: string;
    name: string;
    location: string;
    startTime: number;
    endTime: number;
    checkInCount: number;
    uniqueAttendeeCount: number;
    days: { day: string; checkIns: number }[];
    /** Everyone who checked in, to rank this attendee against. */
    attendees: { checkInCount: number; firstCheckInAt: number }[];
  };
  checkIns: { day: string; timestamp: number; txSignature: string }[];
};

export type MyIslandData = {
  User_by_pk: (UserRef & { bio: string | null; firstSeenAt: number; registrations: MyRegistration[] }) | null;
};

export const MY_ISLAND_QUERY = /* GraphQL */ `
  query MyIsland($id: String!) {
    User_by_pk(id: $id) {
      ${USER_FIELDS} bio firstSeenAt
      registrations(order_by: { registeredAt: desc }) {
        id status registeredAt reviewedAt checkInCount firstCheckInAt
        event {
          id name location startTime endTime checkInCount uniqueAttendeeCount
          days(order_by: { day: asc }) { day checkIns }
          attendees: registrations(where: { checkInCount: { _gt: 0 } }) { checkInCount firstCheckInAt }
        }
        checkIns(order_by: { timestamp: asc }) { day timestamp txSignature }
      }
    }
  }
`;
