import fs from "node:fs";
import path from "node:path";
import type { Entity, LoreDataset } from "../../src/types";
import type {
  CandidateFlag, CandidateMatch, CoverageReport, CoverageState, CoverageWorkReport,
  DiscoveredPage, ReferenceCandidate, ReferenceCorpus, ReferencePage, ReferenceSubjectType,
  ReferenceWork, WorksManifest
} from "./types";
import type { ReferenceProvider } from "./providers";
import { isRevisionChanged } from "./providers";

const sortStrings = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
const cleanCategory = (value: string) => value.replace(/^Category:/, "");

export function normalizeCandidateTitle(value: string): string {
  return value.normalize("NFKD").replace(/[’‘]/g, "'").replace(/\s*\((?:Fallout[^)]*|character|location|faction|creature|quest|item)\)$/i, "").replace(/[^a-z0-9]+/gi, " ").trim().toLocaleLowerCase("en-US");
}

export function deterministicCandidateId(providerId: string, pageId: number): string {
  return `ref.${providerId}.${pageId}`;
}

const typeRules: Array<[ReferenceSubjectType, RegExp]> = [
  ["person", /\b(characters?|people|companions?|residents?|leaders?)\b/i],
  ["organisation", /\b(factions?|organisations?|organizations?|companies|tribes|gangs)\b/i],
  ["place", /\b(locations?|settlements?|vaults?|buildings?|facilities|regions?)\b/i],
  ["event", /\b(quests?|missions?|events?|battles?|wars?)\b/i],
  ["creature", /\b(creatures?|species|animals?)\b/i],
  ["technology", /\b(robots?|computers?|technology|technologies|vehicles?)\b/i],
  ["source_record", /\b(source texts?|holotapes?|holodisks?|notes?|terminals?|dialogue|documents?)\b/i],
  ["item", /\b(items?|weapons?|armor|armour|clothing|equipment)\b/i]
];

const entityTypeMap: Partial<Record<ReferenceSubjectType, Entity["type"]>> = {
  person: "individual", organisation: "organisation", place: "place", event: "event", creature: "substance_condition",
  technology: "technology", item: "artefact", source_record: "artefact", concept: "concept"
};

export function classifyReferencePage(page: Pick<ReferencePage, "title" | "categories" | "links" | "length">, discoveryCategories: string[], workCount = 1) {
  const evidence = [...discoveryCategories, ...page.categories].join(" ");
  const likelyType = typeRules.find(([, expression]) => expression.test(evidence))?.[0] ?? "other";
  const lower = `${page.title} ${evidence}`.toLocaleLowerCase("en-US");
  const primarySignal = `${page.title} ${discoveryCategories.join(" ")}`.toLocaleLowerCase("en-US");
  const flags = new Set<CandidateFlag>();
  const basis: string[] = [`Type inferred as ${likelyType} from category membership.`];
  const gameplay = /\b(achievements?|troph(?:y|ies)|gameplay|perks?|skills?|crafting|recipes?|ammunition|ammo|console commands?|user interface|special stats?|soundtrack|images?|audio files?|videos?)\b/.test(primarySignal);
  const referenceOnly = likelyType === "source_record" || /\b(source texts?|dialogue files?|terminal entries|holotapes?|holodisks?)\b/.test(lower);
  const cut = /\bcut content\b/.test(lower);
  const unused = /\bunused content\b/.test(lower);
  const mentionedOnly = /\bmentioned-only\b/.test(lower);
  if (gameplay) { flags.add("gameplay_only"); basis.push("Gameplay/mechanical category signal."); }
  if (referenceOnly) { flags.add("reference_only"); basis.push("Source-record/reference-unit category signal."); }
  if (mentionedOnly) { flags.add("uncertain"); basis.push("Mentioned-only category signal."); }

  let score = ({ person: 24, organisation: 38, place: 34, event: 28, creature: 18, technology: 20, item: 10, source_record: 14, concept: 20, other: 8 } as Record<ReferenceSubjectType, number>)[likelyType];
  score += Math.min(18, Math.max(0, workCount - 1) * 9);
  score += Math.min(14, Math.round((page.links?.length ?? 0) / 5));
  score += Math.min(12, Math.round((page.length ?? 0) / 10_000));
  if (/\b(leader|protagonist|antagonist|founder|president|general|elder|overseer|major faction|main character|capital)\b/i.test(`${page.title} ${discoveryCategories.join(" ")}`)) score += 32;
  if (/\b(Vault Dweller|Chosen One|Lone Wanderer|Courier|Sole Survivor|Brotherhood of Steel|Enclave|New California Republic|Caesar(?:'s Legion)?|Mr\.? House|Institute|Minutemen|Unity|Master|Capital Wasteland|Mojave Wasteland|Commonwealth|Appalachia)\b/i.test(page.title)) score += 45;
  if (page.categories.some((category) => normalizeCandidateTitle(category) === normalizeCandidateTitle(page.title))) score += 32;
  if (/\b(list of|random encounter|generic|unnamed|variant|crafting component)\b/i.test(page.title)) score -= 18;
  if (gameplay) score -= 35;
  if (cut || unused) score -= 8;
  score = Math.max(0, Math.min(100, score));

  if (!gameplay && score >= 68) flags.add("major_lore");
  else if (!gameplay && score >= 40) flags.add("supporting_lore");
  else if (!gameplay && !referenceOnly) flags.add("minor_lore");
  if (score >= 68 || cut || unused || /\b(FEV|retcon|identity|timeline|Great War|Brotherhood of Steel)\b/i.test(page.title)) flags.add("needs_primary_research");
  const materialStatus = cut ? "cut" : unused ? "unused" : /promotional/i.test(lower) ? "promotional" : "released";
  const ingestionTier: 1 | 2 | 3 | 4 = gameplay ? 4 : score >= 68 ? 1 : score >= 40 ? 2 : 3;
  return { likelyType, proposedEntityType: entityTypeMap[likelyType], flags: [...flags].sort(), classificationBasis: basis, importanceScore: score, ingestionTier, materialStatus };
}

function matchingIndexes(dataset: LoreDataset) {
  const canonical = new Map<string, string[]>();
  const aliases = new Map<string, string[]>();
  for (const entity of dataset.entities) canonical.set(normalizeCandidateTitle(entity.displayName), [...(canonical.get(normalizeCandidateTitle(entity.displayName)) ?? []), entity.id]);
  for (const name of dataset.names) aliases.set(normalizeCandidateTitle(name.name), [...(aliases.get(normalizeCandidateTitle(name.name)) ?? []), name.entityId]);
  return { canonical, aliases };
}

export function matchCandidate(title: string, redirects: string[], dataset: LoreDataset, explicitMappings: Record<string, string> = {}): CandidateMatch {
  const explicit = explicitMappings[String(title)] ?? redirects.map((redirect) => explicitMappings[redirect]).find(Boolean);
  if (explicit) return { entityId: explicit, method: "explicit", confidence: 1 };
  const index = matchingIndexes(dataset);
  const exactKey = title.normalize("NFKD").trim().toLocaleLowerCase("en-US");
  const exactEntities = dataset.entities.filter((entity) => entity.displayName.normalize("NFKD").trim().toLocaleLowerCase("en-US") === exactKey).map((entity) => entity.id);
  if (exactEntities.length === 1) return { entityId: exactEntities[0], method: "canonical_name", confidence: 0.99 };
  if (exactEntities.length > 1) return { method: "ambiguous", confidence: 0.35, alternatives: sortStrings(exactEntities) };
  const aliasExact = dataset.names.filter((name) => name.name.normalize("NFKD").trim().toLocaleLowerCase("en-US") === exactKey).map((name) => name.entityId);
  if (new Set(aliasExact).size === 1) return { entityId: aliasExact[0], method: "alias", confidence: 0.97 };
  const normalized = normalizeCandidateTitle(title);
  const candidates = sortStrings([...(index.canonical.get(normalized) ?? []), ...(index.aliases.get(normalized) ?? [])]);
  if (candidates.length === 1) return { entityId: candidates[0], method: "normalized_name", confidence: 0.88 };
  if (candidates.length > 1) return { method: "ambiguous", confidence: 0.3, alternatives: candidates };
  return { method: "none", confidence: 0 };
}

const primaryPattern = /\b(dialogue|dialog|terminal|holotape|holodisk|note|quest|manual|guide|interview|transcript|message file|source text)\b/i;

export function buildCandidate(page: ReferencePage, discoveries: DiscoveredPage[], provider: ReferenceProvider, works: ReferenceWork[], dataset: LoreDataset, retrievedAt: string, explicitMappings: Record<string, string> = {}): ReferenceCandidate {
  const discoveryWorkIds = sortStrings(discoveries.map((item) => item.workId));
  const discoveryCategories = sortStrings(discoveries.map((item) => item.discoveryCategory));
  const addonWorkIds = works.filter((work) => work.parentWorkId && work.associationPatterns?.some((pattern) => page.categories.some((category) => category.toLocaleLowerCase("en-US").includes(pattern.toLocaleLowerCase("en-US"))))).map((work) => work.id);
  const workIds = sortStrings([...discoveryWorkIds, ...addonWorkIds]);
  const classification = classifyReferencePage(page, discoveryCategories, workIds.length);
  const match = matchCandidate(page.title, page.redirects, dataset, explicitMappings);
  const flags = new Set<CandidateFlag>(classification.flags);
  if (page.redirects.length) flags.add("duplicate_or_alias");
  if (match.entityId && workIds.length > 1) flags.add("cross_game_existing_entity");
  if (match.method === "ambiguous") flags.add("uncertain");
  const primarySourceLeads = sortStrings([...page.links.filter((title) => primaryPattern.test(title)), ...page.externalLinks.filter((url) => /bethesda|interplay|obsidian|archive\.org|manual|guide|interview/i.test(url))]).slice(0, 15);
  const relatedTitles = page.links.filter((title) => !primaryPattern.test(title) && !/^(Fallout|Template:|Help:|Category:)/i.test(title)).slice(0, 12);
  const candidateClaims = [
    ...relatedTitles.slice(0, 4).map((objectTitle) => ({ predicateHint: "related_to" as const, objectTitle, confidence: "low" as const, needsPrimaryVerification: true as const })),
    ...primarySourceLeads.slice(0, 4).map((objectTitle) => ({ predicateHint: "mentions_primary_source" as const, objectTitle, referenceUrl: objectTitle.startsWith("http") ? objectTitle : undefined, confidence: "medium" as const, needsPrimaryVerification: true as const }))
  ];
  return {
    id: deterministicCandidateId(provider.id, page.pageId), providerId: provider.id, title: page.title,
    normalizedTitle: normalizeCandidateTitle(page.title), aliases: page.redirects, likelyType: classification.likelyType,
    proposedEntityType: classification.proposedEntityType, workIds, discoveryCategories, categories: sortStrings(page.categories.map(cleanCategory)),
    description: `Reference candidate discovered through ${discoveryCategories.slice(0, 3).join(", ") || "the configured Fallout Wiki scope"}. This generated description does not reproduce wiki prose.`,
    relatedTitles, primarySourceLeads, candidateClaims,
    attribution: {
      sourceSite: "fallout.fandom.com", wikiName: provider.name, pageTitle: page.title, canonicalPageUrl: page.fullUrl,
      pageId: page.pageId, revisionId: page.revisionId, revisionTimestamp: page.revisionTimestamp, retrievalTimestamp: retrievedAt,
      contentLicence: provider.contentLicence, attributionUrl: provider.attributionUrl, sourceType: "secondary_reference", redirectSources: page.redirects.length ? page.redirects : undefined
    },
    flags: [...flags].sort(), classificationBasis: classification.classificationBasis, importanceScore: classification.importanceScore,
    ingestionTier: classification.ingestionTier, ingestionStatus: match.entityId ? "matched" : match.method === "ambiguous" ? "ambiguous" : "unreviewed",
    match, materialStatus: classification.materialStatus as ReferenceCandidate["materialStatus"]
  };
}

export function entityCoverageState(entity: Entity | undefined, dataset: LoreDataset, ambiguous = false): CoverageState {
  if (ambiguous) return "needs_review";
  if (!entity) return "absent";
  const mapping = dataset.referenceMappings.some((candidate) => candidate.entityId === entity.id);
  const localResearch = (entity.articleSections?.length ?? 0) > 0;
  const evidenceTargets = new Set(dataset.evidenceLinks.map((link) => link.targetId));
  const sourced = dataset.assertions.filter((assertion) => (assertion.subjectId === entity.id || assertion.object.entityId === entity.id) && evidenceTargets.has(assertion.id)).length;
  if (mapping && localResearch) return "hybrid_researched";
  if (mapping) return "provider_mapped";
  if (sourced > 0 || localResearch) return "structured_record";
  return "candidate_match";
}

function buildWorkCoverage(work: ReferenceWork, candidates: ReferenceCandidate[], dataset: LoreDataset): CoverageWorkReport {
  const scoped = candidates.filter((candidate) => candidate.workIds.includes(work.id));
  const counts = new Map<CoverageState, number>();
  const byType: CoverageWorkReport["byType"] = {};
  let weightedTotal = 0; let weightedCovered = 0;
  for (const candidate of scoped) {
    const mappedEntityId = dataset.referenceMappings.find((mapping) => mapping.providerId === candidate.providerId && mapping.pageId === candidate.attribution.pageId)?.entityId ?? candidate.match.entityId;
    const entity = mappedEntityId ? dataset.entities.find((item) => item.id === mappedEntityId) : undefined;
    const state = entityCoverageState(entity, dataset, candidate.match.method === "ambiguous");
    counts.set(state, (counts.get(state) ?? 0) + 1);
    const bucket = byType[candidate.likelyType] ?? { total: 0, matched: 0, missing: 0 };
    bucket.total += 1; if (entity) bucket.matched += 1; else bucket.missing += 1; byType[candidate.likelyType] = bucket;
    if (!candidate.flags.includes("gameplay_only") && !candidate.flags.includes("reference_only")) {
      const tierMultiplier = candidate.ingestionTier === 1 ? 1 : candidate.ingestionTier === 2 ? 0.35 : 0.03;
      const weight = Math.max(0.25, candidate.importanceScore * tierMultiplier);
      weightedTotal += weight;
      weightedCovered += weight * ({ hybrid_researched: 1, provider_mapped: 0.85, structured_record: 0.65, candidate_match: 0.25, needs_review: 0, absent: 0 } as Record<CoverageState, number>)[state];
    }
  }
  const mappedPages = new Set(dataset.referenceMappings.filter((mapping) => mapping.providerId === "nukapedia").map((mapping) => mapping.pageId));
  const missing = scoped.filter((candidate) => !candidate.match.entityId && !mappedPages.has(candidate.attribution.pageId) && candidate.match.method !== "ambiguous");
  return {
    workId: work.id, slug: work.slug, title: work.title, referenceSubjects: scoped.length,
    matchedArchiveEntities: scoped.filter((candidate) => candidate.match.entityId || mappedPages.has(candidate.attribution.pageId)).length,
    hybridResearched: counts.get("hybrid_researched") ?? 0, providerMapped: counts.get("provider_mapped") ?? 0,
    structuredRecords: counts.get("structured_record") ?? 0, candidateMatches: counts.get("candidate_match") ?? 0,
    missingSubjects: missing.length, unresolvedMatches: scoped.filter((candidate) => candidate.match.method === "ambiguous").length,
    gameplayOrReferenceOnly: scoped.filter((candidate) => candidate.flags.includes("gameplay_only") || candidate.flags.includes("reference_only")).length,
    majorLore: scoped.filter((candidate) => candidate.flags.includes("major_lore")).length,
    supportingLore: scoped.filter((candidate) => candidate.flags.includes("supporting_lore")).length,
    minorLore: scoped.filter((candidate) => candidate.flags.includes("minor_lore")).length,
    deepResearchCandidates: scoped.filter((candidate) => candidate.flags.includes("needs_primary_research") && candidate.ingestionTier !== 4).length,
    tier1Gaps: missing.filter((candidate) => candidate.ingestionTier === 1).length, tier2Gaps: missing.filter((candidate) => candidate.ingestionTier === 2).length,
    weightedLoreCoverage: weightedTotal ? Number((weightedCovered / weightedTotal * 100).toFixed(1)) : 0, byType
  };
}

export function buildCoverageReport(corpus: ReferenceCorpus, works: ReferenceWork[], dataset: LoreDataset, generatedAt = new Date().toISOString()): CoverageReport {
  const reports = works.map((work) => buildWorkCoverage(work, corpus.candidates, dataset));
  const sum = (key: keyof CoverageWorkReport) => reports.reduce((total, report) => total + (typeof report[key] === "number" ? report[key] as number : 0), 0);
  const weightedSubjects = sum("referenceSubjects");
  return {
    schemaVersion: "1.0", generatedAt,
    methodology: "Importance-weighted integration estimate excluding gameplay-only and reference-only candidates; hybrid research=100%, provider mapped=85%, structured local record=65%, identity match=25%. Wiki pages are discovery units, not one-to-one Archive entities.",
    totals: {
      referenceSubjects: sum("referenceSubjects"), matchedArchiveEntities: sum("matchedArchiveEntities"), hybridResearched: sum("hybridResearched"),
      providerMapped: sum("providerMapped"), structuredRecords: sum("structuredRecords"), candidateMatches: sum("candidateMatches"), missingSubjects: sum("missingSubjects"),
      unresolvedMatches: sum("unresolvedMatches"), gameplayOrReferenceOnly: sum("gameplayOrReferenceOnly"), tier1Gaps: sum("tier1Gaps"), tier2Gaps: sum("tier2Gaps"),
      majorLore: sum("majorLore"), supportingLore: sum("supportingLore"), minorLore: sum("minorLore"), deepResearchCandidates: sum("deepResearchCandidates"),
      weightedLoreCoverage: weightedSubjects ? Number((reports.reduce((total, report) => total + report.weightedLoreCoverage * report.referenceSubjects, 0) / weightedSubjects).toFixed(1)) : 0,
      ambiguousMatches: corpus.candidates.filter((candidate) => candidate.match.method === "ambiguous").length,
      deepResearchFlags: corpus.candidates.filter((candidate) => candidate.flags.includes("needs_primary_research") && candidate.ingestionTier !== 4).length
    }, works: reports
  };
}

function jsonFile<T>(filename: string): T | undefined {
  if (!fs.existsSync(filename)) return undefined;
  return JSON.parse(fs.readFileSync(filename, "utf8")) as T;
}

const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function validateReferenceCorpus(corpus: ReferenceCorpus, works: ReferenceWork[], dataset: LoreDataset): string[] {
  const errors: string[] = [];
  const ids = new Set<string>(); const pageIds = new Set<number>();
  const workIds = new Set(works.map((work) => work.id)); const entityIds = new Set(dataset.entities.map((entity) => entity.id));
  if (corpus.schemaVersion !== "1.0") errors.push(`Unsupported reference schema ${corpus.schemaVersion}`);
  if (!corpus.provider.contentLicence || !corpus.provider.attributionUrl) errors.push("Provider licence/attribution metadata is incomplete");
  for (const candidate of corpus.candidates) {
    if (ids.has(candidate.id)) errors.push(`${candidate.id}: duplicate candidate ID`); ids.add(candidate.id);
    if (pageIds.has(candidate.attribution.pageId)) errors.push(`${candidate.id}: duplicate provider page ${candidate.attribution.pageId}`); pageIds.add(candidate.attribution.pageId);
    if (candidate.id !== deterministicCandidateId(candidate.providerId, candidate.attribution.pageId)) errors.push(`${candidate.id}: non-deterministic provider/page ID`);
    if (!candidate.title || !candidate.normalizedTitle) errors.push(`${candidate.id}: missing title normalization`);
    if (!candidate.attribution.contentLicence || !candidate.attribution.attributionUrl || !candidate.attribution.retrievalTimestamp) errors.push(`${candidate.id}: incomplete attribution metadata`);
    try { const url = new URL(candidate.attribution.canonicalPageUrl); if (url.protocol !== "https:") errors.push(`${candidate.id}: page URL must use HTTPS`); }
    catch { errors.push(`${candidate.id}: malformed canonical page URL`); }
    for (const workId of candidate.workIds) if (!workIds.has(workId)) errors.push(`${candidate.id}: unknown work ${workId}`);
    if (candidate.match.entityId && !entityIds.has(candidate.match.entityId)) errors.push(`${candidate.id}: missing matched entity ${candidate.match.entityId}`);
    if (candidate.description.length > 500) errors.push(`${candidate.id}: generated description is unexpectedly long`);
    if (candidate.ingestionTier < 1 || candidate.ingestionTier > 4) errors.push(`${candidate.id}: invalid ingestion tier`);
  }
  return errors;
}

export async function syncReferenceCorpus(options: {
  root: string; provider: ReferenceProvider; worksManifest: WorksManifest; dataset: LoreDataset; selectedWorks: ReferenceWork[]; explicitMappings?: Record<string, string>; generatedAt?: string; rebuildAll?: boolean;
}): Promise<ReferenceCorpus> {
  const outputPath = path.join(options.root, "reference/manifests/reference-corpus.json");
  const previous = jsonFile<ReferenceCorpus>(outputPath);
  const previousByPage = new Map((previous?.candidates ?? []).map((candidate) => [candidate.attribution.pageId, candidate]));
  const discoveries: DiscoveredPage[] = [];
  const failures: Array<{ scope: string; message: string }> = [];
  for (const work of options.selectedWorks) {
    try { discoveries.push(...await options.provider.discoverSubjects(work)); }
    catch (error) { failures.push({ scope: work.id, message: error instanceof Error ? error.message : String(error) }); }
  }
  const byPage = new Map<number, DiscoveredPage[]>();
  for (const discovery of discoveries) byPage.set(discovery.pageId, [...(byPage.get(discovery.pageId) ?? []), discovery]);
  const pageIds = [...byPage.keys()].sort((a, b) => a - b);
  const heads: ReferencePage[] = [];
  try { heads.push(...await options.provider.fetchPageHeads(pageIds)); }
  catch (error) { failures.push({ scope: "page-heads", message: error instanceof Error ? error.message : String(error) }); }
  const changedIds = heads.filter((head) => options.rebuildAll || isRevisionChanged(previousByPage.get(head.pageId)?.attribution.revisionId, head.revisionId)).map((head) => head.pageId);
  const unchangedIds = heads.filter((head) => !changedIds.includes(head.pageId)).map((head) => head.pageId);
  let details: ReferencePage[] = [];
  try { details = await options.provider.fetchPageMetadata(changedIds); }
  catch (error) { failures.push({ scope: "page-metadata", message: error instanceof Error ? error.message : String(error) }); }
  const retrievedAt = options.generatedAt ?? new Date().toISOString();
  const candidatesByPage = new Map<number, ReferenceCandidate>();
  for (const id of unchangedIds) {
    const old = previousByPage.get(id);
    if (old) {
      const mergedWorkIds = sortStrings([...old.workIds, ...(byPage.get(id) ?? []).map((item) => item.workId)]);
      candidatesByPage.set(id, { ...old, workIds: mergedWorkIds, discoveryCategories: sortStrings([...old.discoveryCategories, ...(byPage.get(id) ?? []).map((item) => item.discoveryCategory)]) });
    }
  }
  for (const page of details) candidatesByPage.set(page.pageId, buildCandidate(page, byPage.get(page.pageId) ?? [], options.provider, options.worksManifest.works, options.dataset, retrievedAt, options.explicitMappings));
  for (const candidate of previous?.candidates ?? []) if (!candidatesByPage.has(candidate.attribution.pageId)) candidatesByPage.set(candidate.attribution.pageId, candidate);
  const corpus: ReferenceCorpus = {
    schemaVersion: "1.0",
    provider: { id: options.provider.id, name: options.provider.name, apiUrl: options.provider.apiUrl, contentLicence: options.provider.contentLicence, attributionUrl: options.provider.attributionUrl },
    generatedAt: retrievedAt,
    candidates: [...candidatesByPage.values()].sort((a, b) => a.attribution.pageId - b.attribution.pageId),
    sync: { requestedWorkIds: options.selectedWorks.map((work) => work.id), discoveredPages: pageIds.length, changedPages: details.length, unchangedPages: unchangedIds.length, failures }
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, stableJson(corpus), "utf8");
  return corpus;
}

function coverageMarkdown(report: CoverageReport): string {
  const rows = report.works.map((work) => `| ${work.title} | ${work.referenceSubjects} | ${work.majorLore} | ${work.supportingLore} | ${work.matchedArchiveEntities} | ${work.hybridResearched} | ${work.providerMapped} | ${work.missingSubjects} | ${work.tier1Gaps} | ${work.weightedLoreCoverage}% |`).join("\n");
  return `# Fallout Lore Archive reference integration coverage\n\nGenerated: ${report.generatedAt}\n\nThis is a discovery and integration estimate, not a claim that every wiki page should become an Archive entity. ${report.methodology}\n\n| Work | Reference subjects | Major lore | Supporting lore | Matched | Hybrid research | Provider mapped | Missing | Tier 1 gaps | Weighted integration |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n\n## Franchise totals\n\n- Reference subject-work associations: ${report.totals.referenceSubjects}\n- Major lore associations: ${report.totals.majorLore}\n- Supporting lore associations: ${report.totals.supportingLore}\n- Matched subject-work associations: ${report.totals.matchedArchiveEntities}\n- Hybrid researched associations: ${report.totals.hybridResearched}\n- Provider-mapped associations: ${report.totals.providerMapped}\n- Structured local associations: ${report.totals.structuredRecords}\n- Missing subject-work associations: ${report.totals.missingSubjects}\n- Ambiguous candidate identities: ${report.totals.ambiguousMatches}\n- Tier 1 gaps: ${report.totals.tier1Gaps}\n- Tier 2 gaps: ${report.totals.tier2Gaps}\n- Deep Research flags: ${report.totals.deepResearchFlags}\n- Estimated weighted integration: ${report.totals.weightedLoreCoverage}%\n`;
}

export function writeCoverageOutputs(root: string, report: CoverageReport, corpus: ReferenceCorpus, dataset: LoreDataset) {
  const reportDir = path.join(root, "reference/reports");
  const queueDir = path.join(root, "reference/queues");
  fs.mkdirSync(reportDir, { recursive: true }); fs.mkdirSync(queueDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "coverage.json"), stableJson(report), "utf8");
  fs.writeFileSync(path.join(reportDir, "coverage.md"), coverageMarkdown(report), "utf8");
  for (const work of report.works) fs.writeFileSync(path.join(reportDir, `${work.slug}.json`), stableJson(work), "utf8");
  const mappedPages = new Set(dataset.referenceMappings.map((mapping) => mapping.pageId));
  const missing = corpus.candidates.filter((candidate) => !candidate.match.entityId && !mappedPages.has(candidate.attribution.pageId) && candidate.match.method !== "ambiguous");
  const queue = ([1, 2, 3, 4] as const).map((tier) => ({ tier, candidates: missing.filter((candidate) => candidate.ingestionTier === tier).sort((a, b) => b.importanceScore - a.importanceScore || a.title.localeCompare(b.title)).map((candidate) => ({ id: candidate.id, title: candidate.title, workIds: candidate.workIds, likelyType: candidate.likelyType, importanceScore: candidate.importanceScore, flags: candidate.flags, url: candidate.attribution.canonicalPageUrl })) }));
  fs.writeFileSync(path.join(queueDir, "ingestion-queue.json"), stableJson({ generatedAt: report.generatedAt, tiers: queue }), "utf8");
  const deep = corpus.candidates.filter((candidate) => candidate.flags.includes("needs_primary_research") && candidate.ingestionTier !== 4).sort((a, b) => b.importanceScore - a.importanceScore).map((candidate) => ({ id: candidate.id, title: candidate.title, workIds: candidate.workIds, importanceScore: candidate.importanceScore, materialStatus: candidate.materialStatus, primarySourceLeads: candidate.primarySourceLeads, url: candidate.attribution.canonicalPageUrl }));
  fs.writeFileSync(path.join(queueDir, "deep-research.json"), stableJson({ generatedAt: report.generatedAt, candidates: deep }), "utf8");
}
