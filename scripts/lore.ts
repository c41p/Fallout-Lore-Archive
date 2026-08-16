import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import type { Assertion, ConditionSet, Entity, LoreDataset, OutcomeGroup, TemporalValue } from "../src/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")) as T;
}

function readArrayShards<T>(directory: string): T[] {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute).filter((name) => name.endsWith(".json")).sort().flatMap((name) => readJson<T[]>(path.join(directory, name)));
}

export function loadDataset(): LoreDataset {
  const sources = readJson<Pick<LoreDataset, "sourceWorks" | "sourceItems">>("lore/sources/sources.json");
  const falloutSources = readJson<Pick<LoreDataset, "sourceWorks" | "sourceItems">>("lore/fallout1/sources.json");
  const franchiseSources = readJson<Pick<LoreDataset, "sourceWorks" | "sourceItems">>("lore/franchise/sources.json");
  const entityOverrides = [...readJson<Array<Partial<Entity> & Pick<Entity, "id">>>("lore/fallout1/entity-overrides.json"), ...readArrayShards<Partial<Entity> & Pick<Entity, "id">>("lore/franchise/overrides")];
  const baseEntities = [...readJson<Entity[]>("lore/entities/entities.json"), ...readArrayShards<Entity>("lore/fallout1/entities"), ...readArrayShards<Entity>("lore/franchise/entities")];
  const entities = baseEntities.map((entity) => {
    const overrides = entityOverrides.filter((candidate) => candidate.id === entity.id);
    return overrides.reduce<Entity>((current, override) => ({
      ...current,
      ...override,
      articleSections: [...(current.articleSections ?? []), ...(override.articleSections ?? [])],
      tags: [...new Set([...(current.tags ?? []), ...(override.tags ?? [])])]
    }), entity);
  });
  return {
    schemaVersion: "0.1",
    entities,
    names: [...readJson<LoreDataset["names"]>("lore/names/names.json"), ...readArrayShards<LoreDataset["names"][number]>("lore/fallout1/names"), ...readArrayShards<LoreDataset["names"][number]>("lore/franchise/names")],
    predicates: readJson("lore/vocabularies/predicates.json"),
    assertions: [...readJson<Assertion[]>("lore/assertions/assertions.json"), ...readArrayShards<Assertion>("lore/fallout1/assertions"), ...readArrayShards<Assertion>("lore/franchise/assertions")],
    sourceWorks: [...sources.sourceWorks, ...falloutSources.sourceWorks, ...franchiseSources.sourceWorks],
    sourceItems: [...sources.sourceItems, ...falloutSources.sourceItems, ...franchiseSources.sourceItems, ...readArrayShards<LoreDataset["sourceItems"][number]>("lore/franchise/source-items")],
    evidenceLinks: [...readJson<LoreDataset["evidenceLinks"]>("lore/evidence/evidence.json"), ...readArrayShards<LoreDataset["evidenceLinks"][number]>("lore/fallout1/evidence"), ...readArrayShards<LoreDataset["evidenceLinks"][number]>("lore/franchise/evidence")],
    spatialRepresentations: [...readJson<LoreDataset["spatialRepresentations"]>("lore/spatial/spatial.json"), ...readArrayShards<LoreDataset["spatialRepresentations"][number]>("lore/fallout1/spatial"), ...readArrayShards<LoreDataset["spatialRepresentations"][number]>("lore/franchise/spatial")],
    appearances: [...readJson<LoreDataset["appearances"]>("lore/appearances/appearances.json"), ...readArrayShards<LoreDataset["appearances"][number]>("lore/fallout1/appearances"), ...readArrayShards<LoreDataset["appearances"][number]>("lore/franchise/appearances")],
    disputes: [...readJson<LoreDataset["disputes"]>("lore/disputes/disputes.json"), ...readArrayShards<LoreDataset["disputes"][number]>("lore/fallout1/disputes"), ...readArrayShards<LoreDataset["disputes"][number]>("lore/franchise/disputes")],
    conditionSets: [...readArrayShards<ConditionSet>("lore/fallout1/conditions"), ...readArrayShards<ConditionSet>("lore/franchise/conditions")],
    outcomeGroups: [...readArrayShards<OutcomeGroup>("lore/fallout1/outcomes"), ...readArrayShards<OutcomeGroup>("lore/franchise/outcomes")]
  };
}

export interface ValidationReport { errors: string[]; warnings: string[] }
export interface QualityReport { errors: string[]; warnings: string[]; metrics: Record<string, number> }

function idIndex(dataset: LoreDataset): Map<string, string> {
  const records: Array<[string, Array<{ id: string }>]> = [
    ["entity", dataset.entities], ["name", dataset.names], ["predicate", dataset.predicates],
    ["assertion", dataset.assertions], ["source work", dataset.sourceWorks], ["source item", dataset.sourceItems],
    ["evidence link", dataset.evidenceLinks], ["spatial representation", dataset.spatialRepresentations],
    ["appearance", dataset.appearances], ["dispute", dataset.disputes],
    ["condition set", dataset.conditionSets], ["outcome group", dataset.outcomeGroups]
  ];
  const index = new Map<string, string>();
  for (const [family, values] of records) {
    for (const value of values) {
      const previous = index.get(value.id);
      if (previous) index.set(value.id, `${previous}|duplicate:${family}`);
      else index.set(value.id, family);
    }
  }
  return index;
}

function checkTemporal(value: TemporalValue | undefined, context: string, entities: Set<string>, errors: string[]) {
  if (!value) return;
  const validateDate = (date: TemporalValue["start"], label: string) => {
    if (!date) return;
    if (date.day && !date.month) errors.push(`${context}.${label}: day requires month`);
    if (date.month === 2 && date.day && date.day > 29) errors.push(`${context}.${label}: invalid February day`);
    if ([4, 6, 9, 11].includes(date.month ?? 0) && date.day && date.day > 30) errors.push(`${context}.${label}: invalid day for month`);
  };
  validateDate(value.start, "start");
  validateDate(value.end, "end");
  if (value.kind === "point" && !value.start) errors.push(`${context}: point requires start`);
  if (value.kind === "interval" && !value.start && !value.end) errors.push(`${context}: interval requires a bound`);
  if (value.kind === "relative" && !value.relativeConstraints?.length) errors.push(`${context}: relative time requires constraints`);
  for (const constraint of value.relativeConstraints ?? []) {
    if (!entities.has(constraint.entityId)) errors.push(`${context}: missing relative-time entity ${constraint.entityId}`);
  }
}

export function validateDataset(dataset: LoreDataset): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const schema = readJson<object>("schema/dataset.schema.json");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(dataset)) {
    for (const error of validate.errors ?? []) errors.push(`schema${error.instancePath}: ${error.message}`);
  }

  const allIds = idIndex(dataset);
  for (const [id, family] of allIds) if (family.includes("|duplicate:")) errors.push(`${id}: duplicate ID across ${family}`);

  const entities = new Map(dataset.entities.map((entity) => [entity.id, entity]));
  const entityIds = new Set(entities.keys());
  const predicates = new Map(dataset.predicates.map((predicate) => [predicate.id, predicate]));
  const assertions = new Set(dataset.assertions.map((assertion) => assertion.id));
  const works = new Set(dataset.sourceWorks.map((work) => work.id));
  const items = new Set(dataset.sourceItems.map((item) => item.id));
  const conditions = new Set(dataset.conditionSets.map((condition) => condition.id));

  for (const name of dataset.names) if (!entityIds.has(name.entityId)) errors.push(`${name.id}: missing entity ${name.entityId}`);
  const namesByEntity = new Map<string, Set<string>>();
  const globalNames = new Map<string, Set<string>>();
  for (const name of dataset.names) {
    const normalized = name.name.toLocaleLowerCase("en-GB").trim();
    const local = namesByEntity.get(name.entityId) ?? new Set<string>();
    if (local.has(normalized)) errors.push(`${name.id}: duplicate alias '${name.name}' for ${name.entityId}`);
    local.add(normalized); namesByEntity.set(name.entityId, local);
    const owners = globalNames.get(normalized) ?? new Set<string>(); owners.add(name.entityId); globalNames.set(normalized, owners);
  }
  for (const entity of dataset.entities) {
    const normalized = entity.displayName.toLocaleLowerCase("en-GB").trim();
    const owners = globalNames.get(normalized) ?? new Set<string>(); owners.add(entity.id); globalNames.set(normalized, owners);
    const sectionIds = new Set<string>();
    for (const section of entity.articleSections ?? []) {
      if (sectionIds.has(section.id)) errors.push(`${entity.id}: duplicate article section ID ${section.id}`);
      sectionIds.add(section.id);
      for (const assertionId of section.assertionIds) if (!assertions.has(assertionId)) errors.push(`${entity.id}.${section.id}: missing supporting assertion ${assertionId}`);
      for (const relatedId of section.relatedEntityIds ?? []) if (!entityIds.has(relatedId)) errors.push(`${entity.id}.${section.id}: missing related entity ${relatedId}`);
    }
  }
  for (const [name, owners] of globalNames) if (owners.size > 1) warnings.push(`alias collision '${name}' across ${[...owners].join(", ")}`);

  for (const assertion of dataset.assertions) {
    const subject = entities.get(assertion.subjectId);
    const predicate = predicates.get(assertion.predicateId);
    if (!subject) errors.push(`${assertion.id}: missing subject ${assertion.subjectId}`);
    if (!predicate) errors.push(`${assertion.id}: unknown predicate ${assertion.predicateId}`);
    if (subject && predicate && !predicate.subjectTypes.includes(subject.type)) errors.push(`${assertion.id}: ${subject.type} is not allowed for ${predicate.id}`);
    if (assertion.object.entityId) {
      const object = entities.get(assertion.object.entityId);
      if (!object) errors.push(`${assertion.id}: missing object entity ${assertion.object.entityId}`);
      else if (predicate && !(predicate.objectTypes as string[]).includes(object.type)) errors.push(`${assertion.id}: ${object.type} object is not allowed for ${predicate.id}`);
    }
    if (assertion.object.temporal && predicate && !(predicate.objectTypes as string[]).includes("temporal")) errors.push(`${assertion.id}: temporal object is not allowed for ${predicate.id}`);
    if (assertion.object.text && predicate && !(predicate.objectTypes as string[]).includes("text")) errors.push(`${assertion.id}: text object is not allowed for ${predicate.id}`);
    checkTemporal(assertion.object.temporal, `${assertion.id}.object.temporal`, entityIds, errors);
    checkTemporal(assertion.validTime, `${assertion.id}.validTime`, entityIds, errors);
    if (assertion.conditionSetId && !conditions.has(assertion.conditionSetId)) errors.push(`${assertion.id}: missing condition set ${assertion.conditionSetId}`);
    if (assertion.validTime && predicate && !predicate.temporalAllowed && assertion.object.entityId) warnings.push(`${assertion.id}: predicate ${predicate.id} does not explicitly declare temporal applicability`);
  }
  for (const item of dataset.sourceItems) {
    if (!works.has(item.workId)) errors.push(`${item.id}: missing source work ${item.workId}`);
    if (item.url) {
      try { const parsed = new URL(item.url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol'); }
      catch { errors.push(`${item.id}: malformed source URL ${item.url}`); }
    }
  }
  for (const evidence of dataset.evidenceLinks) {
    if (!assertions.has(evidence.targetId)) errors.push(`${evidence.id}: missing target assertion ${evidence.targetId}`);
    if (!items.has(evidence.sourceItemId)) errors.push(`${evidence.id}: missing source item ${evidence.sourceItemId}`);
  }
  for (const spatial of dataset.spatialRepresentations) {
    const place = entities.get(spatial.placeId);
    if (!place) errors.push(`${spatial.id}: missing place ${spatial.placeId}`);
    else if (place.type !== "place") errors.push(`${spatial.id}: spatial target ${spatial.placeId} is not a place`);
    if (spatial.geometryKind === "exact_point" && spatial.confidence.includes("inferred")) errors.push(`${spatial.id}: exact geometry cannot have inferred confidence`);
  }
  for (const appearance of dataset.appearances) {
    if (!entityIds.has(appearance.entityId)) errors.push(`${appearance.id}: missing entity ${appearance.entityId}`);
    if (!works.has(appearance.workId)) errors.push(`${appearance.id}: missing work ${appearance.workId}`);
  }
  for (const dispute of dataset.disputes) {
    for (const assertionId of dispute.assertionIds) if (!assertions.has(assertionId)) errors.push(`${dispute.id}: missing assertion ${assertionId}`);
    for (const entityId of dispute.topicEntityIds) if (!entityIds.has(entityId)) errors.push(`${dispute.id}: missing topic entity ${entityId}`);
  }
  for (const group of dataset.outcomeGroups) {
    for (const assertionId of group.assertionIds) if (!assertions.has(assertionId)) errors.push(`${group.id}: missing outcome assertion ${assertionId}`);
    for (const entityId of group.topicEntityIds) if (!entityIds.has(entityId)) errors.push(`${group.id}: missing outcome topic ${entityId}`);
    for (const assertionId of group.assertionIds) if (!dataset.assertions.find((assertion) => assertion.id === assertionId)?.conditionSetId) errors.push(`${group.id}: outcome assertion ${assertionId} has no condition set`);
  }
  for (const work of dataset.sourceWorks) for (const entityId of work.featuredEntityIds ?? []) if (!entityIds.has(entityId)) errors.push(`${work.id}: missing featured entity ${entityId}`);

  const relativeEdges = new Map<string, string[]>();
  for (const assertion of dataset.assertions) {
    for (const constraint of assertion.object.temporal?.relativeConstraints ?? assertion.validTime?.relativeConstraints ?? []) {
      const edges = relativeEdges.get(assertion.subjectId) ?? [];
      edges.push(constraint.entityId); relativeEdges.set(assertion.subjectId, edges);
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of relativeEdges.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  for (const id of relativeEdges.keys()) if (visit(id)) { errors.push(`relative temporal constraints contain a cycle involving ${id}`); break; }

  return { errors, warnings };
}

function normalizeAssertion(assertion: Assertion): string {
  return JSON.stringify({ subjectId: assertion.subjectId, predicateId: assertion.predicateId, object: assertion.object, validTime: assertion.validTime, continuityScope: assertion.continuityScope, conditionSetId: assertion.conditionSetId });
}

export function analyseContentQuality(dataset: LoreDataset): QualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const evidenceTargets = new Set(dataset.evidenceLinks.map((link) => link.targetId));
  const linkedEntities = new Set<string>();
  const assertionKeys = new Map<string, string>();
  for (const assertion of dataset.assertions) {
    if (assertion.object.entityId) { linkedEntities.add(assertion.subjectId); linkedEntities.add(assertion.object.entityId); }
    if (!evidenceTargets.has(assertion.id)) warnings.push(`${assertion.id}: assertion has no EvidenceLink`);
    const key = normalizeAssertion(assertion);
    const previous = assertionKeys.get(key);
    if (previous) errors.push(`${assertion.id}: suspicious duplicate of ${previous}`); else assertionKeys.set(key, assertion.id);
  }
  for (const entity of dataset.entities) {
    const backed = dataset.assertions.some((assertion) => (assertion.subjectId === entity.id || assertion.object.entityId === entity.id) && evidenceTargets.has(assertion.id));
    if (!backed) warnings.push(`${entity.id}: entity has no source-backed assertion`);
    if (!linkedEntities.has(entity.id)) warnings.push(`${entity.id}: entity is orphaned from the relationship graph`);
    if (entity.articleTier === "major" && (entity.articleSections?.length ?? 0) < 3) errors.push(`${entity.id}: major entity needs at least three article sections`);
  }
  for (const event of dataset.entities.filter((entity) => entity.type === "event")) {
    if (!dataset.assertions.some((assertion) => assertion.subjectId === event.id && assertion.object.temporal)) warnings.push(`${event.id}: timeline event lacks temporal information`);
  }
  for (const spatial of dataset.spatialRepresentations) if (!spatial.precision || !spatial.basis) errors.push(`${spatial.id}: mapped place lacks precision or basis metadata`);
  const falloutEntityIds = new Set(dataset.appearances.filter((appearance) => appearance.workId === "work.fallout").map((appearance) => appearance.entityId));
  const falloutAssertionIds = new Set(dataset.assertions.filter((assertion) => falloutEntityIds.has(assertion.subjectId)).map((assertion) => assertion.id));
  return { errors, warnings, metrics: { entities: dataset.entities.length, majorEntities: dataset.entities.filter((e) => e.articleTier === "major").length, assertions: dataset.assertions.length, sourcedAssertions: evidenceTargets.size, orphanedEntities: dataset.entities.filter((e) => !linkedEntities.has(e.id)).length, falloutEntities: falloutEntityIds.size, falloutAssertions: falloutAssertionIds.size, sourcedFalloutAssertions: [...falloutAssertionIds].filter((id) => evidenceTargets.has(id)).length, conditionSets: dataset.conditionSets.length, outcomeGroups: dataset.outcomeGroups.length } };
}

function temporalSortKey(value?: TemporalValue): number | null {
  const date = value?.start ?? value?.end;
  if (!date) return null;
  return date.year * 10000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}

export function buildDatabase(dataset: LoreDataset, outputPath = path.join(root, "generated/fallout-lore.db")) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  const quote = (value: unknown) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
  const number = (value: number | null) => value == null ? "NULL" : String(value);
  const statements: string[] = [`
    PRAGMA foreign_keys = ON;
    BEGIN IMMEDIATE;
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE entities (id TEXT PRIMARY KEY, type TEXT NOT NULL, subtype TEXT NOT NULL, display_name TEXT NOT NULL, summary TEXT NOT NULL, description TEXT, article_tier TEXT, article_json TEXT NOT NULL, tags_json TEXT NOT NULL, status TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE names (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), name TEXT NOT NULL, kind TEXT NOT NULL, preferred INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE predicates (id TEXT PRIMARY KEY, data_json TEXT NOT NULL);
    CREATE TABLE condition_sets (id TEXT PRIMARY KEY, data_json TEXT NOT NULL);
    CREATE TABLE assertions (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES entities(id), predicate_id TEXT NOT NULL REFERENCES predicates(id), object_entity_id TEXT REFERENCES entities(id), object_json TEXT NOT NULL, mode TEXT NOT NULL, epistemic_status TEXT NOT NULL, valid_time_json TEXT, sort_key INTEGER, continuity_json TEXT NOT NULL, condition_set_id TEXT REFERENCES condition_sets(id), notes TEXT);
    CREATE TABLE source_works (id TEXT PRIMARY KEY, data_json TEXT NOT NULL);
    CREATE TABLE source_items (id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES source_works(id), data_json TEXT NOT NULL);
    CREATE TABLE evidence_links (id TEXT PRIMARY KEY, target_id TEXT NOT NULL REFERENCES assertions(id), source_item_id TEXT NOT NULL REFERENCES source_items(id), data_json TEXT NOT NULL);
    CREATE TABLE spatial_representations (id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES entities(id), latitude REAL NOT NULL, longitude REAL NOT NULL, geometry_kind TEXT NOT NULL, data_json TEXT NOT NULL);
    CREATE TABLE appearances (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), work_id TEXT NOT NULL REFERENCES source_works(id), data_json TEXT NOT NULL);
    CREATE TABLE disputes (id TEXT PRIMARY KEY, data_json TEXT NOT NULL);
    CREATE TABLE dispute_assertions (dispute_id TEXT NOT NULL REFERENCES disputes(id), assertion_id TEXT NOT NULL REFERENCES assertions(id), PRIMARY KEY(dispute_id, assertion_id));
    CREATE TABLE dispute_topics (dispute_id TEXT NOT NULL REFERENCES disputes(id), entity_id TEXT NOT NULL REFERENCES entities(id), PRIMARY KEY(dispute_id, entity_id));
    CREATE TABLE outcome_groups (id TEXT PRIMARY KEY, data_json TEXT NOT NULL);
    CREATE TABLE outcome_assertions (group_id TEXT NOT NULL REFERENCES outcome_groups(id), assertion_id TEXT NOT NULL REFERENCES assertions(id), PRIMARY KEY(group_id, assertion_id));
    CREATE TABLE outcome_topics (group_id TEXT NOT NULL REFERENCES outcome_groups(id), entity_id TEXT NOT NULL REFERENCES entities(id), PRIMARY KEY(group_id, entity_id));
    CREATE VIRTUAL TABLE entity_fts USING fts5(id UNINDEXED, display_name, aliases, summary, description, article, tags, tokenize='unicode61 remove_diacritics 2');
    CREATE INDEX idx_entities_type ON entities(type, display_name);
    CREATE INDEX idx_assertions_subject ON assertions(subject_id);
    CREATE INDEX idx_assertions_object ON assertions(object_entity_id);
    CREATE INDEX idx_assertions_timeline ON assertions(sort_key) WHERE sort_key IS NOT NULL;
    CREATE INDEX idx_evidence_target ON evidence_links(target_id);
    CREATE INDEX idx_spatial_place ON spatial_representations(place_id);
  `];
  statements.push(`INSERT INTO metadata VALUES ('schema_version', ${quote(dataset.schemaVersion)});`);
  statements.push(`INSERT INTO metadata VALUES ('entity_count', ${quote(dataset.entities.length)});`);
  for (const e of dataset.entities) statements.push(`INSERT INTO entities VALUES (${quote(e.id)},${quote(e.type)},${quote(e.subtype)},${quote(e.displayName)},${quote(e.summary)},${quote(e.description)},${quote(e.articleTier)},${quote(JSON.stringify(e.articleSections ?? []))},${quote(JSON.stringify(e.tags))},${quote(e.recordStatus)},${e.featured ? 1 : 0});`);
  for (const n of dataset.names) statements.push(`INSERT INTO names VALUES (${quote(n.id)},${quote(n.entityId)},${quote(n.name)},${quote(n.kind)},${n.preferred ? 1 : 0});`);
  for (const p of dataset.predicates) statements.push(`INSERT INTO predicates VALUES (${quote(p.id)},${quote(JSON.stringify(p))});`);
  for (const condition of dataset.conditionSets) statements.push(`INSERT INTO condition_sets VALUES (${quote(condition.id)},${quote(JSON.stringify(condition))});`);
  for (const a of dataset.assertions) statements.push(`INSERT INTO assertions VALUES (${quote(a.id)},${quote(a.subjectId)},${quote(a.predicateId)},${quote(a.object.entityId)},${quote(JSON.stringify(a.object))},${quote(a.assertionMode)},${quote(a.epistemicStatus)},${quote(a.validTime ? JSON.stringify(a.validTime) : null)},${number(temporalSortKey(a.object.temporal))},${quote(JSON.stringify(a.continuityScope))},${quote(a.conditionSetId)},${quote(a.notes)});`);
  for (const w of dataset.sourceWorks) statements.push(`INSERT INTO source_works VALUES (${quote(w.id)},${quote(JSON.stringify(w))});`);
  for (const i of dataset.sourceItems) statements.push(`INSERT INTO source_items VALUES (${quote(i.id)},${quote(i.workId)},${quote(JSON.stringify(i))});`);
  for (const e of dataset.evidenceLinks) statements.push(`INSERT INTO evidence_links VALUES (${quote(e.id)},${quote(e.targetId)},${quote(e.sourceItemId)},${quote(JSON.stringify(e))});`);
  for (const s of dataset.spatialRepresentations) statements.push(`INSERT INTO spatial_representations VALUES (${quote(s.id)},${quote(s.placeId)},${s.latitude},${s.longitude},${quote(s.geometryKind)},${quote(JSON.stringify(s))});`);
  for (const a of dataset.appearances) statements.push(`INSERT INTO appearances VALUES (${quote(a.id)},${quote(a.entityId)},${quote(a.workId)},${quote(JSON.stringify(a))});`);
  for (const d of dataset.disputes) {
    statements.push(`INSERT INTO disputes VALUES (${quote(d.id)},${quote(JSON.stringify(d))});`);
    d.assertionIds.forEach((id) => statements.push(`INSERT INTO dispute_assertions VALUES (${quote(d.id)},${quote(id)});`));
    d.topicEntityIds.forEach((id) => statements.push(`INSERT INTO dispute_topics VALUES (${quote(d.id)},${quote(id)});`));
  }
  for (const group of dataset.outcomeGroups) {
    statements.push(`INSERT INTO outcome_groups VALUES (${quote(group.id)},${quote(JSON.stringify(group))});`);
    group.assertionIds.forEach((id) => statements.push(`INSERT INTO outcome_assertions VALUES (${quote(group.id)},${quote(id)});`));
    group.topicEntityIds.forEach((id) => statements.push(`INSERT INTO outcome_topics VALUES (${quote(group.id)},${quote(id)});`));
  }
  const aliases = new Map<string, string[]>();
  dataset.names.forEach((n) => aliases.set(n.entityId, [...(aliases.get(n.entityId) ?? []), n.name]));
  for (const e of dataset.entities) statements.push(`INSERT INTO entity_fts VALUES (${quote(e.id)},${quote(e.displayName)},${quote((aliases.get(e.id) ?? []).join(" "))},${quote(e.summary)},${quote(e.description ?? "")},${quote((e.articleSections ?? []).flatMap((section) => [section.title, ...section.paragraphs]).join(" "))},${quote(e.tags.join(" "))});`);
  statements.push("COMMIT; PRAGMA optimize; PRAGMA foreign_key_check;");
  const sqlite = process.env.FLA_SQLITE3 ?? "sqlite3";
  const result = spawnSync(sqlite, [outputPath], { input: statements.join("\n"), encoding: "utf8", windowsHide: true });
  if (result.error) throw new Error(`Unable to run sqlite3 (${sqlite}): ${result.error.message}`);
  if (result.status !== 0) throw new Error(`SQLite build failed: ${result.stderr || result.stdout}`);
  if (result.stdout.trim()) throw new Error(`SQLite foreign-key check reported: ${result.stdout.trim()}`);

  const publicDir = path.join(root, "public/data");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "runtime.json"), `${JSON.stringify(dataset)}\n`, "utf8");
}

function main() {
  const command = process.argv[2] ?? "validate";
  const dataset = loadDataset();
  const report = validateDataset(dataset);
  for (const warning of report.warnings) console.warn(`WARNING: ${warning}`);
  if (report.errors.length) {
    report.errors.forEach((error) => console.error(`ERROR: ${error}`));
    process.exitCode = 1; return;
  }
  console.log(`Validated ${dataset.entities.length} entities, ${dataset.assertions.length} assertions and ${dataset.evidenceLinks.length} evidence links.`);
  if (command === "quality") {
    const quality = analyseContentQuality(dataset);
    console.log(JSON.stringify(quality, null, 2));
    if (quality.errors.length) process.exitCode = 1;
  } else if (command === "build") {
    buildDatabase(dataset);
    console.log("Built generated/fallout-lore.db and public/data/runtime.json.");
  } else if (command !== "validate") {
    console.error(`Unknown command '${command}'. Use validate, quality or build.`); process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
