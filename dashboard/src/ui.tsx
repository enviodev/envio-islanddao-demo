import type { ReactNode } from "react";
import type { UserRef } from "./api";
import { solscanAccount, userName } from "./format";
import { Avatar } from "./island";

export function Section({
  title,
  subtitle,
  aside,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={["card", className].filter(Boolean).join(" ")}>
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

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Person({ user, size = 28 }: { user: UserRef; size?: number }) {
  return (
    <span className="person">
      <Avatar user={user} size={size} />
      <span>
        <a href={solscanAccount(user.id)} target="_blank" rel="noreferrer">
          {userName(user)}
        </a>
        {user.xHandle && user.displayName && <small>@{user.xHandle}</small>}
      </span>
    </span>
  );
}
