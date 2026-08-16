import { CalendarRange, Filter, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { getTimeline } from "../lib/api";
import { formatTemporal, typeLabels } from "../lib/format";
import type { EntityType, TimelineEntry } from "../types";

export function TimelinePage() {
  const [params] = useSearchParams(); const game = params.get("game") ?? "";
  const [entries, setEntries] = useState<TimelineEntry[]>([]); const [type, setType] = useState<EntityType | "">(""); const [relatedType, setRelatedType] = useState<EntityType | "">(""); const [query, setQuery] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); setError(""); getTimeline({ entityType: type || undefined, workId: game || undefined }).then(setEntries).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)); }, [type, game]);
  const needle = query.trim().toLocaleLowerCase("en-GB");
  const filtered = entries.filter((entry) => (!relatedType || entry.relatedEntities.some((entity) => entity.type === relatedType)) && (!needle || [entry.entity, ...entry.relatedEntities].some((entity) => `${entity.displayName} ${entity.summary} ${entity.tags.join(" ")}`.toLocaleLowerCase("en-GB").includes(needle))));
  return <div className="page timeline-page"><header className="page-header"><span className="kicker">STRUCTURED CHRONOLOGY</span><h1>Timeline</h1><p>Events are ordered without turning year-only or approximate evidence into false exact dates.{game && " This view is filtered to one source work."}</p></header>
    <div className="timeline-controls"><Filter size={16} /><label>Record type<select value={type} onChange={(e) => setType(e.target.value as EntityType | "")}><option value="">All dated records</option>{(Object.keys(typeLabels) as EntityType[]).map((key) => <option key={key} value={key}>{typeLabels[key]}</option>)}</select></label><label>Connected type<select value={relatedType} onChange={(e) => setRelatedType(e.target.value as EntityType | "")}><option value="">Any connection</option>{(Object.keys(typeLabels) as EntityType[]).map((key) => <option key={key} value={key}>{typeLabels[key]}</option>)}</select></label><label className="timeline-search"><Search size={14} /><input aria-label="Filter timeline by subject" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Faction, person, place or period" /></label><span>{filtered.length} of {entries.length} dated records</span></div>
    {error && <div className="error-panel">{error}</div>}
    {loading && <div className="loading-panel">Loading chronology…</div>}
    {!loading && !error && !filtered.length && <div className="empty-state"><Search /><h2>No timeline entries match</h2><p>Try another connected type or a broader subject name.</p></div>}
    {!loading && <div className="timeline-list">{filtered.map((entry, index) => <article key={entry.entity.id}><div className="timeline-date"><time>{formatTemporal(entry.temporal)}</time><span>{entry.temporal.precision ?? "unknown"} precision</span></div><div className="timeline-line"><span></span></div><Link to={`/entity/${entry.entity.id}`}><div className="timeline-card-head"><span>{entry.entity.subtype.replaceAll("_", " ")}</span><StatusBadge value={entry.epistemicStatus} /></div><h2>{entry.entity.displayName}</h2><p>{entry.entity.summary}</p>{entry.relatedEntities.length > 0 && <div className="timeline-related">{entry.relatedEntities.slice(0, 6).map((entity) => <span key={entity.id}>{entity.displayName}</span>)}</div>}<small>{entry.evidenceCount ? `${entry.evidenceCount} evidence link${entry.evidenceCount === 1 ? "" : "s"}` : "Evidence not yet linked"}</small></Link>{index === filtered.length - 1 && <CalendarRange className="timeline-end" />}</article>)}</div>}
  </div>;
}
