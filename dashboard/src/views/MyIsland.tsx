import { useState, type FormEvent } from "react";
import { SEARCH_QUERY, usePolling, type SearchData } from "../api";
import { EnvioCta } from "../brand";
import { isWallet, plural, shortAddress } from "../format";
import { navigate } from "../router";
import { Loading, Person, Section, profileRoute } from "../ui";

/** Find a profile by wallet, name or X handle. Nothing to connect or sign. */
export function MyIsland() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState<string>();
  const { data, error } = usePolling<SearchData>(SEARCH_QUERY, { q: `%${query ?? ""}%` }, 60_000, query !== undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = input.trim().replace(/^@/, "");
    if (!value) return;
    if (isWallet(value)) navigate(profileRoute({ id: value }));
    else setQuery(value);
  };

  return (
    <>
      <section className="page-head">
        <div className="kicker">My island</div>
        <h1>Your IslandDAO, on-chain</h1>
        <p className="muted">
          Paste the wallet you registered with, or search for your name or X handle. Your profile shows your passports,
          achievements and passes. Nothing to connect or sign.
        </p>
        <form className="search" onSubmit={submit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Wallet address, name or @handle"
            spellCheck={false}
            aria-label="Wallet address, name or X handle"
          />
          <button type="submit">Find me</button>
        </form>
      </section>

      {error && <p className="error">{error}</p>}
      {query !== undefined && !data && !error && <Loading>Searching…</Loading>}
      {query !== undefined && data && (
        <Section
          title={data.User.length ? `${plural(data.User.length, "match", "matches")} for “${query}”` : `No one called “${query}”`}
          subtitle={data.User.length ? "Pick yourself to open your profile." : "Names come from on-chain IslandDAO profiles. Try your wallet address instead."}
        >
          <ul className="results">
            {data.User.map((u) => (
              <li key={u.id}>
                <Person user={u} size={36} sub={<small>{u.xHandle ? `@${u.xHandle} · ` : ""}{shortAddress(u.id)}</small>} />
                <span className="muted">{plural(u.checkInCount, "day")} on the island</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <EnvioCta title="Your passport is an API call away">
        Your stamps are read from Solana by an Envio HyperIndex indexer and served as GraphQL. Get a free API token and you
        can index any program the same way: check-ins, swaps, NFTs, anything.
      </EnvioCta>
    </>
  );
}
