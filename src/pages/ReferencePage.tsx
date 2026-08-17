import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ReferenceArticle } from "../components/ReferenceArticle";
import { resolveReferenceMapping } from "../reference/provider";
import type { ReferenceMapping } from "../types";

export function ReferencePage() {
  const { provider = "" } = useParams(); const [params] = useSearchParams(); const title = params.get("title") ?? undefined; const pageId = Number(params.get("pageId")) || undefined;
  const [mapping, setMapping] = useState<ReferenceMapping | null>();
  useEffect(() => { resolveReferenceMapping(provider, pageId, title).then(setMapping).catch(() => setMapping(null)); }, [provider, pageId, title]);
  if (provider !== "nukapedia") return <div className="page empty-state"><h1>Unknown reference provider</h1><Link to="/browse">Return to search</Link></div>;
  const direct = mapping ?? (pageId || title ? { id: `remote.nukapedia.${pageId ?? "title"}`, entityId: "", providerId: "nukapedia", pageId: pageId ?? 0, canonicalTitle: title ?? "", canonicalUrl: "", retrievedAt: "", articleMode: "reference" as const } : undefined);
  if (!direct) return <div className="page loading-panel">Resolving reference article…</div>;
  return <div className="page reference-page"><Link className="back-link" to="/browse"><ArrowLeft size={15} /> Back to search</Link>{mapping?.entityId && <div className="reference-match">This provider page has a structured Archive record. <Link to={`/entity/${mapping.entityId}`}>Open the connected record</Link>.</div>}<ReferenceArticle directMapping={direct} /></div>;
}
