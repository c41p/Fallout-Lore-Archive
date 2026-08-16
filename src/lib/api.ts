import { invoke } from "@tauri-apps/api/core";
import type { Assertion, AssertionView, Entity, EntityDetail, EvidenceView, LoreDataset, MapLocation, RelationshipView, SearchFilters, SearchResult, TimelineEntry } from "../types";

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
  return { assertion, predicate, objectEntity, evidence: evidenceFor(dataset, assertion.id) };
}

function entityDetail(dataset: LoreDataset, id: string): EntityDetail | null {
  const entity = dataset.entities.find((candidate) => candidate.id === id);
  if (!entity) return null;
  const relationships: RelationshipView[] = [];
  for (const assertion of dataset.assertions) {
    if (!assertion.object.entityId) continue;
    const predicate = dataset.predicates.find((candidate) => candidate.id === assertion.predicateId)!;
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
  return {
    entity,
    aliases: dataset.names.filter((name) => name.entityId === id).map((name) => name.name),
    relationships: relationships.sort((a, b) => a.label.localeCompare(b.label) || a.entity.displayName.localeCompare(b.entity.displayName)),
    facts,
    spatial: dataset.spatialRepresentations.filter((spatial) => spatial.placeId === id),
    appearances: dataset.appearances.filter((appearance) => appearance.entityId === id).map((appearance) => ({ ...appearance, work: dataset.sourceWorks.find((work) => work.id === appearance.workId)! })),
    disputes
  };
}

export async function searchEntities(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
  if (isTauri()) return invoke("search_entities", { query, filters });
  const dataset = await data();
  const needle = query.toLocaleLowerCase("en-GB").trim();
  const words = needle.split(/\s+/).filter(Boolean);
  if (!words.length) return listEntities(filters);
  return dataset.entities.flatMap((entity) => {
    if (filters.entityType && filters.entityType !== "all" && entity.type !== filters.entityType) return [];
    const aliases = dataset.names.filter((name) => name.entityId === entity.id).map((name) => name.name);
    const name = entity.displayName.toLocaleLowerCase("en-GB");
    const aliasText = aliases.join(" ").toLocaleLowerCase("en-GB");
    const haystack = `${name} ${aliasText} ${entity.summary} ${entity.description ?? ""} ${entity.tags.join(" ")}`.toLocaleLowerCase("en-GB");
    if (!words.every((word) => haystack.includes(word))) return [];
    const rank = name === needle ? 100 : name.startsWith(needle) ? 80 : aliasText.split(/\s+/).includes(needle) ? 70 : name.includes(needle) ? 60 : 20;
    return [{ ...entity, aliases, rank }];
  }).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0) || a.displayName.localeCompare(b.displayName));
}

export async function listEntities(filters: SearchFilters = {}): Promise<SearchResult[]> {
  if (isTauri()) return invoke("list_entities", { filters });
  const dataset = await data();
  return dataset.entities.filter((entity) => !filters.entityType || filters.entityType === "all" || entity.type === filters.entityType).map((entity) => ({ ...entity, aliases: dataset.names.filter((name) => name.entityId === entity.id).map((name) => name.name) })).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getEntity(id: string): Promise<EntityDetail | null> {
  if (isTauri()) return invoke("get_entity", { id });
  return entityDetail(await data(), id);
}

export async function getTimeline(entityType?: string): Promise<TimelineEntry[]> {
  if (isTauri()) return invoke("get_timeline", { filters: { entityType: entityType || null } });
  const dataset = await data();
  return dataset.assertions.flatMap((assertion) => {
    const temporal = assertion.object.temporal;
    const entity = dataset.entities.find((candidate) => candidate.id === assertion.subjectId);
    if (!temporal || !entity || (entityType && entity.type !== entityType)) return [];
    return [{ entity, temporal, epistemicStatus: assertion.epistemicStatus, evidenceCount: evidenceFor(dataset, assertion.id).length }];
  }).sort((a, b) => (a.temporal.start?.year ?? 99999) - (b.temporal.start?.year ?? 99999));
}

export async function getMapLocations(): Promise<MapLocation[]> {
  if (isTauri()) return invoke("get_map_locations", { filters: {} });
  const dataset = await data();
  return dataset.spatialRepresentations.map((spatial) => ({ entity: dataset.entities.find((entity) => entity.id === spatial.placeId)!, spatial }));
}

export async function getFeaturedEntities(): Promise<Entity[]> {
  if (isTauri()) return invoke("get_featured_entities");
  return (await data()).entities.filter((entity) => entity.featured);
}
