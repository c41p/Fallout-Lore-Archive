import { invoke } from "@tauri-apps/api/core";
import type { Assertion, AssertionView, Entity, EntityDetail, EvidenceView, GameProfile, LoreDataset, MapLocation, RelationshipView, SearchFilters, SearchResult, SourceWork, TimelineEntry } from "../types";

let datasetPromise: Promise<LoreDataset> | undefined;
const isTauri = () => "__TAURI_INTERNALS__" in window;

async function data(): Promise<LoreDataset> {
  datasetPromise ??= fetch("/data/runtime.json").then(async (response) => {
    if (!response.ok) throw new Error(`Local dataset could not be loaded (${response.status}). Rebuild it with pnpm lore:build.`);
    return response.json() as Promise<LoreDataset>;
  });
  return datasetPromise;
}

function evidenceFor(dataset: LoreDataset, assertionId: string): EvidenceView[] {
  return dataset.evidenceLinks.filter((link) => link.targetId === assertionId).flatMap((link) => {
    const item = dataset.sourceItems.find((candidate) => candidate.id === link.sourceItemId);
    const work = item && dataset.sourceWorks.find((candidate) => candidate.id === item.workId);
    return item && work ? [{ link, item, work }] : [];
  });
}

function assertionView(dataset: LoreDataset, assertion: Assertion): AssertionView {
  const predicate = dataset.predicates.find((candidate) => candidate.id === assertion.predicateId)!;
  const objectEntity = assertion.object.entityId ? dataset.entities.find((entity) => entity.id === assertion.object.entityId) : undefined;
  const conditionSet = assertion.conditionSetId ? dataset.conditionSets.find((condition) => condition.id === assertion.conditionSetId) : undefined;
  return { assertion, predicate, objectEntity, conditionSet, evidence: evidenceFor(dataset, assertion.id) };
}

function entityDetail(dataset: LoreDataset, id: string): EntityDetail | null {
  const entity = dataset.entities.find((candidate) => candidate.id === id);
  if (!entity) return null;
  const relationships: RelationshipView[] = [];
  const relationshipKeys = new Set<string>();
  for (const assertion of dataset.assertions) {
    if (!assertion.object.entityId) continue;
    const predicate = dataset.predicates.find((candidate) => candidate.id === assertion.predicateId)!;
    const otherId = assertion.subjectId === id ? assertion.object.entityId : assertion.object.entityId === id ? assertion.subjectId : undefined;
    if (!otherId) continue;
    const relationshipKey = `${assertion.predicateId}|${otherId}|${JSON.stringify(assertion.validTime ?? null)}`;
    if (relationshipKeys.has(relationshipKey)) continue;
    relationshipKeys.add(relationshipKey);
    if (assertion.subjectId === id) {
      const target = dataset.entities.find((candidate) => candidate.id === assertion.object.entityId);
      if (target) relationships.push({ assertionId: assertion.id, direction: "outgoing", label: predicate.label, entity: target, epistemicStatus: assertion.epistemicStatus, validTime: assertion.validTime, evidence: evidenceFor(dataset, assertion.id) });
    } else if (assertion.object.entityId === id) {
      const source = dataset.entities.find((candidate) => candidate.id === assertion.subjectId);
      if (source) relationships.push({ assertionId: assertion.id, direction: "incoming", label: predicate.symmetric ? predicate.label : (predicate.inverseLabel ?? `Subject of ${predicate.label.toLocaleLowerCase("en-GB")}`), entity: source, epistemicStatus: assertion.epistemicStatus, validTime: assertion.validTime, evidence: evidenceFor(dataset, assertion.id) });
    }
  }
  const facts = dataset.assertions.filter((assertion) => assertion.subjectId === id && !assertion.object.entityId).map((assertion) => assertionView(dataset, assertion));
  const disputes = dataset.disputes.filter((dispute) => dispute.topicEntityIds.includes(id)).map((dispute) => ({ ...dispute, assertions: dispute.assertionIds.map((assertionId) => assertionView(dataset, dataset.assertions.find((a) => a.id === assertionId)!)) }));
  const outcomeGroups = dataset.outcomeGroups.filter((group) => group.topicEntityIds.includes(id)).map((group) => ({ ...group, assertions: group.assertionIds.map((assertionId) => assertionView(dataset, dataset.assertions.find((a) => a.id === assertionId)!)) }));
  return {
    entity,
    aliases: dataset.names.filter((name) => name.entityId === id).map((name) => name.name),
    articleSections: (entity.articleSections ?? []).map((section) => ({
      ...section,
      assertions: section.assertionIds.flatMap((assertionId) => { const assertion = dataset.assertions.find((candidate) => candidate.id === assertionId); return assertion ? [assertionView(dataset, assertion)] : []; }),
      relatedEntities: (section.relatedEntityIds ?? []).flatMap((relatedId) => { const related = dataset.entities.find((candidate) => candidate.id === relatedId); return related ? [related] : []; })
    })),
    relationships: relationships.sort((a, b) => a.label.localeCompare(b.label) || a.entity.displayName.localeCompare(b.entity.displayName)),
    facts,
    spatial: dataset.spatialRepresentations.filter((spatial) => spatial.placeId === id),
    appearances: dataset.appearances.filter((appearance) => appearance.entityId === id).map((appearance) => ({ ...appearance, work: dataset.sourceWorks.find((work) => work.id === appearance.workId)! })),
    disputes,
    outcomeGroups
  };
}

function appearsIn(dataset: LoreDataset, entityId: string, workId?: string) {
  return !workId || dataset.appearances.some((appearance) => appearance.entityId === entityId && appearance.workId === workId);
}

export async function searchEntities(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
  if (isTauri()) return invoke("search_entities", { query, filters });
  const dataset = await data();
  const needle = query.toLocaleLowerCase("en-GB").trim();
  const words = needle.split(/\s+/).filter(Boolean);
  if (!words.length) return listEntities(filters);
  return dataset.entities.flatMap((entity) => {
    if (filters.entityType && filters.entityType !== "all" && entity.type !== filters.entityType) return [];
    if (!appearsIn(dataset, entity.id, filters.workId)) return [];
    const aliases = dataset.names.filter((name) => name.entityId === entity.id).map((name) => name.name);
    const name = entity.displayName.toLocaleLowerCase("en-GB");
    const aliasText = aliases.join(" ").toLocaleLowerCase("en-GB");
    const article = (entity.articleSections ?? []).flatMap((section) => [section.title, ...section.paragraphs]).join(" ");
    const haystack = `${name} ${aliasText} ${entity.summary} ${entity.description ?? ""} ${article} ${entity.tags.join(" ")}`.toLocaleLowerCase("en-GB");
    if (!words.every((word) => haystack.includes(word))) return [];
    const exactAlias = aliases.some((alias) => alias.toLocaleLowerCase("en-GB") === needle);
    const rank = name === needle ? 100 : exactAlias ? 90 : name.startsWith(needle) ? 80 : aliasText.includes(needle) ? 70 : name.includes(needle) ? 60 : article.toLocaleLowerCase("en-GB").includes(needle) ? 25 : 20;
    const matchField = name.includes(needle) ? "name" : aliasText.includes(needle) ? "alias" : article.toLocaleLowerCase("en-GB").includes(needle) ? "article" : entity.summary.toLocaleLowerCase("en-GB").includes(needle) ? "summary" : "record";
    const sourceText = matchField === "article" ? article : entity.summary;
    const at = sourceText.toLocaleLowerCase("en-GB").indexOf(words[0]);
    const start = Math.max(0, at - 60); const matchSnippet = sourceText.slice(start, start + 180).trim();
    return [{ ...entity, aliases, rank, matchField, matchSnippet: start > 0 ? `…${matchSnippet}` : matchSnippet }];
  }).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0) || a.displayName.localeCompare(b.displayName));
}

export async function listEntities(filters: SearchFilters = {}): Promise<SearchResult[]> {
  if (isTauri()) return invoke("list_entities", { filters });
  const dataset = await data();
  return dataset.entities.filter((entity) => (!filters.entityType || filters.entityType === "all" || entity.type === filters.entityType) && appearsIn(dataset, entity.id, filters.workId)).map((entity) => ({ ...entity, aliases: dataset.names.filter((name) => name.entityId === entity.id).map((name) => name.name) })).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getEntity(id: string): Promise<EntityDetail | null> {
  if (isTauri()) return invoke("get_entity", { id });
  return entityDetail(await data(), id);
}

export async function getTimeline(filters: SearchFilters = {}): Promise<TimelineEntry[]> {
  if (isTauri()) return invoke("get_timeline", { filters });
  const dataset = await data();
  return dataset.assertions.flatMap((assertion) => {
    const temporal = assertion.object.temporal;
    const entity = dataset.entities.find((candidate) => candidate.id === assertion.subjectId);
    if (!temporal || !entity || (filters.entityType && filters.entityType !== "all" && entity.type !== filters.entityType) || !appearsIn(dataset, entity.id, filters.workId)) return [];
    const relatedIds = new Set(dataset.assertions.flatMap((relationship) => {
      if (!relationship.object.entityId) return [];
      if (relationship.subjectId === entity.id) return [relationship.object.entityId];
      if (relationship.object.entityId === entity.id) return [relationship.subjectId];
      return [];
    }));
    const relatedEntities = dataset.entities.filter((candidate) => relatedIds.has(candidate.id));
    return [{ entity, temporal, epistemicStatus: assertion.epistemicStatus, evidenceCount: evidenceFor(dataset, assertion.id).length, relatedEntities }];
  }).sort((a, b) => {
    const dateKey = (entry: TimelineEntry) => (entry.temporal.start?.year ?? 9999) * 10_000 + (entry.temporal.start?.month ?? 0) * 100 + (entry.temporal.start?.day ?? 0);
    return dateKey(a) - dateKey(b) || a.entity.displayName.localeCompare(b.entity.displayName);
  });
}

export async function getMapLocations(filters: SearchFilters = {}): Promise<MapLocation[]> {
  if (isTauri()) return invoke("get_map_locations", { filters });
  const dataset = await data();
  return dataset.spatialRepresentations.flatMap((spatial) => { const entity = dataset.entities.find((entity) => entity.id === spatial.placeId); return entity && appearsIn(dataset, entity.id, filters.workId) ? [{ entity, spatial }] : []; });
}

export async function getFeaturedEntities(): Promise<Entity[]> {
  if (isTauri()) return invoke("get_featured_entities");
  return (await data()).entities.filter((entity) => entity.featured);
}

export async function listGames(): Promise<SourceWork[]> {
  if (isTauri()) return invoke("list_games");
  return (await data()).sourceWorks.filter((work) => ["game", "video_game"].includes(work.workType) && work.slug).sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""));
}

export async function getGameProfile(slug: string): Promise<GameProfile | null> {
  if (isTauri()) return invoke("get_game_profile", { slug });
  const dataset = await data();
  const work = dataset.sourceWorks.find((candidate) => candidate.slug === slug);
  if (!work) return null;
  const entities = dataset.entities.filter((entity) => appearsIn(dataset, entity.id, work.id));
  const entityIds = new Set(entities.map((entity) => entity.id));
  const relevantAssertionIds = new Set(dataset.assertions.filter((assertion) => entityIds.has(assertion.subjectId)).map((assertion) => assertion.id));
  const relevantSourceIds = new Set(dataset.evidenceLinks.filter((link) => relevantAssertionIds.has(link.targetId)).map((link) => link.sourceItemId));
  const sourceItems = dataset.sourceItems.filter((item) => item.workId === work.id || relevantSourceIds.has(item.id));
  const counts = entities.reduce<Record<string, number>>((result, entity) => ({ ...result, [entity.type]: (result[entity.type] ?? 0) + 1 }), {});
  return { work, entities, sourceItems, counts };
}
