import { useEffect, useState } from "react";
import { EVENTS_QUERY, INDEXER_CONFIGURED, usePolling, type MainEvent } from "./api";
import { CollabLockup, EnvioCta, LINKS, TokenButton } from "./brand";
import { isLive } from "./format";
import { editionSlug, routePath, useRoute, type Route } from "./router";
import { MyIsland } from "./views/MyIsland";
import { Organizers } from "./views/Organizers";
import { Overview } from "./views/Overview";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "organizers", label: "Organizers" },
  { id: "me", label: "My island" },
] as const;

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
    // Storage can be unavailable (private mode); the URL still carries the wallet.
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

export function App() {
  const now = useNow();
  const { route, navigate, linkTo } = useRoute();
  const { data, error } = usePolling<{ Event: MainEvent[] }>(EVENTS_QUERY, {}, 60_000, INDEXER_CONFIGURED);
  const events = data?.Event ?? [];
  const edition = route.view === "me" ? undefined : route.edition;
  // The newest edition lives at the root; older ones under their slug.
  const event = (edition && events.find((e) => editionSlug(e.name) === edition)) || events[0];
  const eventId = event?.id;
  const editionOf = (e: MainEvent) => (e.id === events[0]?.id ? undefined : editionSlug(e.name));
  const routeFor = (view: (typeof VIEWS)[number]["id"]): Route =>
    view === "me" ? { view, wallet: storedWallet() } : { view, edition: event ? editionOf(event) : edition };

  // /me remembers the last wallet looked up on this device.
  useEffect(() => {
    if (route.view === "me" && !route.wallet && storedWallet()) navigate({ view: "me", wallet: storedWallet() }, { replace: true });
  }, [route]);

  const changeWallet = (wallet?: string) => {
    storeWallet(wallet);
    navigate({ view: "me", wallet }, { replace: route.view === "me" && !route.wallet });
  };

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-row">
          <CollabLockup />
          <TokenButton label="Get an Envio API token" />
        </div>
        <nav className="masthead-row">
          <div className="views" role="tablist" aria-label="Views">
            {VIEWS.map((v) => (
              <a
                key={v.id}
                role="tab"
                aria-selected={route.view === v.id}
                className={route.view === v.id ? "view active" : "view"}
                href={routePath(routeFor(v.id))}
                onClick={linkTo(routeFor(v.id))}
              >
                {v.label}
              </a>
            ))}
          </div>
          {route.view !== "me" && events.length > 1 && (
            <div className="events" role="tablist" aria-label="Edition">
              {events.map((e) => {
                const to: Route = { view: route.view, edition: editionOf(e) };
                return (
                  <a
                    key={e.id}
                    role="tab"
                    aria-selected={e.id === eventId}
                    className={e.id === eventId ? "event-tab active" : "event-tab"}
                    href={routePath(to)}
                    onClick={linkTo(to)}
                  >
                    {e.name.replace("IslandDAO ", "").replace(" - Thailand", " · Thailand")}
                    {isLive(e, now) && <span className="live-dot" aria-label="live" />}
                  </a>
                );
              })}
            </div>
          )}
        </nav>
      </header>

      <main>
        {!INDEXER_CONFIGURED && (
          <EnvioCta title="The island is almost live">
            This build isn't connected to an indexer yet. Deploy the HyperIndex indexer to Envio Cloud, then rebuild with
            its GraphQL endpoint in <code>VITE_GRAPHQL_URL</code>.
          </EnvioCta>
        )}
        {error && !data && <p className="error">Could not reach the indexer GraphQL API: {error}</p>}
        {route.view === "overview" && eventId && (
          <Overview key={eventId} eventId={eventId} now={now} passportHref={routePath(routeFor("me"))} onFindPassport={linkTo(routeFor("me"))} />
        )}
        {route.view === "organizers" && eventId && <Organizers key={eventId} eventId={eventId} now={now} />}
        {route.view === "me" && <MyIsland key={route.wallet ?? ""} wallet={route.wallet} onWallet={changeWallet} />}
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
