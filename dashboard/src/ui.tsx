import type { ReactNode } from "react";
import type { UserRef } from "./api";
import { userName } from "./format";
import { Avatar } from "./island";
import { linkTo, routePath, type Route } from "./router";

export function Section({
  title,
  subtitle,
  aside,
  className,
  id,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className={["card", className].filter(Boolean).join(" ")} id={id}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className={accent ? "stat stat-accent" : "stat"}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** An in-app link: a real href (shareable, opens in a new tab), navigated client-side. */
export function Link({
  to,
  className,
  title,
  current,
  children,
}: {
  to: Route;
  className?: string;
  title?: string;
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <a href={routePath(to)} onClick={linkTo(to)} className={className} title={title} aria-current={current ? "page" : undefined}>
      {children}
    </a>
  );
}

export const profileRoute = (user: { id: string }): Route => ({ view: "islander", wallet: user.id });

/** An avatar that opens the islander's profile. */
export function AvatarLink({ user, size = 32, title }: { user: UserRef; size?: number; title?: string }) {
  return (
    <Link to={profileRoute(user)} className="avatar-link" title={title ?? `${userName(user)}: view profile`}>
      <Avatar user={user} size={size} />
    </Link>
  );
}

export function Person({ user, size = 28, sub }: { user: UserRef; size?: number; sub?: ReactNode }) {
  return (
    <span className="person">
      <AvatarLink user={user} size={size} />
      <span className="person-text">
        <Link to={profileRoute(user)}>{userName(user)}</Link>
        {sub ?? (user.xHandle && user.displayName && <small>@{user.xHandle}</small>)}
      </span>
    </span>
  );
}

const STATUS_HINT: Record<string, string> = {
  Pending: "Waiting for an organizer to approve",
  Confirmed: "Accepted, by an organizer or automatically when the edition has no approval step",
  Rejected: "Declined by an organizer",
  Cancelled: "Withdrawn by the attendee",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`} title={STATUS_HINT[status]}>
      {status}
    </span>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden />
      {children}
    </div>
  );
}
