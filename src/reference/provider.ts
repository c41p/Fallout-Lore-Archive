import { invoke } from "@tauri-apps/api/core";
import type { LoreDataset, ReferenceArticle, ReferenceMapping, ReferenceSearchResult } from "../types";

const API = "https://fallout.fandom.com/api.php";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const isTauri = () => "__TAURI_INTERNALS__" in window;
let mappingsPromise: Promise<ReferenceMapping[]> | undefined;

async function mappings(): Promise<ReferenceMapping[]> {
  mappingsPromise ??= fetch("/data/runtime.json").then(async (response) => {
    if (!response.ok) throw new Error("The local provider mapping index is unavailable.");
    return ((await response.json()) as LoreDataset).referenceMappings ?? [];
  });
  return mappingsPromise;
}

export async function listReferenceMappings(): Promise<ReferenceMapping[]> { return mappings(); }

export async function getReferenceMapping(entityId: string): Promise<ReferenceMapping | null> {
  if (isTauri()) return invoke("get_reference_mapping", { entityId });
  return (await mappings()).find((mapping) => mapping.entityId === entityId) ?? null;
}

export async function resolveReferenceMapping(providerId: string, pageId?: number, title?: string): Promise<ReferenceMapping | null> {
  if (isTauri()) return invoke("resolve_reference_mapping", { providerId, pageId, title });
  const normalized = title?.toLocaleLowerCase("en-US").trim();
  return (await mappings()).find((mapping) => mapping.providerId === providerId && (pageId ? mapping.pageId === pageId : mapping.canonicalTitle.toLocaleLowerCase("en-US") === normalized)) ?? null;
}

function cacheKey(pageId?: number, title?: string) { return `fla:reference:nukapedia:${pageId ?? title?.toLocaleLowerCase("en-US")}`; }

function readBrowserCache(pageId?: number, title?: string): (ReferenceArticle & { cachedAt: number }) | null {
  try { return JSON.parse(localStorage.getItem(cacheKey(pageId, title)) ?? "null") as ReferenceArticle & { cachedAt: number }; }
  catch { return null; }
}

async function browserArticle(pageId?: number, title?: string, forceRefresh = false): Promise<ReferenceArticle> {
  const cached = readBrowserCache(pageId, title);
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return { ...cached, cacheStatus: "browser-cache" };
  const params = new URLSearchParams({ action: "parse", format: "json", formatversion: "2", redirects: "1", disableeditsection: "1", prop: "text|revid|displaytitle|properties", origin: "*" });
  if (pageId) params.set("pageid", String(pageId)); else if (title) params.set("page", title); else throw new Error("A reference page ID or title is required.");
  try {
    const response = await fetch(`${API}?${params}`);
    if (!response.ok) throw new Error(`Nukapedia returned HTTP ${response.status}.`);
    const payload = await response.json() as { error?: { info?: string }; parse?: { pageid: number; title: string; displaytitle?: string; revid?: number; text?: string } };
    if (payload.error || !payload.parse) throw new Error(payload.error?.info ?? "The requested reference page is missing.");
    const page = payload.parse;
    const article: ReferenceArticle & { cachedAt: number } = {
      providerId: "nukapedia", providerName: "Nukapedia", pageId: page.pageid, canonicalTitle: page.title,
      displayTitle: page.displaytitle ?? page.title, revisionId: page.revid ?? 0, retrievedAt: new Date().toISOString(),
      originalUrl: `https://fallout.fandom.com/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
      licence: "CC BY-SA 3.0", attributionUrl: "https://www.fandom.com/licensing", html: page.text ?? "",
      redirectFrom: title && title !== page.title ? title : undefined, cacheStatus: "live", cachedAt: Date.now()
    };
    localStorage.setItem(cacheKey(page.pageid, page.title), JSON.stringify(article));
    if (pageId || title) localStorage.setItem(cacheKey(pageId, title), JSON.stringify(article));
    return article;
  } catch (error) {
    if (cached) return { ...cached, cacheStatus: "stale", warning: `${error instanceof Error ? error.message : String(error)} Showing the last cached revision.` };
    throw error;
  }
}

export async function getReferenceArticle(pageId?: number, title?: string, forceRefresh = false): Promise<ReferenceArticle> {
  if (isTauri()) return invoke("get_reference_article", { pageId, title, forceRefresh });
  return browserArticle(pageId, title, forceRefresh);
}

function plainSnippet(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export async function searchReference(query: string): Promise<ReferenceSearchResult[]> {
  if (query.trim().length < 2) return [];
  if (isTauri()) return invoke("search_reference", { query });
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", list: "search", srnamespace: "0", srlimit: "12", srsearch: query.trim(), origin: "*" });
  const response = await fetch(`${API}?${params}`);
  if (!response.ok) throw new Error(`Nukapedia search returned HTTP ${response.status}.`);
  const payload = await response.json() as { query?: { search?: Array<{ pageid: number; title: string; snippet?: string }> } };
  const localMappings = await mappings();
  return (payload.query?.search ?? []).map((result) => ({
    providerId: "nukapedia", pageId: result.pageid, title: result.title, snippet: plainSnippet(result.snippet ?? ""),
    originalUrl: `https://fallout.fandom.com/wiki/${encodeURIComponent(result.title.replaceAll(" ", "_"))}`,
    entityId: localMappings.find((mapping) => mapping.providerId === "nukapedia" && mapping.pageId === result.pageid)?.entityId
  }));
}
