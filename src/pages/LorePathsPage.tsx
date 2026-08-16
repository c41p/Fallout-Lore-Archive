import { ArrowRight, Route } from "lucide-react";
import { Link } from "react-router-dom";
import { lorePaths } from "../data/lorePaths";

export function LorePathsPage() {
  return <div className="page lore-paths-page"><header className="page-header"><span className="kicker">GUIDED EXPLORATION</span><h1>Lore Paths</h1><p>Follow curated chains through existing records. Each step remains part of the shared knowledge graph rather than becoming a duplicated essay.</p></header>
    <div className="lore-path-grid">{lorePaths.map((path) => <article key={path.id}><div className="lore-path-title"><Route /><div><span>{path.steps.length} connected steps</span><h2>{path.title}</h2></div></div><p>{path.summary}</p><ol>{path.steps.map((step, index) => <li key={step.entityId}><span>{String(index + 1).padStart(2, "0")}</span><div>{step.transition && <small>{step.transition}</small>}<Link to={`/entity/${step.entityId}`}>{step.label}</Link></div>{index < path.steps.length - 1 && <ArrowRight aria-hidden />}</li>)}</ol></article>)}</div>
  </div>;
}
