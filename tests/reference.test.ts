import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDataset } from "../scripts/lore";
import { MediaWikiProvider, isRevisionChanged } from "../scripts/reference/providers";
import { buildCandidate, buildCoverageReport, classifyReferencePage, deterministicCandidateId, entityCoverageState, matchCandidate, normalizeCandidateTitle, validateReferenceCorpus } from "../scripts/reference/pipeline";
import type { ReferenceCorpus, ReferenceWork } from "../scripts/reference/types";
import { lorePaths } from "../src/data/lorePaths";

const tempDirs: string[] = [];
const temp = () => { const value = fs.mkdtempSync(path.join(os.tmpdir(), "fla-reference-test-")); tempDirs.push(value); return value; };
afterEach(() => { while (tempDirs.length) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true }); vi.restoreAllMocks(); });

const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/mediawiki-page.json"), "utf8"));
const response = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 503, statusText: ok ? "OK" : "Unavailable", json: () => Promise.resolve(body) } as Response);

describe("reference provider and candidate pipeline", () => {
  it("keeps every curated Lore Path step resolvable in the canonical dataset", () => {
    const ids = new Set(loadDataset().entities.map((entity) => entity.id));
    expect(lorePaths.flatMap((path) => path.steps).filter((step) => !ids.has(step.entityId))).toEqual([]);
  });
  it("parses page metadata, redirects, categories and revision details", async () => {
    const fetchImpl = vi.fn(() => response(fixture));
    const provider = new MediaWikiProvider({ apiUrl: "https://example.invalid/api.php", cacheDir: temp(), userAgent: "test", rateLimitMs: 0, fetchImpl });
    const [page] = await provider.fetchPageMetadata([4242]);
    expect(page).toMatchObject({ pageId: 4242, revisionId: 9001, length: 12345, redirects: ["Example alias"] });
    expect(page.categories).toContain("Fallout characters");
    expect(page.externalLinks).toContain("https://fallout.bethesda.net/example");
  });

  it("caches identical requests and retains the cached response on refresh failure", async () => {
    const cacheDir = temp(); const fetchImpl = vi.fn(() => response(fixture));
    const first = new MediaWikiProvider({ apiUrl: "https://example.invalid/api.php", cacheDir, userAgent: "test", rateLimitMs: 0, fetchImpl });
    await first.fetchPageMetadata([4242]); await first.fetchPageMetadata([4242]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const failing = vi.fn(() => Promise.reject(new Error("network down")));
    const refresh = new MediaWikiProvider({ apiUrl: "https://example.invalid/api.php", cacheDir, userAgent: "test", rateLimitMs: 0, forceRefresh: true, fetchImpl: failing as typeof fetch });
    expect((await refresh.fetchPageMetadata([4242]))[0].revisionId).toBe(9001);
  });

  it("detects revision changes and produces stable normalized identities", () => {
    expect(isRevisionChanged(10, 11)).toBe(true); expect(isRevisionChanged(10, 10)).toBe(false);
    expect(deterministicCandidateId("nukapedia", 42)).toBe("ref.nukapedia.42");
    expect(normalizeCandidateTitle("Roger Maxson (Fallout 76)")).toBe("roger maxson");
  });

  it("classifies lore and gameplay subjects conservatively", () => {
    const lore = classifyReferencePage({ title: "Example leader", categories: ["Fallout characters"], links: new Array(40).fill("Linked subject"), length: 60_000 }, ["Fallout characters"]);
    const mechanics = classifyReferencePage({ title: "Example achievement", categories: ["Fallout achievements"], links: [], length: 100 }, ["Fallout gameplay"]);
    expect(lore.likelyType).toBe("person"); expect(lore.flags).toContain("major_lore");
    expect(mechanics.flags).toContain("gameplay_only"); expect(mechanics.ingestionTier).toBe(4);
  });

  it("matches canonical names and aliases while preserving ambiguity", () => {
    const dataset = structuredClone(loadDataset());
    expect(matchCandidate("Roger Maxson", [], dataset).entityId).toBe("ent.roger_maxson");
    expect(matchCandidate("Richard Grey", [], dataset).entityId).toBe("ent.master");
    dataset.names.push({ id: "name.test.richard", entityId: "ent.roger_maxson", name: "Richard Grey", kind: "test" });
    expect(matchCandidate("Richard Grey", [], dataset).method).toBe("ambiguous");
  });

  it("retains licence and source-discovery metadata without copying page prose", () => {
    const provider = new MediaWikiProvider({ apiUrl: "https://example.invalid/api.php", cacheDir: temp(), userAgent: "test", offline: true });
    const page = { pageId: 4242, title: "Example subject", fullUrl: "https://fallout.fandom.com/wiki/Example_subject", revisionId: 9001, revisionTimestamp: "2026-08-01T12:00:00Z", length: 12345, categories: ["Fallout characters"], links: ["Example terminal entries", "Brotherhood of Steel"], externalLinks: [], templates: [], redirects: ["Example alias"] };
    const work: ReferenceWork = { id: "work.fallout", slug: "fallout1", title: "Fallout", kind: "game", materialStatus: "released", coverageEnabled: true, discovery: { categoryPrefix: "Fallout", facets: ["characters"], maxDepth: 0, maxSubjects: 10 } };
    const candidate = buildCandidate(page, [{ pageId: 4242, title: page.title, workId: work.id, discoveryCategory: "Fallout characters" }], provider, [work], loadDataset(), "2026-08-16T00:00:00Z");
    expect(candidate.attribution).toMatchObject({ pageId: 4242, revisionId: 9001, contentLicence: expect.stringContaining("CC BY-SA 3.0") });
    expect(candidate.primarySourceLeads).toContain("Example terminal entries");
    expect(candidate.description).toContain("does not reproduce wiki prose");
  });

  it("scores the rich Fallout 1 benchmark by integration rather than word count", () => {
    const dataset = loadDataset();
    expect(["hybrid_researched", "structured_record"]).toContain(entityCoverageState(dataset.entities.find((entity) => entity.id === "ent.master"), dataset));
    expect(["hybrid_researched", "structured_record"]).toContain(entityCoverageState(dataset.entities.find((entity) => entity.id === "ent.vault_13"), dataset));
    const candidates = ["Vault Dweller", "Vault 13", "Shady Sands", "Junktown", "The Hub", "Necropolis", "Boneyard", "Brotherhood of Steel", "The Glow", "Mariposa Military Base", "Unity", "Master"].map((title, index) => ({
      id: `ref.test.${index}`, providerId: "test", title, normalizedTitle: normalizeCandidateTitle(title), aliases: [], likelyType: "place" as const, proposedEntityType: "place" as const,
      workIds: ["work.fallout"], discoveryCategories: ["Fallout locations"], categories: [], description: "fixture", relatedTitles: [], primarySourceLeads: [], candidateClaims: [],
      attribution: { sourceSite: "fixture", wikiName: "fixture", pageTitle: title, canonicalPageUrl: `https://example.invalid/${index}`, pageId: index, retrievalTimestamp: "2026-08-16T00:00:00Z", contentLicence: "fixture", attributionUrl: "https://example.invalid", sourceType: "secondary_reference" as const },
      flags: ["major_lore" as const], classificationBasis: ["fixture"], importanceScore: 80, ingestionTier: 1 as const, ingestionStatus: "matched" as const,
      match: matchCandidate(title, [], dataset), materialStatus: "released" as const
    }));
    const corpus: ReferenceCorpus = { schemaVersion: "1.0", provider: { id: "test", name: "fixture", apiUrl: "https://example.invalid", contentLicence: "fixture", attributionUrl: "https://example.invalid" }, generatedAt: "2026-08-16T00:00:00Z", candidates, sync: { requestedWorkIds: ["work.fallout"], discoveredPages: candidates.length, changedPages: candidates.length, unchangedPages: 0, failures: [] } };
    const report = buildCoverageReport(corpus, [{ id: "work.fallout", slug: "fallout1", title: "Fallout", kind: "game", materialStatus: "released", coverageEnabled: true }], dataset, corpus.generatedAt);
    expect(report.works[0].matchedArchiveEntities).toBeGreaterThanOrEqual(11);
    expect(report.works[0].hybridResearched + report.works[0].structuredRecords).toBeGreaterThanOrEqual(2);
    expect(validateReferenceCorpus(corpus, [{ id: "work.fallout", slug: "fallout1", title: "Fallout", kind: "game", materialStatus: "released" }], dataset)).toEqual([]);
  });

  it("handles malformed partial API pages without executing external text", async () => {
    const provider = new MediaWikiProvider({ apiUrl: "https://example.invalid/api.php", cacheDir: temp(), userAgent: "test", rateLimitMs: 0, fetchImpl: vi.fn(() => response({ query: { pages: [{ pageid: 7, title: "Partial" }] } })) });
    const [page] = await provider.fetchPageMetadata([7]);
    expect(page).toMatchObject({ pageId: 7, categories: [], links: [], redirects: [] });
  });
});
