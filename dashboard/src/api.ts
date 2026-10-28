import { useEffect, useRef, useState } from "react";

const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL ?? "/v1/graphql";

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

export type Dashboard = {
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

const USER_FIELDS = "id displayName xHandle avatarUrl";

export const DASHBOARD_QUERY = /* GraphQL */ `
  query Dashboard($event: String!) {
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

export type WalletLookup = {
  User_by_pk: (UserRef & {
    bio: string | null;
    firstSeenAt: number;
    registrations: {
      id: string;
      status: string;
      registeredAt: number;
      reviewedAt: number | null;
      checkInCount: number;
      event: { name: string };
    }[];
    checkIns: { id: string; timestamp: number; dayNumber: number; txSignature: string; event: { name: string } }[];
  }) | null;
};

export const WALLET_QUERY = /* GraphQL */ `
  query Wallet($id: String!) {
    User_by_pk(id: $id) {
      ${USER_FIELDS} bio firstSeenAt
      registrations(order_by: { registeredAt: desc }) {
        id status registeredAt reviewedAt checkInCount event { name }
      }
      checkIns(order_by: { timestamp: desc }) { id timestamp dayNumber txSignature event { name } }
    }
  }
`;
