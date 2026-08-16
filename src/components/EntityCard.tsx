import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Entity } from "../types";
import { typeLabel } from "../lib/format";

export function EntityCard({ entity }: { entity: Entity }) {
  return <Link className="entity-card" to={`/entity/${entity.id}`}>
    <span className="eyebrow">{typeLabel(entity.type)} · {entity.subtype.replaceAll("_", " ")}</span>
    <strong>{entity.displayName}</strong>
    <p>{entity.summary}</p>
    <span className="card-link">Open record <ArrowUpRight size={14} aria-hidden /></span>
  </Link>;
}
