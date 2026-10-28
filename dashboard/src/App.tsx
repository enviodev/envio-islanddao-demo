import { useEffect, useState } from "react";
import { EVENTS_QUERY, INDEXER_CONFIGURED, usePolling, type MainEvent } from "./api";
import { CollabLockup, EnvioCta, LINKS, TokenButton } from "./brand";
import { isLive } from "./format";
import { MyIsland } from "./views/MyIsland";
import { Organizers } from "./views/Organizers";
import { Overview } from "./views/Overview";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "organizers", label: "Organizers" },
  { id: "me", label: "My island" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const WALLET_KEY = "islanddao.wallet";

const readView = (): View => {
  const v = window.location.hash.slice(1);
  return VIEWS.some((x) => x.id === v) ? (v as View) : "overview";
};

const readWallet = () => {
  const fromUrl = new URLSearchParams(window.location.search).get("wallet");
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(WALLET_KEY) ?? undefined;
  } catch {
    return undefined;
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
  const [view, setView] = useState<View>(readView);
  const [wallet, setWallet] = useState<string | undefined>(readWallet);
  const { data, error } = usePolling<{ Event: MainEvent[] }>(EVENTS_QUERY, {}, 60_000, INDEXER_CONFIGURED);
  const events = data?.Event ?? [];
  const [selected, setSelected] = useState<string>();
  const eventId = selected ?? events[0]?.id;

  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (v: View) => {
    window.location.hash = v;
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const changeWallet = (w?: string) => {
    setWallet(w);
    const url = new URL(window.location.href);
    if (w) url.searchParams.set("wallet", w);
    else url.searchParams.delete("wallet");
    window.history.replaceState(null, "", url);
    try {
      if (w) localStorage.setItem(WALLET_KEY, w);
      else localStorage.removeItem(WALLET_KEY);
    } catch {
      // Storage can be unavailable (private mode); the URL still carries the wallet.
    }
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
              <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? "view active" : "view"} onClick={() => go(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
          {view !== "me" && events.length > 1 && (
            <div className="events" role="tablist" aria-label="Edition">
              {events.map((e) => (
                <button
                  key={e.id}
                  role="tab"
                  aria-selected={e.id === eventId}
                  className={e.id === eventId ? "event-tab active" : "event-tab"}
                  onClick={() => setSelected(e.id)}
                >
                  {e.name.replace("IslandDAO ", "").replace(" - Thailand", " · Thailand")}
                  {isLive(e, now) && <span className="live-dot" aria-label="live" />}
                </button>
              ))}
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
        {view === "overview" && eventId && <Overview key={eventId} eventId={eventId} now={now} onFindPassport={() => go("me")} />}
        {view === "organizers" && eventId && <Organizers key={eventId} eventId={eventId} now={now} />}
        {view === "me" && <MyIsland wallet={wallet} onWallet={changeWallet} />}
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
