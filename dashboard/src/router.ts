import { useEffect, useState, type MouseEvent } from "react";

/** Paths, relative to the app's base:
 *    /                    overview of the latest edition
 *    /analytics           event analytics
 *    /leaderboard         everyone at the edition, ranked
 *    /v4, /v4/analytics, /v4/leaderboard  the same for an earlier edition
 *    /islander/<wallet>   one islander's profile, across editions
 *    /me                  find your own profile
 * Older links (/organizers, /islanders, /me/<wallet>, #hash URLs) still resolve.
 */
export type EditionView = "overview" | "analytics" | "leaderboard";
export type Route = { view: EditionView; edition?: string } | { view: "islander"; wallet: string } | { view: "me" };

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** "IslandDAO V4 - Thailand" -> "v4" */
export const editionSlug = (eventName: string) => eventName.match(/\bV(\d+)\b/i)?.[0].toLowerCase() ?? eventName.toLowerCase().replace(/\W+/g, "-");

const editionViews: Record<string, EditionView> = {
  analytics: "analytics",
  organizers: "analytics",
  leaderboard: "leaderboard",
  islanders: "leaderboard",
};

export function parseRoute(pathname: string): Route {
  const rel = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  const [first, second] = rel.split("/").filter(Boolean).map(decodeURIComponent);
  if ((first === "islander" || first === "me") && second) return { view: "islander", wallet: second };
  if (first === "me" || first === "islander") return { view: "me" };
  if (first && editionViews[first]) return { view: editionViews[first] };
  if (first) return { view: (second && editionViews[second]) || "overview", edition: first };
  return { view: "overview" };
}

export function routePath(route: Route): string {
  const parts =
    route.view === "islander"
      ? ["islander", route.wallet]
      : route.view === "me"
        ? ["me"]
        : [route.edition, route.view === "overview" ? undefined : route.view];
  const tail = parts.filter(Boolean).map((p) => encodeURIComponent(p!)).join("/");
  return `${BASE}/${tail}`;
}

/** Maps the hash URLs the first version used (#organizers, #me?wallet=...) onto paths. */
function fromLegacyUrl(): Route | undefined {
  const hash = window.location.hash.slice(1);
  if (!hash) return undefined;
  const wallet = new URLSearchParams(window.location.search).get("wallet") ?? undefined;
  if (hash === "me") return wallet ? { view: "islander", wallet } : { view: "me" };
  if (hash === "organizers") return { view: "analytics" };
  if (hash === "overview") return { view: "overview" };
  return undefined;
}

// One router for the whole app, so any component can render a <Link>.
let current: Route = { view: "overview" };
const listeners = new Set<(r: Route) => void>();

function init() {
  const legacy = fromLegacyUrl();
  const parsed = legacy ?? parseRoute(window.location.pathname);
  const canonical = routePath(parsed);
  if (canonical !== window.location.pathname) window.history.replaceState(null, "", canonical);
  current = parsed;
  window.addEventListener("popstate", () => {
    current = parseRoute(window.location.pathname);
    listeners.forEach((l) => l(current));
  });
}
init();

export function navigate(next: Route, { replace = false } = {}) {
  const path = routePath(next);
  if (path !== window.location.pathname) {
    window.history[replace ? "replaceState" : "pushState"](null, "", path);
  }
  current = next;
  listeners.forEach((l) => l(next));
  if (!replace) window.scrollTo({ top: 0 });
}

/** onClick for an <a href>: client-side navigation, but modifier clicks still open a new tab. */
export const linkTo = (next: Route) => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(next);
};

export function useRoute() {
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    listeners.add(setRoute);
    return () => void listeners.delete(setRoute);
  }, []);
  return route;
}
