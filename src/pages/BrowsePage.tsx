import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EntityCard } from "../components/EntityCard";
import { listEntities, searchEntities } from "../lib/api";
import { typeLabels } from "../lib/format";
import type { EntityType, SearchResult } from "../types";

export function BrowsePage() {
  const [params, setParams] = useSearchParams(); const query = params.get("q") ?? ""; const type = (params.get("type") ?? "all") as EntityType | "all"; const game = params.get("game") ?? "";
  const [input, setInput] = useState(query); const [results, setResults] = useState<SearchResult[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { setInput(query); setLoading(true); setError(""); (query ? searchEntities(query, { entityType: type, workId: game || undefined }) : listEntities({ entityType: type, workId: game || undefined })).then(setResults).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)); }, [query, type, game]);
  const update = (nextQuery: string, nextType = type) => { const p: Record<string, string> = {}; if (nextQuery.trim()) p.q = nextQuery.trim(); if (nextType !== "all") p.type = nextType; if (game) p.game = game; setParams(p); };
  return <div className="page"><header className="page-header"><span className="kicker">{game ? "FILTERED WORK INDEX" : "GLOBAL INDEX"}</span><h1>Search & browse</h1><p>Search canonical names, aliases, summaries, article sections and tags.{game && " Results are limited to the selected game."}</p></header>
    <form className="browse-search" onSubmit={(e) => { e.preventDefault(); update(input); }}><Search aria-hidden /><input aria-label="Search records" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search the local archive" /><button>Search</button></form>
    <div className="filter-row"><span><SlidersHorizontal size={15} /> Filter</span><button className={type === "all" ? "active" : ""} onClick={() => update(query, "all")}>All</button>{(Object.keys(typeLabels) as EntityType[]).map((key) => <button key={key} className={type === key ? "active" : ""} onClick={() => update(query, key)}>{typeLabels[key]}</button>)}</div>
    <div className="results-meta"><strong>{loading ? "Searching…" : `${results.length} record${results.length === 1 ? "" : "s"}`}</strong>{query && <span>matching “{query}”</span>}</div>
    {error && <div className="error-panel" role="alert">{error}</div>}
    {!loading && !error && !results.length && <div className="empty-state"><Search /><h2>No records found</h2><p>Try a broader name, an alias such as “BoS”, or clear the category filter.</p><button onClick={() => update("", "all")}>Clear search</button></div>}
    <div className="card-grid">{results.map((entity) => <EntityCard key={entity.id} entity={entity} />)}</div>
  </div>;
}
