import { ExternalLink, Link2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatTemporal, typeLabel, typeLabels } from "../lib/format";
import type { EntityType, RelationshipView } from "../types";
import { StatusBadge } from "./StatusBadge";

export function RelationshipExplorer({ relationships }: { relationships: RelationshipView[] }) {
  const [type, setType] = useState<EntityType | "all">("all"); const [expanded, setExpanded] = useState(false);
  const available = useMemo(() => [...new Set(relationships.map((relationship) => relationship.entity.type))], [relationships]);
  const filtered = relationships.filter((relationship) => type === "all" || relationship.entity.type === type);
  const shown = expanded ? filtered : filtered.slice(0, 36);
  return <section><div className="section-heading"><div><span className="eyebrow">KNOWLEDGE GRAPH</span><h2>Connected records</h2></div><span className="count-label"><Link2 size={15} /> {relationships.length} links</span></div>
    <div className="relationship-controls" aria-label="Relationship filters"><button className={type === "all" ? "active" : ""} onClick={() => setType("all")}>All</button>{available.map((entityType) => <button className={type === entityType ? "active" : ""} key={entityType} onClick={() => setType(entityType)}>{typeLabels[entityType]}</button>)}</div>
    <div className="relationship-grid">{shown.map((relationship) => <Link key={`${relationship.assertionId}-${relationship.direction}`} to={`/entity/${relationship.entity.id}`}><span>{relationship.label}</span><strong>{relationship.entity.displayName}</strong><small>{typeLabel(relationship.entity.type)}{relationship.validTime ? ` · ${formatTemporal(relationship.validTime)}` : ""}</small><StatusBadge value={relationship.epistemicStatus} /><ExternalLink size={15} /></Link>)}</div>
    {filtered.length > 36 && <button className="relationship-expand" onClick={() => setExpanded((value) => !value)}>{expanded ? "Show fewer connections" : `Show all ${filtered.length} connections`}</button>}
  </section>;
}
