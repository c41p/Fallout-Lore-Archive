import { BookOpen, CalendarRange, Map, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EntityCard } from "../components/EntityCard";
import { getGameProfile } from "../lib/api";
import { typeLabel, typeLabels } from "../lib/format";
import type { EntityType, GameProfile } from "../types";

export function GamePage() {
  const { slug = "" } = useParams(); const [profile, setProfile] = useState<GameProfile | null>(); const [error, setError] = useState("");
  useEffect(() => { setProfile(undefined); getGameProfile(slug).then(setProfile).catch((e: Error) => setError(e.message)); }, [slug]);
  if (error) return <div className="page"><div className="error-panel">{error}</div></div>;
  if (profile === undefined) return <div className="page loading-panel">Loading game archive…</div>;
  if (profile === null) return <div className="page empty-state"><h1>Game not found</h1><Link to="/games">Return to games</Link></div>;
  const { work, entities, sourceItems } = profile;
  const featured = (work.featuredEntityIds ?? []).flatMap((id) => { const entity = entities.find((candidate) => candidate.id === id); return entity ? [entity] : []; });
  return <div className="page game-page"><header className="game-hero"><span className="kicker">GAME ARCHIVE · {work.releaseDate?.slice(0, 4)}</span><h1>{work.title}</h1><p>{work.description}</p><div className="game-actions"><Link to={`/browse?game=${encodeURIComponent(work.id)}`}><Search /> Browse {entities.length} records</Link><Link to={`/timeline?game=${encodeURIComponent(work.id)}`}><CalendarRange /> Game timeline</Link><Link to={`/map?game=${encodeURIComponent(work.id)}`}><Map /> Game map</Link></div></header>
    <section className="game-counts" aria-label="Record counts">{(Object.keys(typeLabels) as EntityType[]).filter((kind) => profile.counts[kind]).map((kind) => <Link key={kind} to={`/browse?game=${encodeURIComponent(work.id)}&type=${kind}`}><strong>{profile.counts[kind]}</strong><span>{typeLabels[kind]}</span></Link>)}</section>
    {featured.length > 0 && <section><div className="section-heading"><div><span className="eyebrow">START HERE</span><h2>Featured records</h2></div></div><div className="card-grid">{featured.map((entity) => <EntityCard key={entity.id} entity={{ ...entity, aliases: [] }} />)}</div></section>}
    <section className="game-index"><div className="section-heading"><div><span className="eyebrow">WORK INDEX</span><h2>Explore by record type</h2></div></div>{(Object.keys(typeLabels) as EntityType[]).map((kind) => { const records = entities.filter((entity) => entity.type === kind); return records.length ? <details key={kind} open={kind === "event" || kind === "place"}><summary>{typeLabel(kind)} <span>{records.length}</span></summary><div>{records.map((entity) => <Link key={entity.id} to={`/entity/${entity.id}`}><strong>{entity.displayName}</strong><small>{entity.summary}</small></Link>)}</div></details> : null; })}</section>
    <section className="content-panel source-browser"><span className="eyebrow"><BookOpen size={13} /> PRIMARY SOURCE INDEX</span><h2>{sourceItems.length} source locators</h2><p className="section-intro">Dialogue, ending slides, holodisks and other released-game material are indexed as locators and metadata. The archive paraphrases rather than redistributing extensive game text.</p><div>{sourceItems.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.sourceType.replaceAll("_", " ")} · {item.locator}</span>{item.context && <p>{item.context}</p>}</article>)}</div></section>
  </div>;
}
