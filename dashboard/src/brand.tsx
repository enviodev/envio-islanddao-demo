import type { ReactNode } from "react";

export const LINKS = {
  envioToken: "https://envio.dev/app/api-tokens",
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
        <img src="/islanddao-wordmark.png" alt="IslandDAO" height={22} />
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

export function TokenButton({ label = "Get a free Envio API token" }: { label?: string }) {
  return (
    <a className="token-button" href={LINKS.envioToken} target="_blank" rel="noreferrer">
      {label}
      <span aria-hidden>→</span>
    </a>
  );
}

/** The collab banner: what powers the page, and an invite to build with Envio. */
export function EnvioCta({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="cta">
      <div className="cta-copy">
        <span className="kicker">IslandDAO × Envio</span>
        <h2>{title}</h2>
        <p>
          {children ?? (
            <>
              Every number on this page is indexed live from IslandDAO's check-in program on Solana with{" "}
              <b>Envio HyperIndex</b>. HyperSync backfilled the program's whole history in minutes. Point it at
              any program and you get a GraphQL API.
            </>
          )}
        </p>
        <div className="cta-actions">
          <TokenButton />
          <a className="ghost-button" href={LINKS.envioDocs} target="_blank" rel="noreferrer">
            Read the docs
          </a>
          <a className="ghost-button" href={LINKS.repo} target="_blank" rel="noreferrer">
            See this indexer's code
          </a>
        </div>
      </div>
      <pre className="terminal" aria-label="Get started with Envio">
        <span className="terminal-bar">
          <i />
          <i />
          <i />
        </span>
        <code>
          <span className="t-muted">$</span> pnpx envio init svm{"\n"}
          <span className="t-muted">? Name your indexer</span> islanddao{"\n"}
          <span className="t-ok">✓</span> Indexer ready{"\n"}
          <span className="t-muted">$</span> pnpm dev{"\n"}
          <span className="t-ok">✓</span> Synced 1,967 instructions{"\n"}
          <span className="t-accent">→ GraphQL on localhost:8080</span>
        </code>
      </pre>
    </section>
  );
}
