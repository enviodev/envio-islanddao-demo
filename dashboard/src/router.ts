import { useEffect, useState, type MouseEvent } from "react";

/** Paths, relative to the app's base:
 *    /                 overview of the latest edition
 *    /organizers       organizer analytics
 *    /v4, /v4/organizers  the same for an earlier edition
 *    /me, /me/<wallet>    personal view
 */
export type Route =
  | { view: "overview" | "organizers"; edition?: string }
  | { view: "me"; wallet?: string };

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** "IslandDAO V4 - Thailand" -> "v4" */
export const editionSlug = (eventName: string) => eventName.match(/\bV(\d+)\b/i)?.[0].toLowerCase() ?? eventName.toLowerCase().replace(/\W+/g, "-");

export function parseRoute(pathname: string): Route {
  const rel = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  const [first, second] = rel.split("/").filter(Boolean).map(decodeURIComponent);
  if (first === "me") return { view: "me", wallet: second };
  if (first === "organizers") return { view: "organizers" };
  if (first) return { view: second === "organizers" ? "organizers" : "overview", edition: first };
  return { view: "overview" };
}

export function routePath(route: Route): string {
  const parts =
    route.view === "me"
      ? ["me", route.wallet]
      : [route.edition, route.view === "organizers" ? "organizers" : undefined];
  const tail = parts.filter(Boolean).map((p) => encodeURIComponent(p!)).join("/");
  return `${BASE}/${tail}`;
}

/** Maps the hash URLs the first version used (#organizers, #me?wallet=...) onto paths. */
function fromLegacyUrl(): Route | undefined {
  const hash = window.location.hash.slice(1);
  if (!hash) return undefined;
  const wallet = new URLSearchParams(window.location.search).get("wallet") ?? undefined;
  if (hash === "me") return { view: "me", wallet };
  if (hash === "organizers") return { view: "organizers" };
  if (hash === "overview") return { view: "overview" };
  return undefined;
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => {
    const legacy = fromLegacyUrl();
    if (legacy) {
      window.history.replaceState(null, "", routePath(legacy));
      return legacy;
    }
    return parseRoute(window.location.pathname);
  });

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (next: Route, { replace = false } = {}) => {
    const path = routePath(next);
    if (path !== window.location.pathname) {
      window.history[replace ? "replaceState" : "pushState"](null, "", path);
    }
    setRoute(next);
    if (!replace) window.scrollTo({ top: 0 });
  };

  /** onClick for an <a href>: client-side navigation, but modifier clicks still open a new tab. */
  const linkTo = (next: Route) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(next);
  };

  return { route, navigate, linkTo };
}
