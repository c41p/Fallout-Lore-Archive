import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { DiscoveredPage, ReferencePage, ReferenceWork } from "./types";

export interface ReferenceProvider {
  readonly id: string;
  readonly name: string;
  readonly apiUrl: string;
  readonly contentLicence: string;
  readonly attributionUrl: string;
  discoverSubjects(work: ReferenceWork): Promise<DiscoveredPage[]>;
  fetchPageHeads(pageIds: number[]): Promise<ReferencePage[]>;
  fetchPageMetadata(pageIds: number[]): Promise<ReferencePage[]>;
}

export interface MediaWikiProviderOptions {
  apiUrl: string;
  cacheDir: string;
  userAgent: string;
  rateLimitMs?: number;
  cacheTtlMs?: number;
  offline?: boolean;
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface CacheEnvelope { fetchedAt: string; request: Record<string, string>; response: unknown }

const chunks = <T>(values: T[], size: number): T[][] => {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
};

const cleanCategory = (title: string) => title.replace(/^Category:/, "");
const values = (input: Array<{ title?: string; "*"?: string }> | undefined) => (input ?? []).map((entry) => entry.title ?? entry["*"]).filter((value): value is string => Boolean(value));

export function isRevisionChanged(previous: number | undefined, current: number | undefined): boolean {
  if (current == null) return previous != null;
  return previous !== current;
}

/**
 * Windows fallback for environments where Node's bundled CA set cannot verify a
 * locally intercepted certificate chain. curl.exe uses the Windows trust store.
 * Arguments are passed without a shell and downloaded bytes are parsed only as JSON.
 */
export function createWindowsCurlFetch(): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const args = ["--silent", "--show-error", "--fail-with-body", "--compressed", "--max-time", "30"];
    const userAgent = headers.get("User-Agent");
    if (userAgent) args.push("--user-agent", userAgent);
    const accept = headers.get("Accept");
    if (accept) args.push("--header", `Accept: ${accept}`);
    args.push(url);
    const result = spawnSync("curl.exe", args, { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`curl transport failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
    const body = result.stdout;
    return {
      ok: true, status: 200, statusText: "OK",
      json: async () => JSON.parse(body), text: async () => body
    } as Response;
  }) as typeof fetch;
}

export class MediaWikiProvider implements ReferenceProvider {
  readonly id = "nukapedia";
  readonly name = "Fallout Wiki (Nukapedia)";
  readonly contentLicence = "CC BY-SA 3.0 (community-authored wiki text unless otherwise noted)";
  readonly attributionUrl = "https://fallout.fandom.com/wiki/Fallout_Wiki:Copyrights";
  readonly apiUrl: string;
  private readonly options: Required<Pick<MediaWikiProviderOptions, "rateLimitMs" | "cacheTtlMs" | "offline" | "forceRefresh">> & MediaWikiProviderOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private lastRequestAt = 0;

  constructor(options: MediaWikiProviderOptions) {
    this.apiUrl = options.apiUrl;
    this.options = { rateLimitMs: 150, cacheTtlMs: 24 * 60 * 60 * 1000, offline: false, forceRefresh: false, ...options };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private cachePath(params: Record<string, string>): string {
    const stable = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))).toString();
    const key = crypto.createHash("sha256").update(stable).digest("hex");
    return path.join(this.options.cacheDir, `${key}.json`);
  }

  private readCache(params: Record<string, string>): CacheEnvelope | undefined {
    const filename = this.cachePath(params);
    if (!fs.existsSync(filename)) return undefined;
    try { return JSON.parse(fs.readFileSync(filename, "utf8")) as CacheEnvelope; }
    catch { return undefined; }
  }

  private async waitForRateLimit() {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.options.rateLimitMs) await new Promise((resolve) => setTimeout(resolve, this.options.rateLimitMs - elapsed));
  }

  async request(params: Record<string, string>): Promise<any> {
    const request = { action: "query", format: "json", formatversion: "2", maxlag: "5", ...params };
    const cached = this.readCache(request);
    const cacheAge = cached ? this.now().getTime() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;
    if (cached && (this.options.offline || (!this.options.forceRefresh && cacheAge <= this.options.cacheTtlMs))) return cached.response;
    if (this.options.offline) throw new Error(`Offline cache miss for ${new URLSearchParams(request).toString()}`);

    const url = new URL(this.apiUrl);
    Object.entries(request).forEach(([key, value]) => url.searchParams.set(key, value));
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.waitForRateLimit();
        this.lastRequestAt = Date.now();
        const response = await this.fetchImpl(url, { headers: { "User-Agent": this.options.userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const body = await response.json() as any;
        if (body.error) throw new Error(`MediaWiki ${body.error.code ?? "error"}: ${body.error.info ?? "unknown error"}`);
        fs.mkdirSync(this.options.cacheDir, { recursive: true });
        const envelope: CacheEnvelope = { fetchedAt: this.now().toISOString(), request, response: body };
        fs.writeFileSync(this.cachePath(request), `${JSON.stringify(envelope)}\n`, "utf8");
        return body;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }
    }
    if (cached) return cached.response;
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async discoverSubjects(work: ReferenceWork): Promise<DiscoveredPage[]> {
    if (!work.discovery) return [];
    const discovered = new Map<number, DiscoveredPage>();
    for (const facet of work.discovery.facets) {
      const root = `${work.discovery.categoryPrefix} ${facet}`;
      const queue: Array<{ category: string; depth: number }> = [{ category: root, depth: 0 }];
      const visited = new Set<string>();
      while (queue.length && discovered.size < work.discovery.maxSubjects) {
        const current = queue.shift()!;
        if (visited.has(current.category)) continue;
        visited.add(current.category);
        let continuation: string | undefined;
        do {
          const response = await this.request({
            list: "categorymembers",
            cmtitle: `Category:${current.category}`,
            cmtype: "page|subcat",
            cmnamespace: "0|14",
            cmprop: "ids|title|type",
            cmlimit: "500",
            ...(continuation ? { cmcontinue: continuation } : {})
          });
          const members = response.query?.categorymembers ?? [];
          for (const member of members) {
            if (member.type === "subcat" && current.depth < work.discovery.maxDepth) {
              queue.push({ category: cleanCategory(member.title), depth: current.depth + 1 });
            } else if (member.type === "page" && member.ns === 0 && !discovered.has(member.pageid)) {
              discovered.set(member.pageid, { pageId: member.pageid, title: member.title, workId: work.id, discoveryCategory: root });
            }
            if (discovered.size >= work.discovery.maxSubjects) break;
          }
          continuation = response.continue?.cmcontinue;
        } while (continuation && discovered.size < work.discovery.maxSubjects);
      }
    }
    return [...discovered.values()].sort((a, b) => a.pageId - b.pageId);
  }

  private parsePage(page: any): ReferencePage {
    const revision = page.revisions?.[0];
    return {
      pageId: page.pageid,
      title: page.title,
      fullUrl: page.fullurl ?? `https://fallout.fandom.com/wiki/${encodeURIComponent(String(page.title).replaceAll(" ", "_"))}`,
      revisionId: revision?.revid,
      revisionTimestamp: revision?.timestamp,
      length: revision?.size ?? page.length,
      categories: values(page.categories).map(cleanCategory).sort(),
      links: values(page.links).sort(),
      externalLinks: values(page.extlinks).sort(),
      templates: values(page.templates).sort(),
      redirects: values(page.redirects).sort()
    };
  }

  private async fetchPages(pageIds: number[], detailed: boolean): Promise<ReferencePage[]> {
    const output: ReferencePage[] = [];
    for (const batch of chunks([...new Set(pageIds)].sort((a, b) => a - b), 50)) {
      const props = detailed ? "info|revisions|categories|links|extlinks|templates|redirects" : "info|revisions";
      const response = await this.request({
        pageids: batch.join("|"),
        prop: props,
        inprop: "url",
        rvprop: "ids|timestamp|size",
        ...(detailed ? { cllimit: "50", pllimit: "50", ellimit: "20", tllimit: "30", rdlimit: "50", rdnamespace: "0" } : {})
      });
      for (const page of response.query?.pages ?? []) if (!page.missing) output.push(this.parsePage(page));
    }
    return output;
  }

  fetchPageHeads(pageIds: number[]): Promise<ReferencePage[]> { return this.fetchPages(pageIds, false); }
  fetchPageMetadata(pageIds: number[]): Promise<ReferencePage[]> { return this.fetchPages(pageIds, true); }
}
