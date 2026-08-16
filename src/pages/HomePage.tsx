import { ArrowRight, Building2, Clock3, FlaskConical, Map, MapPin, Search, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EntityCard } from "../components/EntityCard";
import { getFeaturedEntities, getTimeline } from "../lib/api";
import { formatTemporal, typeLabels } from "../lib/format";
import type { Entity, EntityType, TimelineEntry } from "../types";

const categories: Array<{ type: EntityType; icon: typeof Users }> = [
  { type: "individual", icon: Users }, { type: "organisation", icon: Building2 },
  { type: "place", icon: MapPin }, { type: "event", icon: Clock3 }, { type: "substance_condition", icon: FlaskConical }
];

export function HomePage() {
  const [featured, setFeatured] = useState<Entity[]>([]); const [timeline, setTimeline] = useState<TimelineEntry[]>([]); const [query, setQuery] = useState(""); const [error, setError] = useState(""); const navigate = useNavigate();
  useEffect(() => { Promise.all([getFeaturedEntities(), getTimeline()]).then(([f, t]) => { setFeatured(f.slice(0, 6)); setTimeline(t.slice(-3)); }).catch((e: Error) => setError(e.message)); }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) navigate(`/browse?q=${encodeURIComponent(query.trim())}`); };
  return <div className="page home-page">
    <section className="hero">
      <span className="kicker">INTERCONNECTED HISTORICAL RECORD · LOCAL DATASET</span>
      <h1>Trace the history<br />behind the wasteland.</h1>
      <p>Search people, factions, places and events—then follow the evidence and connections that bind them.</p>
      <form className="hero-search" onSubmit={submit}><Search aria-hidden /><input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the archive" placeholder="Try “Maxson”, “FEV” or “Hoover Dam”" /><button>Search archive</button></form>
      <div className="hero-links"><Link to="/timeline"><Clock3 size={17} /> Explore the timeline</Link><Link to="/map"><Map size={17} /> Open the map</Link></div>
    </section>
    {error && <div className="error-panel" role="alert">{error}</div>}
    <section><div className="section-heading"><div><span className="eyebrow">WAYS IN</span><h2>Browse the archive</h2></div><Link to="/browse">View all records <ArrowRight size={15} /></Link></div>
      <div className="category-grid">{categories.map(({ type, icon: Icon }) => <Link key={type} to={`/browse?type=${type}`}><Icon aria-hidden /><strong>{typeLabels[type]}</strong><span>Explore records</span></Link>)}</div>
    </section>
    <section><div className="section-heading"><div><span className="eyebrow">START A THREAD</span><h2>Featured records</h2></div></div><div className="card-grid">{featured.map((entity) => <EntityCard key={entity.id} entity={entity} />)}</div></section>
    <section className="recent-section"><div><span className="eyebrow">CHRONOLOGY</span><h2>From the timeline</h2><p>Dates retain the precision supported by their sources. Approximate events remain visibly approximate.</p><Link className="button-secondary" to="/timeline">Browse all events <ArrowRight size={15} /></Link></div><div className="mini-timeline">{timeline.map((entry) => <Link key={entry.entity.id} to={`/entity/${entry.entity.id}`}><time>{formatTemporal(entry.temporal)}</time><strong>{entry.entity.displayName}</strong><span>{entry.entity.summary}</span></Link>)}</div></section>
  </div>;
}
