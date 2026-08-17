import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDataset } from "./lore";
import { createWindowsCurlFetch, MediaWikiProvider } from "./reference/providers";
import type { ReferenceCandidate, ReferenceCorpus, ReferenceWork, WorksManifest } from "./reference/types";
import type { Appearance, Assertion, Entity, EntityType, EvidenceLink, LoreDataset, NameUsage, ReferenceMapping, SourceItem, TemporalValue } from "../src/types";

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
  mappings: "lore/franchise/reference-mappings/reference-expansion.json",
  assertions: "lore/franchise/assertions/reference-expansion.json",
  sources: "lore/franchise/source-items/reference-expansion.json",
  evidence: "lore/franchise/evidence/reference-expansion.json",
  appearances: "lore/franchise/appearances/reference-expansion.json",
  names: "lore/franchise/names/reference-expansion.json",
  manifest: "reference/manifests/franchise-completion.json",
  coverageJson: "reference/reports/integrated-reference-coverage.json",
  coverageMarkdown: "reference/reports/integrated-reference-coverage.md"
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
  const curatedMappings = dataset.referenceMappings.filter((mapping) => mapping.id.startsWith("refmap.curated."));
  const curatedEntities = new Set(curatedMappings.map((mapping) => mapping.entityId));
  const curatedPages = new Set(curatedMappings.map((mapping) => mapping.pageId));
  const resolved = candidates.map((candidate) => {
    let entityId = candidate.match.entityId && baseEntities.has(candidate.match.entityId)
      && (!isQualifiedHomonym(candidate) || normalized(baseEntities.get(candidate.match.entityId)!.displayName) === normalized(candidate.title))
      ? candidate.match.entityId : undefined;
    if (!entityId) {
      const matches = nameOwners.get(normalized(candidate.title));
      const eligible = matches && !isQualifiedHomonym(candidate) ? [...matches].filter((id) => isCompatibleIdentity(id, candidate)) : [];
      if (eligible.length === 1) entityId = eligible[0];
    }
    if (!entityId) {
      const aliasMatches = new Set((isQualifiedHomonym(candidate) ? [] : candidate.aliases.flatMap((alias) => [...(nameOwners.get(normalized(alias)) ?? [])])).filter((id) => isCompatibleIdentity(id, candidate)));
      if (aliasMatches.size === 1) entityId = [...aliasMatches][0];
    }
    return { candidate, entityId: entityId ?? `ent.ref.nukapedia_${candidate.attribution.pageId}` };
  }).filter((item) => !curatedEntities.has(item.entityId) && !curatedPages.has(item.candidate.attribution.pageId));
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
      articleState: item ? "provider_mapped" : "none",
      relationshipState: item ? ((relationshipCounts.get(item.entityId) ?? 0) > 0 ? "connected" : "profile_only") : "none",
      timelineState: item ? (timelineIds.has(item.entityId) ? "dated" : candidate.likelyType === "event" ? "undated" : "not_applicable") : "none",
      sourceState: item ? "revision_attributed" : "candidate_attribution_only", reason
    };
  });
  return { schemaVersion: "1.0", generatedAt: corpus.generatedAt, policy: "Established community reference sources are the working baseline; stronger existing primary evidence is preserved.", records };
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
  const sourceItems: SourceItem[] = []; const evidenceLinks: EvidenceLink[] = []; const appearances: Appearance[] = []; const names: NameUsage[] = []; const referenceMappings: ReferenceMapping[] = [];
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
    const existing = baseEntities.get(entityId);
    const articleMode = existing && (existing.articleSections?.length ?? 0) > 0 ? "hybrid" as const : "reference" as const;
    referenceMappings.push({ id: `refmap.nukapedia.${candidate.attribution.pageId}`, entityId, providerId: "nukapedia", pageId: candidate.attribution.pageId, canonicalTitle: candidate.title, canonicalUrl: candidate.attribution.canonicalPageUrl, revisionId: candidate.attribution.revisionId, revisionTimestamp: candidate.attribution.revisionTimestamp, retrievedAt: candidate.attribution.retrievalTimestamp, articleMode });
    sourceItems.push({ id: sourceId, workId: "work.nukapedia", sourceType: "wiki_article", title: candidate.title, locator: `Page ID ${candidate.attribution.pageId}; revision ${candidate.attribution.revisionId ?? "unknown"}`, sourceClass: "secondary", textAvailability: "metadata_and_structured_extraction", url: candidate.attribution.canonicalPageUrl, date: candidate.attribution.revisionTimestamp, context: `Community reference baseline retrieved ${candidate.attribution.retrievalTimestamp}; ${candidate.attribution.contentLicence}. The page supplies revision-attributed reference reading and conservative structured extraction; it is not an official canon authority.` });
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
    if (!existing) {
      entities.push({ id: entityId, type: entityType(candidate), subtype: subtype(candidate), displayName: candidate.title, summary, description: sentence(`This structured record retains cross-game identity, appearances and exploration links. Its long-form article is loaded from the revision-attributed reference provider.`), articleMode, tags: [...new Set([`tier-${candidate.ingestionTier}`, "reference-mapped", candidate.likelyType, ...candidate.workIds.map((id) => works.get(id)?.slug).filter((value): value is string => Boolean(value)), ...candidate.categories.slice(0, 3).map(normalized).filter(Boolean)])], recordStatus: "reviewed", featured: false });
    } else {
      overrides.push({ id: entityId, articleMode, tags: [`tier-${candidate.ingestionTier}`, "reference-mapped"] });
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
  writeJson(outputs.entities, entities); writeJson(outputs.overrides, overrides); writeJson(outputs.mappings, referenceMappings); writeJson(outputs.assertions, assertions); writeJson(outputs.sources, sourceItems); writeJson(outputs.evidence, evidenceLinks); writeJson(outputs.appearances, appearances); writeJson(outputs.names, names);
  const manifest = generateManifest(corpus, selected, duplicates, relationshipCounts, timelineIds); writeJson(outputs.manifest, manifest);
  const finalDataset = loadDataset();
  const allMappings = finalDataset.referenceMappings;
  const coverage = { schemaVersion: "1.0", generatedAt: new Date().toISOString(), entities: finalDataset.entities.length, providerMapped: allMappings.length, referenceMode: allMappings.filter((mapping) => mapping.articleMode === "reference").length, hybridMode: allMappings.filter((mapping) => mapping.articleMode === "hybrid").length, relationshipEnriched: new Set(finalDataset.assertions.filter((assertion) => assertion.object.entityId).flatMap((assertion) => [assertion.subjectId, assertion.object.entityId!])).size, timelineEnriched: new Set(finalDataset.assertions.filter((assertion) => assertion.object.temporal).map((assertion) => assertion.subjectId)).size, spatiallyEnriched: new Set(finalDataset.spatialRepresentations.map((spatial) => spatial.placeId)).size, cachedAtRuntime: 0 };
  writeJson(outputs.coverageJson, coverage); fs.writeFileSync(path.join(root, outputs.coverageMarkdown), `# Integrated reference coverage\n\n- Structured entities: ${coverage.entities}\n- Provider mapped: ${coverage.providerMapped}\n- Reference mode: ${coverage.referenceMode}\n- Hybrid mode: ${coverage.hybridMode}\n- Relationship enriched: ${coverage.relationshipEnriched}\n- Timeline enriched: ${coverage.timelineEnriched}\n- Spatially enriched: ${coverage.spatiallyEnriched}\n\nRuntime cache coverage is user-specific and begins at zero in the packaged application.\n`, "utf8");
  console.log(`Generated ${entities.length} new structured entities, ${overrides.length} enrichments, ${referenceMappings.length} provider mappings, ${assertions.length} assertions, ${appearances.length} appearances and ${names.length} aliases.`);
  console.log(`Integration coverage: ${coverage.providerMapped}/${coverage.entities} entities provider mapped; ${coverage.relationshipEnriched} relationship enriched; ${coverage.timelineEnriched} timeline enriched; ${coverage.spatiallyEnriched} spatially enriched.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
