import type { ReactNode } from "react";
import wordmark from "./assets/islanddao-wordmark.png";

export const LINKS = {
  envioApp: "https://envio.dev/app",
  envioDocs: "https://docs.envio.dev/docs/HyperIndex/overview",
  envio: "https://envio.dev",
  island: "https://islanddao.org/events/v5-brazil-2026",
  repo: "https://github.com/enviodev/envio-islanddao-demo",
};

export function EnvioWordmark({ className = "" }: { className?: string }) {
  return <span className={`envio-wordmark ${className}`}>Envio</span>;
}

export function CollabLockup() {
  return (
    <span className="lockup">
      <a href={LINKS.island} target="_blank" rel="noreferrer" className="lockup-island" aria-label="IslandDAO">
        <img src={wordmark} alt="IslandDAO" height={22} />
      </a>
      <span className="lockup-x" aria-hidden>
        ×
      </span>
      <a href={LINKS.envio} target="_blank" rel="noreferrer" aria-label="Envio">
        <EnvioWordmark />
      </a>
    </span>
  );
}

/** The header's call to action: short, and clear to someone who has never heard of Envio. */
export function TryEnvioButton() {
  return (
    <a className="token-button" href={LINKS.envioApp} target="_blank" rel="noreferrer">
      Try Envio free
      <span aria-hidden>→</span>
    </a>
  );
}

const FLOW = [
  { icon: "◎", title: "Solana program", text: "IslandDAO's registrations and daily check-ins, on-chain" },
  { icon: "⚡", title: "Envio indexer", text: "Decodes every instruction and keeps the totals, live" },
  { icon: "▦", title: "This dashboard", text: "One GraphQL API behind every number you see" },
];

/**
 * The Envio box at the foot of each page: Envio's own pitch, one line tying it
 * to what the visitor is looking at, and how this page is built.
 */
export function EnvioCta({ context }: { context: ReactNode }) {
  return (
    <section className="cta">
      <div className="cta-copy">
        <span className="kicker">Powered by Envio</span>
        <h2>Build custom blockchain APIs & analytics</h2>
        <p className="cta-lead">Real-time, with enterprise SLAs. Production-ready for teams & AI agents.</p>
        <p className="cta-context">{context}</p>
        <div className="cta-actions">
          <a className="token-button" href={LINKS.envioApp} target="_blank" rel="noreferrer">
            Try Envio for free <span aria-hidden>→</span>
          </a>
          <a className="ghost-button" href={LINKS.repo} target="_blank" rel="noreferrer">
            See how this was built
          </a>
          <a className="ghost-button" href={LINKS.envioDocs} target="_blank" rel="noreferrer">
            Docs
          </a>
        </div>
      </div>
      <ol className="flow" aria-label="How this page works">
        {FLOW.map((f) => (
          <li key={f.title}>
            <span className="flow-icon" aria-hidden>
              {f.icon}
            </span>
            <span>
              <b>{f.title}</b>
              <small>{f.text}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
