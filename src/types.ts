export type EntityType = "individual" | "organisation" | "place" | "event" | "technology" | "substance_condition" | "artefact" | "concept";
export type Precision = "day" | "month" | "year" | "approximate" | "unknown";

export interface PartialDate { year: number; month?: number; day?: number }
export interface TemporalValue {
  kind: "point" | "interval" | "relative" | "unknown";
  start?: PartialDate;
  end?: PartialDate;
  precision?: Precision;
  approximate?: boolean;
  display?: string;
  relativeConstraints?: Array<{ relation: "before" | "after"; entityId: string }>;
}

export interface Entity {
  id: string;
  type: EntityType;
  subtype: string;
  displayName: string;
  summary: string;
  description?: string;
  articleTier?: "major" | "supporting";
  articleSections?: ArticleSection[];
  tags: string[];
  recordStatus: "reviewed" | "candidate";
  featured?: boolean;
}

export interface ArticleSection {
  id: string;
  title: string;
  paragraphs: string[];
  assertionIds: string[];
  relatedEntityIds?: string[];
}

export interface NameUsage { id: string; entityId: string; name: string; kind: string; preferred?: boolean }
export interface PredicateDefinition {
  id: string;
  label: string;
  inverseId?: string;
  inverseLabel?: string;
  subjectTypes: EntityType[];
  objectTypes: EntityType[] | ["temporal"];
  symmetric?: boolean;
  temporalAllowed?: boolean;
  presentationGroup: string;
}
export interface AssertionObject { entityId?: string; temporal?: TemporalValue; text?: string }
export interface Assertion {
  id: string;
  subjectId: string;
  predicateId: string;
  object: AssertionObject;
  assertionMode: "world_claim" | "source_statement" | "editorial_inference" | "editorial_hypothesis";
  epistemicStatus: "explicit" | "strongly_supported" | "inferred" | "approximate" | "uncertain" | "disputed" | "contradicted" | "unknown";
  validTime?: TemporalValue;
  continuityScope: string[];
  conditionSetId?: string;
  notes?: string;
}
export interface SourceWork { id: string; title: string; workType: string; releaseDate?: string; materialStatus: string; continuityClassification: string; slug?: string; description?: string; featuredEntityIds?: string[] }
export interface SourceItem { id: string; workId: string; sourceType: string; title: string; locator: string; sourceClass: string; textAvailability: string; url?: string; date?: string; context?: string }
export interface EvidenceLink { id: string; targetId: string; sourceItemId: string; role: string; directness: string; note?: string }
export interface SpatialRepresentation { id: string; placeId: string; geometryKind: "exact_point" | "approximate_point"; latitude: number; longitude: number; precision: string; confidence: string; basis: string; notes?: string }
export interface Appearance { id: string; entityId: string; workId: string; kind: string; notes?: string }
export interface Dispute { id: string; assertionIds: string[]; topicEntityIds: string[]; issueType: string; editorialStatus: string; assessment: string }
export interface ConditionSet { id: string; label: string; description: string; kind: "successful_route" | "optional_outcome" | "failure_state" | "technical_condition"; mutuallyExclusiveGroup?: string }
export interface OutcomeGroup { id: string; title: string; description: string; topicEntityIds: string[]; assertionIds: string[] }

export interface LoreDataset {
  schemaVersion: string;
  entities: Entity[];
  names: NameUsage[];
  predicates: PredicateDefinition[];
  assertions: Assertion[];
  sourceWorks: SourceWork[];
  sourceItems: SourceItem[];
  evidenceLinks: EvidenceLink[];
  spatialRepresentations: SpatialRepresentation[];
  appearances: Appearance[];
  disputes: Dispute[];
  conditionSets: ConditionSet[];
  outcomeGroups: OutcomeGroup[];
}

export interface SearchFilters { entityType?: EntityType | "all"; workId?: string }
export interface SearchResult extends Entity { aliases: string[]; rank?: number; matchSnippet?: string; matchField?: string }
export interface RelationshipView { assertionId: string; direction: "outgoing" | "incoming"; label: string; entity: Entity; epistemicStatus: string; validTime?: TemporalValue; evidence: EvidenceView[] }
export interface EvidenceView { link: EvidenceLink; item: SourceItem; work: SourceWork }
export interface AssertionView { assertion: Assertion; predicate: PredicateDefinition; objectEntity?: Entity; conditionSet?: ConditionSet; evidence: EvidenceView[] }
export interface ArticleSectionView extends ArticleSection { assertions: AssertionView[]; relatedEntities: Entity[] }
export interface OutcomeGroupView extends OutcomeGroup { assertions: AssertionView[] }
export interface EntityDetail { entity: Entity; aliases: string[]; articleSections: ArticleSectionView[]; relationships: RelationshipView[]; facts: AssertionView[]; spatial: SpatialRepresentation[]; appearances: Array<Appearance & { work: SourceWork }>; disputes: Array<Dispute & { assertions: AssertionView[] }>; outcomeGroups: OutcomeGroupView[] }
export interface TimelineEntry { entity: Entity; temporal: TemporalValue; epistemicStatus: string; evidenceCount: number; relatedEntities: Entity[] }
export interface MapLocation { entity: Entity; spatial: SpatialRepresentation }
export interface GameProfile { work: SourceWork; entities: Entity[]; sourceItems: SourceItem[]; counts: Record<string, number> }
