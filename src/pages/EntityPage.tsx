import { ArrowLeft, BookOpen, CalendarDays, ExternalLink, FileText, GitBranch, Link2, List, MapPin, Quote, ShieldAlert, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { getEntity } from "../lib/api";
import { openExternalSource } from "../lib/external";
import { formatTemporal, statusLabel, typeLabel } from "../lib/format";
import type { EntityDetail, EvidenceView } from "../types";

function EvidenceList({ evidence }: { evidence: EvidenceView[] }) {
  if (!evidence.length) return null;
  return <div className="evidence-list">{evidence.map(({ link, item, work }) => <article key={link.id}>
    <div><BookOpen size={16} /><div><strong>{work.title}</strong><span>{item.title} · {item.locator}</span>{item.context && <small>{item.context}</small>}</div></div>
    <div className="evidence-meta"><span>{statusLabel(item.sourceClass)} source</span><span>{statusLabel(item.sourceType)}</span><span>{statusLabel(link.role)}</span><span>{statusLabel(link.directness)}</span>{item.date && <span>{item.date}</span>}</div>
    {link.note && <p>{link.note}</p>}
    {item.url && <button className="source-link" type="button" onClick={() => void openExternalSource(item.url!)}>Open source <ExternalLink size={12} /></button>}
  </article>)}</div>;
}

export function EntityPage() {
  const { id = "" } = useParams(); const [detail, setDetail] = useState<EntityDetail | null>(); const [error, setError] = useState("");
  useEffect(() => { setDetail(undefined); getEntity(id).then(setDetail).catch((e: Error) => setError(e.message)); }, [id]);
  if (error) return <div className="page"><div className="error-panel">{error}</div></div>;
  if (detail === undefined) return <div className="page loading-panel">Loading archive record…</div>;
  if (detail === null) return <div className="page empty-state"><h1>Record not found</h1><p>The requested stable ID is not present in this dataset.</p><Link to="/browse">Return to browse</Link></div>;
  const { entity } = detail;
  const evidence = new Map(detail.relationships.flatMap((r) => r.evidence).map((e) => [e.item.id, e]));
  detail.facts.flatMap((f) => f.evidence).forEach((e) => evidence.set(e.item.id, e));
  detail.articleSections.flatMap((section) => section.assertions).flatMap((assertion) => assertion.evidence).forEach((e) => evidence.set(e.item.id, e));
  return <div className="page entity-page">
    <Link className="back-link" to="/browse"><ArrowLeft size={15} /> Back to archive</Link>
    <header className="entity-header"><div><span className="kicker">{typeLabel(entity.type)} · {entity.subtype.replaceAll("_", " ")}</span><h1>{entity.displayName}</h1>{detail.aliases.length > 0 && <p className="aliases">Also known as {detail.aliases.join(" · ")}</p>}<p className="entity-lede">{entity.summary}</p></div><div className="record-stamp"><span>ARCHIVE RECORD</span><strong>{entity.id}</strong><small>{statusLabel(entity.recordStatus)}</small></div></header>
    {entity.description && <section className="content-panel"><span className="eyebrow">OVERVIEW</span><p className="description">{entity.description}</p></section>}
    {detail.articleSections.length > 0 && <div className="article-layout">
      <aside className="article-toc" aria-label="On this record"><span className="eyebrow"><List size={13} /> ON THIS RECORD</span><ol>{detail.articleSections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol></aside>
      <article className="lore-article"><div className="section-heading"><div><span className="eyebrow">CURATED ARTICLE</span><h2>History and context</h2></div><span className="count-label"><FileText size={15} /> {detail.articleSections.length} sections</span></div>
        {detail.articleSections.map((section) => {
          const sectionEvidence = new Map(section.assertions.flatMap((assertion) => assertion.evidence).map((item) => [item.item.id, item]));
          const related = section.relatedEntities;
          return <section className="article-section" id={section.id} key={section.id}><h3>{section.title}</h3>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {related.length > 0 && <div className="inline-related"><span>Related records</span>{related.map((record) => <Link key={record.id} to={`/entity/${record.id}`}>{record.displayName}</Link>)}</div>}
            {sectionEvidence.size > 0 && <details className="section-sources"><summary>{sectionEvidence.size} source locator{sectionEvidence.size === 1 ? "" : "s"} for this section</summary><EvidenceList evidence={[...sectionEvidence.values()]} /></details>}
          </section>;
        })}
      </article>
    </div>}
    {detail.disputes.length > 0 && <section className="dispute-panel"><div className="dispute-title"><ShieldAlert /><div><span className="eyebrow">CONFLICTING EVIDENCE</span><h2>Disputed / source-dependent</h2></div></div>{detail.disputes.map((dispute) => <article key={dispute.id}><p>{dispute.assessment}</p><div className="claim-grid">{dispute.assertions.map(({ assertion, predicate, objectEntity, evidence: claimEvidence }) => <div key={assertion.id}><StatusBadge value={assertion.epistemicStatus} /><h3>{predicate.label} {objectEntity?.displayName}</h3>{assertion.notes && <p>{assertion.notes}</p>}<EvidenceList evidence={claimEvidence} /></div>)}</div></article>)}</section>}
    {detail.outcomeGroups.length > 0 && <section className="outcome-panel"><div className="dispute-title"><GitBranch /><div><span className="eyebrow">CONDITIONAL HISTORY</span><h2>Possible outcomes</h2></div></div>{detail.outcomeGroups.map((group) => <article key={group.id}><h3>{group.title}</h3><p>{group.description}</p><div className="outcome-grid">{group.assertions.map(({ assertion, predicate, objectEntity, conditionSet, evidence: outcomeEvidence }) => <details key={assertion.id}><summary><span>{conditionSet?.label ?? "Conditional branch"}</span><StatusBadge value={conditionSet?.kind ?? assertion.epistemicStatus} /></summary><p>{assertion.object.text ?? `${predicate.label} ${objectEntity?.displayName ?? ""}`}</p>{conditionSet?.description && <small>{conditionSet.description}</small>}<EvidenceList evidence={outcomeEvidence} /></details>)}</div></article>)}</section>}
    {detail.facts.length > 0 && <section><div className="section-heading"><div><span className="eyebrow">STRUCTURED FACTS</span><h2>Dates and values</h2></div></div><div className="fact-list">{detail.facts.map(({ assertion, predicate, evidence: factEvidence }) => <article key={assertion.id}><CalendarDays /><div><span>{predicate.label}</span><strong>{assertion.object.temporal ? formatTemporal(assertion.object.temporal) : assertion.object.text}</strong><div><StatusBadge value={assertion.epistemicStatus} />{assertion.object.temporal?.precision && <span className="precision">Precision: {assertion.object.temporal.precision}</span>}</div><EvidenceList evidence={factEvidence} /></div></article>)}</div></section>}
    {detail.relationships.length > 0 && <section><div className="section-heading"><div><span className="eyebrow">KNOWLEDGE GRAPH</span><h2>Connected records</h2></div><span className="count-label"><Link2 size={15} /> {detail.relationships.length} links</span></div><div className="relationship-grid">{detail.relationships.map((relationship) => <Link key={`${relationship.assertionId}-${relationship.direction}`} to={`/entity/${relationship.entity.id}`}><span>{relationship.label}</span><strong>{relationship.entity.displayName}</strong><small>{typeLabel(relationship.entity.type)}{relationship.validTime ? ` · ${formatTemporal(relationship.validTime)}` : ""}</small><StatusBadge value={relationship.epistemicStatus} /><ExternalLink size={15} /></Link>)}</div></section>}
    {detail.spatial.length > 0 && <section className="content-panel"><div className="section-heading"><div><span className="eyebrow">GEOGRAPHY</span><h2>Map representation</h2></div><Link to="/map">Open map <MapPin size={15} /></Link></div>{detail.spatial.map((spatial) => <div className="spatial-row" key={spatial.id}><MapPin /><div><strong>{statusLabel(spatial.geometryKind)}</strong><p>{spatial.basis}</p>{spatial.notes && <small>{spatial.notes}</small>}</div><StatusBadge value={spatial.confidence} /></div>)}</section>}
    {detail.appearances.length > 0 && <section className="content-panel"><span className="eyebrow">APPEARANCES</span><div className="appearance-list">{detail.appearances.map((appearance) => appearance.work.slug ? <Link key={appearance.id} to={`/games/${appearance.work.slug}`}><Quote size={15} /><strong>{appearance.work.title}</strong><span>{statusLabel(appearance.kind)} · {appearance.work.releaseDate}</span></Link> : <div key={appearance.id}><Quote size={15} /><strong>{appearance.work.title}</strong><span>{statusLabel(appearance.kind)} · {appearance.work.releaseDate}</span></div>)}</div></section>}
    {evidence.size > 0 && <section className="content-panel"><span className="eyebrow">PROVENANCE</span><h2>Sources used on this record</h2><p className="section-intro">Source metadata and locators are retained without redistributing extensive copyrighted text.</p><EvidenceList evidence={[...evidence.values()]} /></section>}
    <div className="tag-row"><Tag size={15} />{entity.tags.map((tag) => <Link key={tag} to={`/browse?q=${encodeURIComponent(tag)}`}>{tag}</Link>)}</div>
  </div>;
}
