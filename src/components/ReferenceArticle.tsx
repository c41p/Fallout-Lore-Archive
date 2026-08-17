import { ExternalLink, Library, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { openExternalSource } from "../lib/external";
import { sanitizeReferenceArticle } from "../reference/article";
import { getReferenceArticle, getReferenceMapping, listReferenceMappings } from "../reference/provider";
import type { ReferenceArticle as ReferenceArticleData, ReferenceMapping } from "../types";

export function ReferenceArticle({ entityId, directMapping }: { entityId?: string; directMapping?: ReferenceMapping }) {
  const [mapping, setMapping] = useState<ReferenceMapping | null | undefined>(directMapping);
  const [article, setArticle] = useState<ReferenceArticleData>(); const [allMappings, setAllMappings] = useState<ReferenceMapping[]>([]);
  const [error, setError] = useState(""); const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { let active = true; Promise.all([directMapping ? Promise.resolve(directMapping) : entityId ? getReferenceMapping(entityId) : Promise.resolve(null), listReferenceMappings()]).then(([nextMapping, values]) => { if (active) { setMapping(nextMapping); setAllMappings(values); } }).catch((reason: Error) => active && setError(reason.message)); return () => { active = false; }; }, [entityId, directMapping]);
  const load = (force = false) => { if (!mapping) return; setRefreshing(force); setError(""); getReferenceArticle(mapping.pageId || undefined, mapping.canonicalTitle, force).then(setArticle).catch((reason: Error) => setError(reason.message)).finally(() => setRefreshing(false)); };
  useEffect(() => { if (mapping) load(); }, [mapping?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const clean = useMemo(() => article ? sanitizeReferenceArticle(article.html, allMappings) : undefined, [article, allMappings]);
  if (mapping === null) return null;
  if (mapping === undefined) return <section className="reference-shell loading-panel">Locating integrated reference article…</section>;
  return <section className="reference-shell" id="reference-article">
    <header className="reference-header"><div><span className="eyebrow"><Library size={13} /> INTEGRATED REFERENCE ARTICLE</span><h2>{article?.canonicalTitle ?? mapping.canonicalTitle}</h2><p>Long-form reference content from Nukapedia, presented inside the Archive alongside its structured chronology, relationships, maps, and primary-source research.</p></div><button type="button" disabled={refreshing} onClick={() => load(true)}><RefreshCw size={14} /> {refreshing ? "Refreshing…" : "Check for update"}</button></header>
    {article?.warning && <div className="reference-warning"><WifiOff size={16} /> {article.warning}</div>}
    {error && <div className="error-panel"><strong>Reference article unavailable</strong><p>{error}</p><small>The local Archive record and exploration tools below remain available.</small></div>}
    {!article && !error && <div className="reference-loading">Loading the provider article and checking the local cache…</div>}
    {article && clean && <div className="reference-layout">
      {clean.headings.length > 1 && <aside className="article-toc"><span className="eyebrow">ARTICLE CONTENTS</span><ol>{clean.headings.map((heading) => <li className={`toc-level-${heading.level}`} key={heading.id}><button type="button" onClick={() => document.getElementById(heading.id)?.scrollIntoView()}>{heading.label}</button></li>)}</ol></aside>}
      <article className="reference-body" onClick={(event) => { const anchor = (event.target as Element).closest("a[data-external]") as HTMLAnchorElement | null; if (anchor) { event.preventDefault(); void openExternalSource(anchor.href); } }} dangerouslySetInnerHTML={{ __html: clean.html }} />
    </div>}
    {article && <footer className="reference-attribution"><div><strong>Source and licence</strong><span>Nukapedia · revision {article.revisionId || "unreported"} · retrieved {article.retrievedAt}</span><span>Text available under {article.licence}; edits and presentation changes may have been made. Cache: {article.cacheStatus}.</span></div><button type="button" onClick={() => void openExternalSource(article.originalUrl)}>Open original article <ExternalLink size={13} /></button></footer>}
    {entityId && <p className="reference-context"><Link to={`/entity/${entityId}`}>Structured Archive identity: {entityId}</Link></p>}
  </section>;
}
