import { useState, type ReactNode } from "react";
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

/**
 * A slim strip above the header: what Envio is, in one line, and where to
 * start. It scrolls away; the header below stays.
 */
export function EnvioBar() {
  return (
    <a className="envio-bar" href={LINKS.envioApp} target="_blank" rel="noreferrer">
      <span className="envio-bar-text">
        <span className="envio-bar-bolt" aria-hidden>
          ⚡
        </span>
        <span className="label-long">
          Building on Solana? Turn your program into a live API with <b>Envio</b>.
        </span>
        <span className="label-short">
          <b>Envio</b> · your program as a live API
        </span>
      </span>
      <span className="envio-bar-cta">
        Start free <span aria-hidden>→</span>
      </span>
    </a>
  );
}

/** Trimmed from this repo: the real config, handler and query behind the check-ins. */
const SNIPPETS = [
  {
    file: "config.yaml",
    note: "Point Envio at the program and name its instructions.",
    code: `programs:
  - name: IslandEvents
    program_id: tabiZjsKYe5rs8fMM7FonZaw3pVBpiWMosB25eN6RrU
    instructions:
      - name: checkIn
        discriminator: "0x10"
        accounts: [checkInAuthority, attendee, attendance, event]`,
  },
  {
    file: "handler.ts",
    note: "Turn each instruction into rows you can query.",
    code: `indexer.onInstruction(
  { program: "IslandEvents", instruction: "checkIn" },
  async ({ instruction, context }) => {
    const { attendee, event } = instruction.accounts;
    context.CheckIn.set({
      id: instruction.transaction.signature,
      event_id: event.address,
      user_id: attendee.address,
      timestamp: instruction.block.time,
    });
  },
);`,
  },
  {
    file: "query.graphql",
    note: "Query it live. This page polls queries like this one.",
    code: `query LatestCheckIns {
  CheckIn(order_by: { timestamp: desc }, limit: 5) {
    timestamp
    user { displayName xHandle }
  }
}`,
  },
];

const TOKEN = /("[^"]*"|\/\/.*$|#.*$|\b(?:const|async|await|query)\b|\b[A-Za-z_]+(?=:)|\b\d+\b)/gm;

/** Just enough highlighting for three short snippets: strings, keys, keywords, numbers. */
function highlight(code: string) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    const t = m[0];
    if (m.index! > last) parts.push(code.slice(last, m.index));
    const cls = t.startsWith('"') ? "t-str" : /^(\/\/|#)/.test(t) ? "t-muted" : /^\d/.test(t) ? "t-num" : /^(const|async|await|query)$/.test(t) ? "t-kw" : "t-key";
    parts.push(
      <span key={m.index} className={cls}>
        {t}
      </span>,
    );
    last = m.index! + t.length;
  }
  parts.push(code.slice(last));
  return parts;
}

function CodeWindow() {
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const snippet = SNIPPETS[tab];
  const command = "pnpx envio init svm";
  return (
    <div className="code-window">
      <div className="code-tabs" role="tablist" aria-label="How this indexer is built">
        {SNIPPETS.map((sn, i) => (
          <button key={sn.file} role="tab" aria-selected={i === tab} className={i === tab ? "active" : ""} onClick={() => setTab(i)}>
            <span className="code-step">{i + 1}</span>
            {sn.file}
          </button>
        ))}
      </div>
      <p className="code-note">{snippet.note}</p>
      <pre className="code" role="tabpanel">
        <code>{highlight(snippet.code)}</code>
      </pre>
      <div className="code-start">
        <span className="t-muted">$</span> <code>{command}</code>
        <button
          className="copy"
          onClick={() =>
            navigator.clipboard?.writeText(command).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/**
 * The quiet box at the foot of each page: what powers it, in one line, and
 * the code behind it. The pitch itself lives in the bar at the top.
 */
export function EnvioCta({ context }: { context: ReactNode }) {
  return (
    <section className="cta">
      <div className="cta-copy">
        <span className="kicker">Powered by Envio</span>
        <h2>How this page is built</h2>
        <p>
          {context} Here's the gist for check-ins: a config, a handler and a query.
        </p>
        <div className="cta-actions">
          <a className="token-button" href={LINKS.envioApp} target="_blank" rel="noreferrer">
            Start free <span aria-hidden>→</span>
          </a>
          <a className="ghost-button" href={LINKS.repo} target="_blank" rel="noreferrer">
            See this demo's code
          </a>
        </div>
      </div>
      <CodeWindow />
    </section>
  );
}
