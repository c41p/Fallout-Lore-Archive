import { CalendarRange, Filter } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { getTimeline } from "../lib/api";
import { formatTemporal, typeLabels } from "../lib/format";
import type { EntityType, TimelineEntry } from "../types";

export function TimelinePage() {
  const [entries, setEntries] = useState<TimelineEntry[]>([]); const [type, setType] = useState<EntityType | "">(""); const [error, setError] = useState("");
  useEffect(() => { getTimeline(type).then(setEntries).catch((e: Error) => setError(e.message)); }, [type]);
  return <div className="page timeline-page"><header className="page-header"><span className="kicker">STRUCTURED CHRONOLOGY</span><h1>Timeline</h1><p>Events are ordered without turning year-only or approximate evidence into false exact dates.</p></header>
    <div className="timeline-controls"><Filter size={16} /><label>Record type<select value={type} onChange={(e) => setType(e.target.value as EntityType | "")}><option value="">All dated records</option>{(Object.keys(typeLabels) as EntityType[]).map((key) => <option key={key} value={key}>{typeLabels[key]}</option>)}</select></label><span>{entries.length} dated records</span></div>
    {error && <div className="error-panel">{error}</div>}
    <div className="timeline-list">{entries.map((entry, index) => <article key={entry.entity.id}><div className="timeline-date"><time>{formatTemporal(entry.temporal)}</time><span>{entry.temporal.precision ?? "unknown"} precision</span></div><div className="timeline-line"><span></span></div><Link to={`/entity/${entry.entity.id}`}><div className="timeline-card-head"><span>{entry.entity.subtype.replaceAll("_", " ")}</span><StatusBadge value={entry.epistemicStatus} /></div><h2>{entry.entity.displayName}</h2><p>{entry.entity.summary}</p><small>{entry.evidenceCount ? `${entry.evidenceCount} evidence link${entry.evidenceCount === 1 ? "" : "s"}` : "Evidence not yet linked in sample"}</small></Link>{index === entries.length - 1 && <CalendarRange className="timeline-end" />}</article>)}</div>
  </div>;
}
