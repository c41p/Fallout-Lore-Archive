import type { EntityType } from "../../src/types";

export type ReferenceSubjectType = "person" | "organisation" | "place" | "event" | "creature" | "technology" | "item" | "source_record" | "concept" | "other";
export type CandidateFlag = "major_lore" | "supporting_lore" | "minor_lore" | "gameplay_only" | "reference_only" | "duplicate_or_alias" | "cross_game_existing_entity" | "needs_primary_research" | "conflicted" | "uncertain";
export type CoverageState = "absent" | "candidate_match" | "structured_record" | "provider_mapped" | "hybrid_researched" | "needs_review";

export interface ReferenceWork {
  id: string;
  slug: string;
  title: string;
  kind: string;
  parentWorkId?: string;
  releaseDate?: string;
  materialStatus: string;
  coverageEnabled?: boolean;
  updateModel?: string;
  associationPatterns?: string[];
  discovery?: { categoryPrefix: string; facets: string[]; maxDepth: number; maxSubjects: number };
}

export interface WorksManifest { schemaVersion: string; works: ReferenceWork[] }

export interface ReferenceAttribution {
  sourceSite: string;
  wikiName: string;
  pageTitle: string;
  canonicalPageUrl: string;
  pageId: number;
  revisionId?: number;
  revisionTimestamp?: string;
  retrievalTimestamp: string;
  contentLicence: string;
  attributionUrl: string;
  sourceType: "secondary_reference";
  redirectSources?: string[];
}

export interface ReferencePage {
  pageId: number;
  title: string;
  fullUrl: string;
  revisionId?: number;
  revisionTimestamp?: string;
  length?: number;
  categories: string[];
  links: string[];
  externalLinks: string[];
  templates: string[];
  redirects: string[];
}

export interface DiscoveredPage { pageId: number; title: string; workId: string; discoveryCategory: string }

export interface CandidateClaim {
  predicateHint: "related_to" | "mentions_primary_source";
  objectTitle: string;
  referenceUrl?: string;
  confidence: "low" | "medium";
  needsPrimaryVerification: true;
}

export interface CandidateMatch {
  entityId?: string;
  method: "explicit" | "canonical_name" | "alias" | "normalized_name" | "ambiguous" | "none";
  confidence: number;
  alternatives?: string[];
}

export interface ReferenceCandidate {
  id: string;
  providerId: string;
  title: string;
  normalizedTitle: string;
  aliases: string[];
  likelyType: ReferenceSubjectType;
  proposedEntityType?: EntityType;
  workIds: string[];
  discoveryCategories: string[];
  categories: string[];
  description: string;
  relatedTitles: string[];
  primarySourceLeads: string[];
  candidateClaims: CandidateClaim[];
  attribution: ReferenceAttribution;
  flags: CandidateFlag[];
  classificationBasis: string[];
  importanceScore: number;
  ingestionTier: 1 | 2 | 3 | 4;
  ingestionStatus: "unreviewed" | "matched" | "ambiguous";
  match: CandidateMatch;
  materialStatus: "released" | "cut" | "unused" | "promotional" | "supplementary" | "unknown";
}

export interface ReferenceCorpus {
  schemaVersion: "1.0";
  provider: { id: string; name: string; apiUrl: string; contentLicence: string; attributionUrl: string };
  generatedAt: string;
  candidates: ReferenceCandidate[];
  sync: { requestedWorkIds: string[]; discoveredPages: number; changedPages: number; unchangedPages: number; failures: Array<{ scope: string; message: string }> };
}

export interface CoverageWorkReport {
  workId: string;
  slug: string;
  title: string;
  referenceSubjects: number;
  matchedArchiveEntities: number;
  hybridResearched: number;
  providerMapped: number;
  structuredRecords: number;
  candidateMatches: number;
  missingSubjects: number;
  unresolvedMatches: number;
  gameplayOrReferenceOnly: number;
  majorLore: number;
  supportingLore: number;
  minorLore: number;
  deepResearchCandidates: number;
  tier1Gaps: number;
  tier2Gaps: number;
  weightedLoreCoverage: number;
  byType: Record<string, { total: number; matched: number; missing: number }>;
}

export interface CoverageReport {
  schemaVersion: "1.0";
  generatedAt: string;
  methodology: string;
  totals: Omit<CoverageWorkReport, "workId" | "slug" | "title" | "byType"> & { ambiguousMatches: number; deepResearchFlags: number };
  works: CoverageWorkReport[];
}
