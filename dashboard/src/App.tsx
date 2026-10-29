import { useEffect, useState } from "react";
import { EVENTS_QUERY, usePolling, type MainEvent } from "./api";
import { CollabLockup, LINKS, TokenButton } from "./brand";
import { editionName, isLive } from "./format";
import { editionSlug, navigate, useRoute, type EditionView, type Route } from "./router";
import { Link } from "./ui";
import { Analytics } from "./views/Analytics";
import { Islander } from "./views/Islander";
import { Islanders } from "./views/Islanders";
import { MyIsland } from "./views/MyIsland";
import { Overview } from "./views/Overview";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "islanders", label: "Islanders" },
  { id: "analytics", label: "Event analytics" },
  { id: "me", label: "My island" },
] as const;

// Same key as earlier versions, so a remembered wallet carries over.
const WALLET_KEY = "islanddao.wallet";

const storedWallet = () => {
  try {
    return localStorage.getItem(WALLET_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

const storeWallet = (wallet?: string) => {
  try {
    if (wallet) localStorage.setItem(WALLET_KEY, wallet);
    else localStorage.removeItem(WALLET_KEY);
  } catch {
    // Storage can be unavailable (private mode); profiles still work by URL.
  }
};

function useNow(intervalMs = 1_000) {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const isEditionView = (r: Route): r is { view: EditionView; edition?: string } =>
  r.view === "overview" || r.view === "analytics" || r.view === "islanders";

export function App() {
  const now = useNow();
  const route = useRoute();
  const [mine, setMine] = useState(storedWallet);
  const { data, error } = usePolling<{ Event: MainEvent[] }>(EVENTS_QUERY, {}, 60_000);
  const events = data?.Event ?? [];
  // The newest edition lives at the root; older ones under their slug. Profiles span editions.
  const [lastEdition, setLastEdition] = useState<string>();
  const edition = isEditionView(route) ? route.edition : lastEdition;
  useEffect(() => setLastEdition(edition), [edition]);
  const event = (edition && events.find((e) => editionSlug(e.name) === edition)) || events[0];
  const editionOf = (e: MainEvent) => (e.id === events[0]?.id ? undefined : editionSlug(e.name));
  const current = event ? editionOf(event) : undefined;

  const routeFor = (view: (typeof VIEWS)[number]["id"]): Route =>
    view === "me" ? (mine ? { view: "islander", wallet: mine } : { view: "me" }) : { view, edition: current };
  const activeTab = route.view === "islander" ? (route.wallet === mine ? "me" : undefined) : route.view;

  // /me opens the remembered profile straight away.
  useEffect(() => {
    if (route.view === "me" && mine) navigate({ view: "islander", wallet: mine }, { replace: true });
  }, [route, mine]);

  const claim = (wallet: string) => (isMine: boolean) => {
    const next = isMine ? wallet : undefined;
    storeWallet(next);
    setMine(next);
  };

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-row">
          <CollabLockup />
          <TokenButton label="Get an Envio API token" />
        </div>
        <nav className="masthead-row">
          <div className="views" aria-label="Views">
            {VIEWS.map((v) => (
              <Link key={v.id} to={routeFor(v.id)} current={activeTab === v.id} className={activeTab === v.id ? "view active" : "view"}>
                {v.label}
              </Link>
            ))}
          </div>
          {isEditionView(route) && events.length > 1 && (
            <div className="events" aria-label="Edition">
              {events.map((e) => (
                <Link
                  key={e.id}
                  to={{ view: route.view, edition: editionOf(e) }}
                  current={e.id === event?.id}
                  className={e.id === event?.id ? "event-tab active" : "event-tab"}
                >
                  {editionName(e.name)}
                  {isLive(e, now) && <span className="live-dot" aria-label="live" />}
                </Link>
              ))}
            </div>
          )}
        </nav>
      </header>

      <main>
        {error && !data && <p className="error">Could not reach the indexer GraphQL API: {error}</p>}
        {route.view === "overview" && event && <Overview key={event.id} eventId={event.id} edition={current} now={now} />}
        {route.view === "analytics" && event && <Analytics key={event.id} eventId={event.id} edition={current} now={now} />}
        {route.view === "islanders" && event && <Islanders key={event.id} eventId={event.id} now={now} />}
        {route.view === "islander" && (
          <Islander key={route.wallet} wallet={route.wallet} now={now} isMine={route.wallet === mine} onClaim={claim(route.wallet)} />
        )}
        {route.view === "me" && !mine && <MyIsland />}
      </main>

      <footer className="site-footer">
        <span>
          A collaboration between{" "}
          <a href={LINKS.island} target="_blank" rel="noreferrer">
            IslandDAO
          </a>{" "}
          and{" "}
          <a href={LINKS.envio} target="_blank" rel="noreferrer">
            Envio
          </a>
          . Data indexed from Solana with HyperIndex.
        </span>
        <span>
          <a href={LINKS.envioToken} target="_blank" rel="noreferrer">
            Get an API token
          </a>{" "}
          ·{" "}
          <a href={LINKS.envioDocs} target="_blank" rel="noreferrer">
            Docs
          </a>{" "}
          ·{" "}
          <a href={LINKS.repo} target="_blank" rel="noreferrer">
            Source
          </a>
        </span>
      </footer>
    </div>
  );
}
