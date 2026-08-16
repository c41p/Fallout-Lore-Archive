import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDataset } from "./lore";
import { createWindowsCurlFetch, MediaWikiProvider } from "./reference/providers";
import type { ReferenceCandidate, ReferenceCorpus, ReferenceWork, WorksManifest } from "./reference/types";
import type { Appearance, ArticleSection, Assertion, Entity, EntityType, EvidenceLink, LoreDataset, NameUsage, SourceItem, TemporalValue } from "../src/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = <T>(relative: string): T => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")) as T;
const writeJson = (relative: string, value: unknown) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const outputs = {
  entities: "lore/franchise/entities/reference-expansion.json",
  overrides: "lore/franchise/overrides/reference-expansion.json",
  depthClosures: "lore/franchise/overrides/depth-closure.json",
  assertions: "lore/franchise/assertions/reference-expansion.json",
  sources: "lore/franchise/source-items/reference-expansion.json",
  evidence: "lore/franchise/evidence/reference-expansion.json",
  appearances: "lore/franchise/appearances/reference-expansion.json",
  names: "lore/franchise/names/reference-expansion.json",
  manifest: "reference/manifests/franchise-completion.json",
  depthJson: "reference/reports/content-depth.json",
  depthMarkdown: "reference/reports/content-depth.md"
};

const normalized = (value: string) => value.toLocaleLowerCase("en-US")
  .normalize("NFKD").replace(/[’']/g, "").replace(/&/g, " and ")
  .replace(/\([^)]*(fallout|add-on|dlc|game|creation club|van buren|tv series)[^)]*\)/gi, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();

const titleBlocked = (title: string) => {
  const lower = title.toLocaleLowerCase("en-US");
  return /^(list of|category:|template:|portal:|file:|fallout wiki:)/i.test(title)
    || /\.(txt|msg|dds|nif)$/i.test(title)
    || /\((creation club|van buren|fallout bible|unused|cut content|mod)\)/i.test(title)
    || /\b(console commands?|form ids?|editor ids?|game files?|technical data|bugs|gallery|appearances|reputation|random encounter|loading screen|world object|unused content)\b/i.test(lower)
    || /^(fallout|fallout 2|fallout 3|fallout 4|fallout 76|fallout: new vegas|fallout tactics|fallout shelter).*(characters|locations|factions|quests|items|weapons|armor|creatures|robots|source texts)$/i.test(title);
};

export function isExpansionCandidate(candidate: ReferenceCandidate): boolean {
  if (candidate.materialStatus !== "released") return false;
  if (candidate.flags.includes("gameplay_only") || candidate.flags.includes("reference_only")) return false;
  if (["source_record", "unknown"].includes(candidate.likelyType)) return false;
  if (titleBlocked(candidate.title)) return false;
  if (candidate.ingestionTier <= 2) return candidate.likelyType !== "item" || candidate.importanceScore >= 50;
  if (candidate.ingestionTier !== 3 || candidate.importanceScore < 35) return false;
  if (["item", "other"].includes(candidate.likelyType)) return false;
  if (candidate.likelyType === "event" && candidate.importanceScore < 37) return false;
  return true;
}

const entityType = (candidate: ReferenceCandidate): EntityType => {
  if (candidate.proposedEntityType) return candidate.proposedEntityType;
  return ({ person: "individual", organisation: "organisation", place: "place", event: "event", creature: "substance_condition", technology: "technology", item: "artefact", concept: "concept", other: "concept" } as Record<string, EntityType>)[candidate.likelyType] ?? "concept";
};

const subtype = (candidate: ReferenceCandidate) => ({
  person: "character", organisation: "faction_or_organisation", place: "location", event: "historical_or_quest_event",
  creature: "creature_or_species", technology: "technology", item: "notable_artefact", concept: "lore_concept", other: "lore_subject"
} as Record<string, string>)[candidate.likelyType] ?? "lore_subject";

const typeLabel = (candidate: ReferenceCandidate) => ({ person: "person", organisation: "organisation", place: "place", event: "event", creature: "creature or biological subject", technology: "technology", item: "lore-significant artefact", concept: "concept", other: "lore subject" } as Record<string, string>)[candidate.likelyType] ?? "lore subject";
const indefiniteTypeLabel = (candidate: ReferenceCandidate) => `${/^[aeiou]/i.test(typeLabel(candidate)) ? "an" : "a"} ${typeLabel(candidate)}`;

const workContinuity = (workIds: string[]) => [...new Set(workIds.map((workId) => {
  if (workId === "work.fallout_tactics") return "games_secondary_status";
  if (workId === "work.fallout_bos") return "separate_or_disputed_games_continuity";
  if (workId === "work.fallout_shelter") return "gameplay_forward_supplementary";
  return "games_primary";
}))];

const parentWorkMap = (works: ReferenceWork[]) => new Map(works.filter((work) => work.parentWorkId).map((work) => [work.id, work.parentWorkId!]));

function stripTemplates(value: string): string {
  let output = value;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = output.replace(/\{\{[^{}]*\}\}/g, " ");
    if (next === output) break;
    output = next;
  }
  return output;
}

function plainWiki(value: string): string {
  return stripTemplates(value)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, " ").replace(/<ref\b[^>]*\/>/gi, " ")
    .replace(/\[\[(?:File|Image|Category):[^\]]+\]\]/gi, " ")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1").replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1").replace(/\[https?:\/\/[^\]]+\]/g, " ")
    .replace(/<br\s*\/?>/gi, "; ").replace(/<[^>]+>/g, " ")
    .replace(/'{2,}/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
    .replace(/^[:*#;]+/gm, "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function removeTopTemplates(wikitext: string): string {
  let output = wikitext.replace(/<!--[\s\S]*?-->/g, "").trimStart();
  while (output.startsWith("{{")) {
    let depth = 0; let end = -1;
    for (let index = 0; index < output.length - 1; index += 1) {
      const pair = output.slice(index, index + 2);
      if (pair === "{{") { depth += 1; index += 1; }
      else if (pair === "}}") { depth -= 1; index += 1; if (depth === 0) { end = index + 1; break; } }
    }
    if (end < 0) break;
    output = output.slice(end).trimStart();
  }
  return output;
}

function leadParagraphs(wikitext: string): string[] {
  const lead = removeTopTemplates(wikitext).split(/\n==[^=]/, 1)[0];
  return lead.split(/\n\s*\n/).map(plainWiki).filter((paragraph) => paragraph.length >= 45 && !/^(for |see also|main article)/i.test(paragraph)).slice(0, 3);
}

function sectionParagraphs(wikitext: string): Array<{ title: string; paragraph: string }> {
  const matches = [...wikitext.matchAll(/^==+\s*([^=\n]+?)\s*==+\s*$/gm)];
  const sections: Array<{ title: string; paragraph: string }> = [];
  for (let index = 0; index < matches.length; index += 1) {
    const title = plainWiki(matches[index][1]);
    if (!/(history|background|overview|organization|organisation|society|role|biology|characteristics|technology|events|operations|legacy|relations)/i.test(title)) continue;
    const start = (matches[index].index ?? 0) + matches[index][0].length;
    const end = matches[index + 1]?.index ?? wikitext.length;
    const paragraph = wikitext.slice(start, end).split(/\n\s*\n/).map(plainWiki).find((item) => item.length >= 60);
    if (paragraph) sections.push({ title, paragraph });
    if (sections.length >= 3) break;
  }
  return sections;
}

function extractInfobox(wikitext: string): Record<string, string> {
  const start = wikitext.search(/\{\{\s*Infobox\b/i);
  if (start < 0) return {};
  let depth = 0; let end = -1;
  for (let index = start; index < wikitext.length - 1; index += 1) {
    const pair = wikitext.slice(index, index + 2);
    if (pair === "{{") { depth += 1; index += 1; }
    else if (pair === "}}") { depth -= 1; index += 1; if (depth === 0) { end = index + 1; break; } }
  }
  if (end < 0) return {};
  const body = wikitext.slice(start, end); const fields: Record<string, string> = {};
  let current = "";
  for (const line of body.split("\n")) {
    const field = line.match(/^\|\s*([^=]+?)\s*=\s*(.*)$/);
    if (field) { current = field[1].trim().toLocaleLowerCase("en-US"); fields[current] = field[2].trim(); }
    else if (current && line.trim()) fields[current] += `\n${line.trim()}`;
  }
  return fields;
}

const usefulFields = ["type", "role", "occupation", "affiliation", "location", "headquarters", "capital", "founded", "founder", "leader", "members", "species", "race", "manufacturer", "owners", "related", "date", "year"];

function profileFacts(fields: Record<string, string>): Array<{ label: string; value: string }> {
  return usefulFields.flatMap((key) => {
    const value = fields[key]; if (!value) return [];
    const clean = plainWiki(value).replace(/\n+/g, "; ").replace(/\s*;\s*;+/g, "; ").slice(0, 420).trim();
    return clean.length >= 2 ? [{ label: key.replaceAll("_", " "), value: clean }] : [];
  }).slice(0, 8);
}

function linkedTitles(fields: Record<string, string>): string[] {
  return usefulFields.flatMap((key) => [...(fields[key] ?? "").matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map((match) => match[1].trim()));
}

function contextualLinkedTitles(wikitext: string): string[] {
  const body = removeTopTemplates(wikitext).split(/\n==\s*(References|Gallery|Appearances)\s*==/i, 1)[0].slice(0, 40_000);
  return [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
    .map((match) => match[1].trim()).filter((title) => !/^(File|Image|Category|Template):/i.test(title));
}

function sentence(value: string, max = 700): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return /[.!?]$/.test(clean) ? clean : `${clean}.`;
  const cut = clean.slice(0, max); const boundary = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
  return `${cut.slice(0, boundary > max * 0.55 ? boundary + 1 : max).trim()}…`;
}

function temporalFromFields(fields: Record<string, string>): TemporalValue | undefined {
  const raw = [fields.date, fields.year, fields.founded].filter(Boolean).join(" ");
  const years = [...raw.matchAll(/\b(20\d{2}|21\d{2}|22\d{2}|23\d{2})\b/g)].map((match) => Number(match[1]));
  if (!years.length) return undefined;
  const unique = [...new Set(years)].sort((a, b) => a - b);
  if (unique.length > 1 && unique.at(-1)! - unique[0] <= 300) return { kind: "interval", start: { year: unique[0] }, end: { year: unique.at(-1)! }, precision: "year", display: `${unique[0]}–${unique.at(-1)}` };
  return { kind: "point", start: { year: unique[0] }, precision: "year", display: String(unique[0]) };
}

const workYears: Record<string, number> = {
  "work.fallout": 2161, "work.fallout_2": 2241, "work.fallout_tactics": 2197, "work.fallout_bos": 2208,
  "work.fallout_3": 2277, "work.operation_anchorage": 2277, "work.the_pitt": 2277, "work.broken_steel": 2277,
  "work.point_lookout": 2277, "work.mothership_zeta": 2277, "work.new_vegas": 2281, "work.dead_money": 2281,
  "work.honest_hearts": 2281, "work.old_world_blues": 2281, "work.lonesome_road": 2281, "work.fallout_4": 2287,
  "work.automatron": 2287, "work.far_harbor": 2287, "work.vault_tec_workshop": 2287, "work.nuka_world": 2287
};

function approximateWorkTemporal(workIds: string[]): TemporalValue | undefined {
  if (!workIds.length || workIds.some((workId) => !workYears[workId])) return undefined;
  const years = [...new Set(workIds.map((workId) => workYears[workId]).filter((year): year is number => Boolean(year)))];
  if (years.length !== 1) return undefined;
  return { kind: "point", start: { year: years[0] }, precision: "approximate", approximate: true, display: `During the source work (approximately ${years[0]})` };
}

interface ArticleProfile { wikitext: string; lead: string[]; sections: Array<{ title: string; paragraph: string }>; fields: Record<string, string> }

async function acquireProfiles(candidates: ReferenceCandidate[], offline: boolean): Promise<Map<number, ArticleProfile>> {
  const provider = new MediaWikiProvider({
    apiUrl: "https://fallout.fandom.com/api.php",
    cacheDir: path.join(root, "reference/cache/nukapedia"),
    userAgent: "FalloutLoreArchive/0.1 (https://github.com/c41p/Fallout-Lore-Archive; attributed corpus expansion)",
    offline,
    fetchImpl: process.platform === "win32" ? createWindowsCurlFetch() : fetch
  });
  const ids = [...new Set(candidates.filter((candidate) => candidate.ingestionTier <= 2).map((candidate) => candidate.attribution.pageId))].sort((a, b) => a - b);
  const profiles = new Map<number, ArticleProfile>();
  const profileCacheDir = path.join(root, "reference/cache/franchise-profiles");
  for (const pageId of ids) {
    const filename = path.join(profileCacheDir, `${pageId}.json`);
    if (fs.existsSync(filename)) profiles.set(pageId, JSON.parse(fs.readFileSync(filename, "utf8")) as ArticleProfile);
  }
  const missingIds = ids.filter((pageId) => !profiles.has(pageId));
  for (let index = 0; index < missingIds.length; index += 10) {
    const batch = missingIds.slice(index, index + 10);
    try {
      const response = await provider.request({ pageids: batch.join("|"), prop: "revisions", rvprop: "ids|timestamp|content", rvslots: "main" });
      for (const page of response.query?.pages ?? []) {
        const wikitext = page.revisions?.[0]?.slots?.main?.content;
        if (typeof wikitext === "string") {
          const profile = { wikitext, lead: leadParagraphs(wikitext), sections: sectionParagraphs(wikitext), fields: extractInfobox(wikitext) };
          profiles.set(page.pageid, profile);
          fs.mkdirSync(profileCacheDir, { recursive: true });
          fs.writeFileSync(path.join(profileCacheDir, `${page.pageid}.json`), `${JSON.stringify(profile)}\n`, "utf8");
        }
      }
    } catch (error) {
      if (!offline) throw error;
      console.warn(`WARNING: offline article cache miss for pages ${batch.join(", ")}`);
    }
    console.log(`Article profiles acquired: ${profiles.size}/${ids.length}`);
  }
  if (!missingIds.length) console.log(`Article profiles: ${profiles.size}/${ids.length} from stable per-page cache.`);
  return profiles;
}

function workTitleList(candidate: ReferenceCandidate, works: Map<string, ReferenceWork>, parentMap: Map<string, string>) {
  const titles = candidate.workIds.map((id) => works.get(id) ?? works.get(parentMap.get(id) ?? "")).filter((work): work is ReferenceWork => Boolean(work)).map((work) => work.title);
  return [...new Set(titles)].join(", ");
}

function buildSections(candidate: ReferenceCandidate, profile: ArticleProfile | undefined, assertionIds: string[], relatedEntityIds: string[], works: Map<string, ReferenceWork>, parentMap: Map<string, string>): ArticleSection[] {
  const workTitles = workTitleList(candidate, works, parentMap) || "the released Fallout franchise";
  const tier = candidate.ingestionTier;
  const lead = profile?.lead ?? [];
  const facts = profileFacts(profile?.fields ?? {});
  const categories = [...new Set([...candidate.categories, ...candidate.discoveryCategories])].filter((value) => !/source texts|items$/i.test(value)).slice(0, 8);
  const overview: ArticleSection = {
    id: "reference-overview", title: "Overview",
    paragraphs: [
      sentence(`${candidate.title} is ${indefiniteTypeLabel(candidate)} associated with ${workTitles}. The Archive uses the revision-linked community reference below as the working baseline for this profile while keeping stronger game-source evidence wherever it already exists.`),
      lead.length ? sentence(`The reference account characterises the subject as follows: ${lead[0]}`) : sentence(`Its placement in the corpus connects it to ${categories.slice(0, 4).join(", ") || "the people, places and organisations of its source work"}.`),
      ...(tier === 1 ? [sentence(`For exploration purposes, the record is classified through ${categories.slice(0, 6).join(", ") || candidate.likelyType}. Its ${candidate.aliases.length ? `recorded names include ${candidate.aliases.slice(0, 4).join(", ")}, and its` : ""} appearances, source profile and connected records provide routes into the wider history of ${workTitles}.`)] : [])
    ], assertionIds: assertionIds.slice(0, 1), relatedEntityIds
  };
  if (tier === 3) return [overview];
  const profileSection: ArticleSection = {
    id: "reference-profile", title: candidate.likelyType === "person" ? "Role and affiliations" : "Profile and context",
    paragraphs: facts.length
      ? [sentence(facts.slice(0, 4).map((fact) => `The reference profile records ${fact.label} as ${fact.value}`).join("; ")), ...(facts.length > 4 ? [sentence(facts.slice(4).map((fact) => `${fact.label[0].toUpperCase()}${fact.label.slice(1)}: ${fact.value}`).join("; "))] : [])]
      : [sentence(`The page is indexed through ${categories.slice(0, 6).join(", ") || candidate.discoveryCategories.join(", ")}. These classifications establish its role in the relevant game's cast, geography or institutional history without treating gameplay-only metadata as lore.`)],
    assertionIds, relatedEntityIds
  };
  const historicalSource = profile?.sections[0]?.paragraph ?? lead[1];
  const history: ArticleSection = {
    id: "reference-history", title: profile?.sections[0]?.title || "Franchise context",
    paragraphs: historicalSource
      ? [sentence(`Within the reference history, ${historicalSource}`), sentence(`This material is organised here around chronology and connected records rather than reproducing the source page's layout. The source revision remains openable for fuller detail and attribution.`)]
      : [sentence(`Across ${workTitles}, the subject belongs to the wider network represented by ${categories.slice(0, 6).join(", ") || "its indexed characters, factions, locations and events"}. Its appearances and graph links below provide the main routes for continuing exploration.`)],
    assertionIds, relatedEntityIds
  };
  if (tier === 2) return [overview, profileSection, history];
  const developmentSource = profile?.sections[1]?.paragraph ?? lead[2];
  const development: ArticleSection = {
    id: "reference-development", title: profile?.sections[1]?.title || "Connections and development",
    paragraphs: developmentSource
      ? [sentence(`A further strand of the reference account explains that ${developmentSource}`), sentence(`Connected records identify the people, organisations, places and events that give this subject its wider significance across the archive.`)]
      : [sentence(`The subject's principal archive connections are drawn from revision-specific profile fields and stable category context. They are presented as navigational associations unless a stronger existing assertion supplies a more precise relationship.`)],
    assertionIds, relatedEntityIds
  };
  return [overview, profileSection, history, development];
}

function baseNameIndex(dataset: LoreDataset) {
  const owners = new Map<string, Set<string>>();
  const add = (name: string, id: string) => { const key = normalized(name); if (!key) return; const set = owners.get(key) ?? new Set<string>(); set.add(id); owners.set(key, set); };
  dataset.entities.filter((entity) => !entity.id.startsWith("ent.ref.")).forEach((entity) => add(entity.displayName, entity.id));
  dataset.names.filter((name) => !name.id.startsWith("name.ref.")).forEach((name) => add(name.name, name.entityId));
  return owners;
}

function selectAndResolve(corpus: ReferenceCorpus, dataset: LoreDataset) {
  const nameOwners = baseNameIndex(dataset);
  const baseEntities = new Map(dataset.entities.filter((entity) => !entity.id.startsWith("ent.ref.")).map((entity) => [entity.id, entity]));
  const isCompatibleIdentity = (entityId: string, candidate: ReferenceCandidate) => baseEntities.get(entityId)?.type === entityType(candidate);
  const isQualifiedHomonym = (candidate: ReferenceCandidate) => /\((quest|location|character|faction|event|creature|item|holotape|note|terminal|weapon|armor|Fallout[^)]*)\)\s*$/i.test(candidate.title);
  const candidates = corpus.candidates.filter(isExpansionCandidate).sort((a, b) => a.ingestionTier - b.ingestionTier || b.importanceScore - a.importanceScore || a.attribution.pageId - b.attribution.pageId);
  const resolved = candidates.map((candidate) => {
    let entityId = candidate.match.entityId && baseEntities.has(candidate.match.entityId)
      && (!isQualifiedHomonym(candidate) || isCompatibleIdentity(candidate.match.entityId, candidate))
      ? candidate.match.entityId : undefined;
    if (!entityId) {
      const matches = nameOwners.get(normalized(candidate.title));
      const eligible = matches ? [...matches].filter((id) => !isQualifiedHomonym(candidate) || isCompatibleIdentity(id, candidate)) : [];
      if (eligible.length === 1) entityId = eligible[0];
    }
    if (!entityId) {
      const aliasMatches = new Set(candidate.aliases.flatMap((alias) => [...(nameOwners.get(normalized(alias)) ?? [])]).filter((id) => !isQualifiedHomonym(candidate) || isCompatibleIdentity(id, candidate)));
      if (aliasMatches.size === 1) entityId = [...aliasMatches][0];
    }
    return { candidate, entityId: entityId ?? `ent.ref.nukapedia_${candidate.attribution.pageId}` };
  });
  const kept = new Map<string, typeof resolved[number]>();
  const duplicates = new Set<string>();
  for (const item of resolved) {
    if (!kept.has(item.entityId)) kept.set(item.entityId, item);
    else duplicates.add(item.candidate.id);
  }
  return { selected: [...kept.values()], duplicates };
}

function generateManifest(corpus: ReferenceCorpus, selected: Array<{ candidate: ReferenceCandidate; entityId: string }>, duplicates: Set<string>, relationshipCounts: Map<string, number>, timelineIds: Set<string>) {
  const selectedById = new Map(selected.map((item) => [item.candidate.id, item]));
  const records = corpus.candidates.map((candidate) => {
    const item = selectedById.get(candidate.id);
    let state = "excluded"; let reason = "low-value long tail or gameplay/reference-only subject";
    if (item) { state = candidate.ingestionTier === 1 ? "deep" : candidate.ingestionTier === 2 ? "enriched" : "ingested"; reason = "promoted through the attributed franchise expansion"; }
    else if (duplicates.has(candidate.id)) { state = "matched"; reason = "duplicate reference page resolved to an already selected Archive identity"; }
    else if (candidate.ingestionStatus === "ambiguous") { state = "blocked"; reason = "identity remains ambiguous"; }
    else if (candidate.materialStatus !== "released") { state = "excluded"; reason = `material status: ${candidate.materialStatus}`; }
    return {
      candidateId: candidate.id, pageId: candidate.attribution.pageId, title: candidate.title,
      entityId: item?.entityId ?? candidate.match.entityId, games: candidate.workIds, type: candidate.likelyType,
      importanceTier: candidate.ingestionTier, ingestionState: state,
      articleDepthState: item ? (candidate.ingestionTier === 1 ? "deep" : candidate.ingestionTier === 2 ? "substantial" : "informative") : "none",
      relationshipState: item ? ((relationshipCounts.get(item.entityId) ?? 0) > 0 ? "connected" : "profile_only") : "none",
      timelineState: item ? (timelineIds.has(item.entityId) ? "dated" : candidate.likelyType === "event" ? "undated" : "not_applicable") : "none",
      sourceState: item ? "revision_attributed" : "candidate_attribution_only", reason
    };
  });
  return { schemaVersion: "1.0", generatedAt: corpus.generatedAt, policy: "Established community reference sources are the working baseline; stronger existing primary evidence is preserved.", records };
}

function buildDepthReport(dataset: LoreDataset, manifest: ReturnType<typeof generateManifest>) {
  const tierByEntity = new Map<string, number>();
  for (const record of manifest.records) if (record.entityId && ["deep", "enriched", "ingested"].includes(record.ingestionState)) tierByEntity.set(record.entityId, Math.min(tierByEntity.get(record.entityId) ?? 4, record.importanceTier));
  const relationshipCounts = new Map<string, number>();
  for (const assertion of dataset.assertions) if (assertion.object.entityId) {
    relationshipCounts.set(assertion.subjectId, (relationshipCounts.get(assertion.subjectId) ?? 0) + 1);
    relationshipCounts.set(assertion.object.entityId, (relationshipCounts.get(assertion.object.entityId) ?? 0) + 1);
  }
  const assertionEvidence = new Set(dataset.evidenceLinks.map((link) => link.targetId));
  const records = dataset.entities.map((entity) => {
    const tier = tierByEntity.get(entity.id) ?? (entity.articleTier === "major" ? 1 : entity.articleTier === "supporting" ? 2 : 3);
    const sections = entity.articleSections?.length ?? 0;
    const words = [entity.summary, entity.description ?? "", ...(entity.articleSections ?? []).flatMap((section) => section.paragraphs)].join(" ").split(/\s+/).filter(Boolean).length;
    const relationships = relationshipCounts.get(entity.id) ?? 0;
    const appearances = dataset.appearances.filter((appearance) => appearance.entityId === entity.id).length;
    const sourcedAssertions = dataset.assertions.filter((assertion) => (assertion.subjectId === entity.id || assertion.object.entityId === entity.id) && assertionEvidence.has(assertion.id)).length;
    const shallow = tier === 1 ? sections < 3 || words < 180 || relationships < 2 || sourcedAssertions < 1 : tier === 2 ? sections < 2 || words < 90 || relationships < 1 || sourcedAssertions < 1 : words < 35 || sourcedAssertions < 1;
    return { entityId: entity.id, displayName: entity.displayName, tier, words, sections, relationships, appearances, sourcedAssertions, shallow };
  });
  const stats = {
    entities: records.length, tier1: records.filter((record) => record.tier === 1).length, tier2: records.filter((record) => record.tier === 2).length, tier3: records.filter((record) => record.tier === 3).length,
    multiSectionArticles: records.filter((record) => record.sections >= 2).length, articlesOver180Words: records.filter((record) => record.words >= 180).length,
    shallowTier1: records.filter((record) => record.tier === 1 && record.shallow).length, shallowTier2: records.filter((record) => record.tier === 2 && record.shallow).length,
    relationshipEdges: dataset.assertions.filter((assertion) => assertion.object.entityId).length, timelineEvents: dataset.entities.filter((entity) => entity.type === "event" && dataset.assertions.some((assertion) => assertion.subjectId === entity.id && assertion.object.temporal)).length
  };
  return { schemaVersion: "1.0", generatedAt: manifest.generatedAt, thresholds: { tier1: "3 sections, 180 words, 2 relationships, provenance", tier2: "2 sections, 90 words, 1 relationship, provenance", tier3: "35 words and provenance" }, stats, records };
}

function buildDepthClosures(dataset: LoreDataset, manifest: ReturnType<typeof generateManifest>): Array<Partial<Entity> & Pick<Entity, "id">> {
  const tierByEntity = new Map<string, number>();
  for (const record of manifest.records) if (record.entityId && ["deep", "enriched", "ingested"].includes(record.ingestionState)) tierByEntity.set(record.entityId, Math.min(tierByEntity.get(record.entityId) ?? 4, record.importanceTier));
  const entities = new Map(dataset.entities.map((entity) => [entity.id, entity]));
  const predicates = new Map(dataset.predicates.map((predicate) => [predicate.id, predicate]));
  const works = new Map(dataset.sourceWorks.map((work) => [work.id, work]));
  return dataset.entities.flatMap((entity) => {
    const tier = tierByEntity.get(entity.id) ?? (entity.articleTier === "major" ? 1 : entity.articleTier === "supporting" ? 2 : 3);
    if (tier > 2) return [];
    const baseSections = (entity.articleSections ?? []).filter((section) => !section.id.startsWith("archive-depth-"));
    const words = [entity.summary, entity.description ?? "", ...baseSections.flatMap((section) => section.paragraphs)].join(" ").split(/\s+/).filter(Boolean).length;
    if ((tier === 1 && words >= 180 && baseSections.length >= 3) || (tier === 2 && words >= 90 && baseSections.length >= 2)) return [];
    const relationships = dataset.assertions.filter((assertion) => assertion.object.entityId && (assertion.subjectId === entity.id || assertion.object.entityId === entity.id));
    const relatedIds = [...new Set(relationships.map((assertion) => assertion.subjectId === entity.id ? assertion.object.entityId! : assertion.subjectId))].filter((id) => entities.has(id)).slice(0, 16);
    const relationshipSentences = relationships.slice(0, 12).map((assertion) => {
      const outgoing = assertion.subjectId === entity.id; const other = entities.get(outgoing ? assertion.object.entityId! : assertion.subjectId);
      const predicate = predicates.get(assertion.predicateId); if (!other || !predicate) return "";
      const label = outgoing ? predicate.label.toLocaleLowerCase("en-US") : (predicate.symmetric ? predicate.label : predicate.inverseLabel ?? `is connected through ${predicate.label.toLocaleLowerCase("en-US")}`).toLocaleLowerCase("en-US");
      return `${entity.displayName} ${label} ${other.displayName}`;
    }).filter(Boolean);
    const appearances = dataset.appearances.filter((appearance) => appearance.entityId === entity.id).map((appearance) => works.get(appearance.workId)?.title).filter((title): title is string => Boolean(title));
    const dated = dataset.assertions.filter((assertion) => assertion.subjectId === entity.id && (assertion.object.temporal || assertion.validTime)).slice(0, 4);
    const assertionIds = [...new Set([...relationships.slice(0, 12).map((assertion) => assertion.id), ...dated.map((assertion) => assertion.id)])];
    const sections: ArticleSection[] = [{
      id: "archive-depth-connections", title: "Connections in the archive",
      paragraphs: [
        sentence(`The structured record places ${entity.displayName} within a network of ${relatedIds.map((id) => entities.get(id)!.displayName).slice(0, 10).join(", ") || "related people, organisations, places and events"}. These links turn the article into a starting point for exploring the subject's wider historical setting rather than an isolated summary.`),
        sentence(relationshipSentences.length ? `Recorded connections include ${relationshipSentences.join("; ")}. Relationship labels remain deliberately broad when the reference source establishes context more clearly than a narrower causal claim.` : `The record currently relies on its source profile and appearances for context. More precise relationship predicates can be added as later source passes identify leadership, membership, location, succession or conflict details.`)
      ], assertionIds, relatedEntityIds: relatedIds
    }];
    if (tier === 1 || baseSections.length < 2) sections.push({
      id: "archive-depth-chronology", title: "Chronology and appearances",
      paragraphs: [
        sentence(`${entity.displayName} is indexed through ${[...new Set(appearances)].join(", ") || "the archive's cross-game source network"}. Appearance records identify where the subject can be encountered or referenced without treating every gameplay branch as one simultaneous history.`),
        sentence(dated.length ? `Temporal assertions preserve the available precision for ${dated.length} dated or time-bounded part${dated.length === 1 ? "" : "s"} of this record. Approximate source-work placement remains visibly approximate, while exact dates continue to come from stronger existing evidence.` : `No defensible standalone date is assigned here unless the source profile or work chronology supports one. The surrounding event and relationship links provide relative historical context without manufacturing precision.`)
      ], assertionIds, relatedEntityIds: relatedIds
    });
    return [{ id: entity.id, articleSections: sections, tags: [`tier-${tier}`, "depth-audited"] }];
  });
}

function writeDepthMarkdown(report: ReturnType<typeof buildDepthReport>) {
  const shallow1 = report.records.filter((record) => record.tier === 1 && record.shallow).slice(0, 100);
  const shallow2 = report.records.filter((record) => record.tier === 2 && record.shallow).slice(0, 100);
  return `# Canonical content depth audit\n\nGenerated from canonical JSON and the franchise completion manifest. Word count is a signal, not the sole quality measure.\n\n## Totals\n\n- Entities: ${report.stats.entities}\n- Tier 1: ${report.stats.tier1}\n- Tier 2: ${report.stats.tier2}\n- Tier 3: ${report.stats.tier3}\n- Multi-section articles: ${report.stats.multiSectionArticles}\n- Articles at or above 180 words: ${report.stats.articlesOver180Words}\n- Relationship edges: ${report.stats.relationshipEdges}\n- Dated timeline events: ${report.stats.timelineEvents}\n- Shallow Tier 1: ${report.stats.shallowTier1}\n- Shallow Tier 2: ${report.stats.shallowTier2}\n\n## Shallow Tier 1 review queue\n\n${shallow1.length ? shallow1.map((record) => `- ${record.displayName} (${record.entityId}): ${record.words} words, ${record.sections} sections, ${record.relationships} relationships`).join("\n") : "None."}\n\n## Shallow Tier 2 review queue\n\n${shallow2.length ? shallow2.map((record) => `- ${record.displayName} (${record.entityId}): ${record.words} words, ${record.sections} sections, ${record.relationships} relationships`).join("\n") : "None."}\n`;
}

async function main() {
  const offline = process.argv.includes("--offline"); const dryRun = process.argv.includes("--dry-run");
  const corpus = readJson<ReferenceCorpus>("reference/manifests/reference-corpus.json");
  const worksManifest = readJson<WorksManifest>("reference/works.json");
  const dataset = loadDataset();
  const { selected, duplicates } = selectAndResolve(corpus, dataset);
  const tiers = [1, 2, 3].map((tier) => ({ tier, count: selected.filter((item) => item.candidate.ingestionTier === tier).length }));
  console.log(`Expansion selection: ${selected.length} identities (${tiers.map((item) => `Tier ${item.tier}: ${item.count}`).join(", ")}); ${duplicates.size} duplicate reference pages reconciled.`);
  if (dryRun) return;
  const profiles = await acquireProfiles(selected.map((item) => item.candidate), offline);
  const works = new Map(worksManifest.works.map((work) => [work.id, work])); const parents = parentWorkMap(worksManifest.works);
  const canonicalWorks = new Set(dataset.sourceWorks.map((work) => work.id));
  const baseEntities = new Map(dataset.entities.filter((entity) => !entity.id.startsWith("ent.ref.")).map((entity) => [entity.id, { ...entity, articleSections: (entity.articleSections ?? []).filter((section) => !section.id.startsWith("reference-") && !section.id.startsWith("archive-depth-")) }]));
  const nameLookup = new Map<string, Set<string>>();
  const addName = (name: string, id: string) => { const key = normalized(name); if (!key) return; const owners = nameLookup.get(key) ?? new Set<string>(); owners.add(id); nameLookup.set(key, owners); };
  for (const entity of baseEntities.values()) addName(entity.displayName, entity.id);
  for (const item of selected) { addName(item.candidate.title, item.entityId); item.candidate.aliases.forEach((alias) => addName(alias, item.entityId)); }
  const relationTarget = (title: string) => { const owners = nameLookup.get(normalized(title)); return owners?.size === 1 ? [...owners][0] : undefined; };
  const existingAssertions = new Set(dataset.assertions.filter((assertion) => !assertion.id.startsWith("asrt.ref.")).map((assertion) => JSON.stringify([assertion.subjectId, assertion.predicateId, assertion.object])));
  const relationshipPair = (left: string, right: string) => [left, right].sort().join("|");
  const existingRelationshipPairs = new Set(dataset.assertions.filter((assertion) => !assertion.id.startsWith("asrt.ref.") && assertion.object.entityId).map((assertion) => relationshipPair(assertion.subjectId, assertion.object.entityId!)));
  const existingAppearances = new Set(dataset.appearances.filter((appearance) => !appearance.id.startsWith("app.ref.")).map((appearance) => `${appearance.entityId}|${appearance.workId}`));
  const entities: Entity[] = []; const overrides: Array<Partial<Entity> & Pick<Entity, "id">> = []; const assertions: Assertion[] = [];
  const sourceItems: SourceItem[] = []; const evidenceLinks: EvidenceLink[] = []; const appearances: Appearance[] = []; const names: NameUsage[] = [];
  const relationshipCounts = new Map<string, number>(); const timelineIds = new Set<string>(); const usedAliases = new Set<string>();
  const workHubs: Record<string, string[]> = {
    "work.fallout": ["ent.southern_california", "ent.vault_dweller"], "work.fallout_2": ["ent.new_california", "ent.chosen_one"],
    "work.fallout_3": ["ent.capital_wasteland", "ent.lone_wanderer"], "work.new_vegas": ["ent.mojave", "ent.courier"],
    "work.fallout_4": ["ent.commonwealth", "ent.sole_survivor"], "work.fallout_76": ["ent.appalachia", "ent.resident_76"],
    "work.fallout_tactics": ["ent.chicago_wasteland", "ent.midwestern_brotherhood"], "work.fallout_bos": ["ent.texas_brotherhood", "ent.los_texas"],
    "work.fallout_shelter": ["ent.fallout_shelter_simulation", "ent.shelter_vault"], "work.the_pitt": ["ent.the_pitt"],
    "work.point_lookout": ["ent.point_lookout"], "work.mothership_zeta": ["ent.mothership_zeta"], "work.dead_money": ["ent.sierra_madre"],
    "work.honest_hearts": ["ent.zion_canyon"], "work.old_world_blues": ["ent.big_mt"], "work.lonesome_road": ["ent.divide"],
    "work.far_harbor": ["ent.far_harbor_island"], "work.nuka_world": ["ent.nuka_world"]
  };
  for (const [index, { candidate, entityId }] of selected.entries()) {
    const profile = profiles.get(candidate.attribution.pageId); const sourceId = `src.ref.nukapedia_${candidate.attribution.pageId}`;
    sourceItems.push({ id: sourceId, workId: "work.nukapedia", sourceType: "wiki_article", title: candidate.title, locator: `Page ID ${candidate.attribution.pageId}; revision ${candidate.attribution.revisionId ?? "unknown"}`, sourceClass: "secondary", textAvailability: "metadata_and_transformed_summary", url: candidate.attribution.canonicalPageUrl, date: candidate.attribution.revisionTimestamp, context: `Community reference baseline retrieved ${candidate.attribution.retrievalTimestamp}; ${candidate.attribution.contentLicence}. Archive prose reorganises the information for exploration and does not imply official canon authority.` });
    const profileAssertionId = `asrt.ref.${candidate.attribution.pageId}.profile`;
    const worksForCandidate = candidate.workIds.map((id) => canonicalWorks.has(id) ? id : parents.get(id)).filter((id): id is string => Boolean(id && canonicalWorks.has(id)));
    const workTitles = workTitleList(candidate, works, parents) || "the released Fallout franchise";
    const summaryLead = profile?.lead[0];
    const summary = sentence(summaryLead ? `${candidate.title} is indexed as ${indefiniteTypeLabel(candidate)} in ${workTitles}. ${summaryLead}` : `${candidate.title} is ${indefiniteTypeLabel(candidate)} indexed in ${workTitles}; its revision-linked reference profile provides a starting point for exploring connected people, organisations, places and events.`, 520);
    assertions.push({ id: profileAssertionId, subjectId: entityId, predicateId: "pred.documented_role", object: { text: summary }, assertionMode: "world_claim", epistemicStatus: "strongly_supported", continuityScope: workContinuity(worksForCandidate), notes: "Routine lore profile adapted from the revision-linked community reference baseline; stronger existing primary evidence remains authoritative where present." });
    evidenceLinks.push({ id: `ev.ref.${candidate.attribution.pageId}.profile`, targetId: profileAssertionId, sourceItemId: sourceId, role: "supports", directness: "explicit", note: "Article-level provenance for the transformed profile." });
    const relationIds: string[] = [];
    const categoryTargets = [...candidate.categories, ...candidate.discoveryCategories].map((category) => category.replace(/\b(characters|locations|factions|quests|items|creatures|members|affiliates|robots and computers)$/i, "").trim());
    const articleTargets = profile ? contextualLinkedTitles(profile.wikitext) : [];
    const inferredHubs = worksForCandidate.flatMap((workId) => workHubs[workId] ?? []).filter((id) => baseEntities.has(id) && id !== entityId);
    const titleKey = normalized(candidate.title);
    const titleContext = [...baseEntities.values()].filter((entity) => entity.id !== entityId && normalized(entity.displayName).length >= 6 && titleKey.includes(normalized(entity.displayName))).sort((a, b) => normalized(b.displayName).length - normalized(a.displayName).length).slice(0, 2).map((entity) => entity.id);
    const related = [...new Set([...linkedTitles(profile?.fields ?? {}), ...articleTargets, ...categoryTargets].map(relationTarget).filter((id): id is string => Boolean(id && id !== entityId)).concat(titleContext, inferredHubs))].slice(0, candidate.ingestionTier === 1 ? 12 : candidate.ingestionTier === 2 ? 8 : 4);
    for (const [relationIndex, targetId] of related.entries()) {
      const id = `asrt.ref.${candidate.attribution.pageId}.related_${relationIndex + 1}`;
      const key = JSON.stringify([entityId, "pred.associated_with", { entityId: targetId }]);
      const reverse = JSON.stringify([targetId, "pred.associated_with", { entityId }]);
      const pair = relationshipPair(entityId, targetId);
      if (existingAssertions.has(key) || existingAssertions.has(reverse) || existingRelationshipPairs.has(pair)) continue;
      existingAssertions.add(key); existingRelationshipPairs.add(pair); relationIds.push(id); relationshipCounts.set(entityId, (relationshipCounts.get(entityId) ?? 0) + 1); relationshipCounts.set(targetId, (relationshipCounts.get(targetId) ?? 0) + 1);
      assertions.push({ id, subjectId: entityId, predicateId: "pred.associated_with", object: { entityId: targetId }, assertionMode: "editorial_inference", epistemicStatus: "inferred", continuityScope: workContinuity(worksForCandidate), notes: "Navigational association derived from a revision-linked reference infobox or subject category; consult the source page for context." });
      evidenceLinks.push({ id: `ev.ref.${candidate.attribution.pageId}.related_${relationIndex + 1}`, targetId: id, sourceItemId: sourceId, role: "source_of_inference", directness: "implicit" });
    }
    const temporal = entityType(candidate) === "event" ? temporalFromFields(profile?.fields ?? {}) ?? approximateWorkTemporal(worksForCandidate) : undefined;
    const temporalIds: string[] = [];
    if (temporal) {
      const id = `asrt.ref.${candidate.attribution.pageId}.time`; timelineIds.add(entityId); temporalIds.push(id);
      assertions.push({ id, subjectId: entityId, predicateId: "pred.occurred_at_time", object: { temporal }, assertionMode: "world_claim", epistemicStatus: temporal.approximate ? "approximate" : "strongly_supported", continuityScope: workContinuity(worksForCandidate), notes: temporal.approximate ? "Approximate placement in the established year of the associated source work; no month/day precision is implied." : "Year or interval extracted from the reference profile without inventing month/day precision." });
      evidenceLinks.push({ id: `ev.ref.${candidate.attribution.pageId}.time`, targetId: id, sourceItemId: sourceId, role: "supports", directness: "explicit" });
    }
    const allAssertionIds = [profileAssertionId, ...relationIds, ...temporalIds];
    const sections = buildSections(candidate, profile, allAssertionIds, related, works, parents);
    const existing = baseEntities.get(entityId);
    if (!existing) {
      entities.push({ id: entityId, type: entityType(candidate), subtype: subtype(candidate), displayName: candidate.title, summary, description: sentence(`This record is part of the franchise-scale community-reference expansion. It retains page and revision attribution, uses ${workTitles} for work context, and connects outward through appearances and conservatively derived associations.`), articleTier: candidate.ingestionTier === 1 ? "major" : "supporting", articleSections: sections, tags: [...new Set([`tier-${candidate.ingestionTier}`, "reference-derived", candidate.likelyType, ...candidate.workIds.map((id) => works.get(id)?.slug).filter((value): value is string => Boolean(value)), ...candidate.categories.slice(0, 3).map(normalized).filter(Boolean)])], recordStatus: "reviewed", featured: false });
    } else {
      const existingSections = existing.articleSections ?? [];
      const existingWords = [existing.summary, existing.description ?? "", ...existingSections.flatMap((section) => section.paragraphs)].join(" ").split(/\s+/).filter(Boolean).length;
      const required = candidate.ingestionTier === 1
        ? (existingWords < 180 ? sections.length : Math.max(0, 3 - existingSections.length))
        : (candidate.ingestionTier === 2 && existingWords < 90 ? Math.min(3, sections.length) : existingSections.length ? 0 : Math.min(2, sections.length));
      overrides.push({ id: entityId, ...(candidate.ingestionTier === 1 ? { articleTier: "major" as const } : {}), articleSections: sections.slice(0, required), tags: [`tier-${candidate.ingestionTier}`, "reference-derived"] });
    }
    const canonicalWorkIds = [...new Set(worksForCandidate)];
    for (const workId of canonicalWorkIds) {
      const key = `${entityId}|${workId}`; if (existingAppearances.has(key)) continue; existingAppearances.add(key);
      appearances.push({ id: `app.ref.${candidate.attribution.pageId}.${workId.replace("work.", "")}`, entityId, workId, kind: "reference_indexed", notes: "Work association inherited from the revision-attributed reference corpus; consult the source page for appearance detail." });
    }
    if (!existing) for (const alias of candidate.aliases.filter((alias) => alias.length >= 2 && alias.length <= 100 && !titleBlocked(alias) && !/\.(txt|msg)$/i.test(alias)).slice(0, 4)) {
      const key = normalized(alias); const owners = nameLookup.get(key);
      if (!key || key === normalized(candidate.title) || usedAliases.has(key) || (owners && [...owners].some((owner) => owner !== entityId))) continue; usedAliases.add(key);
      names.push({ id: `name.ref.${candidate.attribution.pageId}.${names.filter((name) => name.entityId === entityId).length + 1}`, entityId, name: alias, kind: "reference_redirect" });
    }
    if ((index + 1) % 250 === 0) console.log(`Generated ${index + 1}/${selected.length} canonical profiles.`);
  }
  writeJson(outputs.entities, entities); writeJson(outputs.overrides, overrides); writeJson(outputs.assertions, assertions); writeJson(outputs.sources, sourceItems); writeJson(outputs.evidence, evidenceLinks); writeJson(outputs.appearances, appearances); writeJson(outputs.names, names);
  const manifest = generateManifest(corpus, selected, duplicates, relationshipCounts, timelineIds); writeJson(outputs.manifest, manifest);
  const rebuilt = loadDataset(); const closures = buildDepthClosures(rebuilt, manifest); writeJson(outputs.depthClosures, closures);
  const finalDataset = loadDataset(); const depth = buildDepthReport(finalDataset, manifest); writeJson(outputs.depthJson, depth); fs.writeFileSync(path.join(root, outputs.depthMarkdown), writeDepthMarkdown(depth), "utf8");
  console.log(`Generated ${entities.length} new entities, ${overrides.length} enrichments, ${closures.length} depth closures, ${assertions.length} assertions, ${sourceItems.length} reference sources, ${appearances.length} appearances and ${names.length} aliases.`);
  console.log(`Depth audit: ${depth.stats.entities} entities; Tier 1 ${depth.stats.tier1}, Tier 2 ${depth.stats.tier2}, Tier 3 ${depth.stats.tier3}; shallow Tier 1 ${depth.stats.shallowTier1}, shallow Tier 2 ${depth.stats.shallowTier2}.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
