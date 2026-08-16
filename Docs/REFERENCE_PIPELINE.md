# External reference and coverage pipeline

## Purpose and trust boundary

The reference pipeline makes franchise-scale discovery repeatable without weakening the canonical lore model:

```text
external MediaWiki data
        ↓
reference candidates (untrusted secondary discovery)
        ↓ human/research review
canonical Entity → Assertion → Evidence records
```

Files under `reference/` are not canonical lore. A reference page is a web indexing unit, not necessarily an Archive entity. Redirects may be aliases, one list may describe many subjects, and one lore identity may span several games and pages. Automated matching therefore proposes links but never merges or writes `lore/` records.

## Layout

- `reference/works.json`: controlled game/add-on scope and category facets.
- `reference/providers/nukapedia.json`: endpoint, licence, attribution and retrieval policy.
- `reference/mappings.json`: small, reviewable explicit page-title mappings.
- `reference/manifests/reference-corpus.json`: deduplicated candidates and attribution metadata.
- `reference/reports/`: machine-readable per-work coverage plus a franchise summary.
- `reference/queues/ingestion-queue.json`: Tier 1–4 future work.
- `reference/queues/deep-research.json`: important or complex subjects requiring primary research.
- `reference/cache/`: ignored raw API-response cache; never canonical or packaged.

## Provider design

`ReferenceProvider` separates discovery and page metadata from the pipeline. The current `MediaWikiProvider` implements category traversal, page/revision heads and bounded metadata retrieval. A future official-site, manual or script provider can implement the same interface without changing matching or coverage code.

The MediaWiki implementation:

- identifies itself with a project User-Agent;
- waits between requests and retries transient failures;
- observes API continuation for category membership;
- caches each normalized request for 24 hours;
- can operate from cache with `--offline`;
- compares current revision IDs before detailed extraction;
- falls back to stale cache after a transient request failure;
- records failures by work/scope instead of inventing results;
- on Windows, uses `curl.exe` and the Windows certificate store because some Node installations cannot see enterprise/local root certificates;
- passes URL arguments without a shell and parses responses only as JSON.

External HTML, templates and scripts are never executed. Article bodies and media are not downloaded. The committed manifest retains bounded categories, links, redirect aliases, external source leads and revision-level attribution.

## Commands

Synchronize all configured game scopes and regenerate coverage/queues:

```powershell
pnpm lore:reference:sync
```

Synchronize one parent game scope:

```powershell
pnpm lore:reference:sync fallout1
pnpm lore:reference:sync fallout2
pnpm lore:reference:sync fallout3
pnpm lore:reference:sync new-vegas
pnpm lore:reference:sync fallout4
pnpm lore:reference:sync fallout76
```

An add-on slug resolves to its parent discovery scope. Add-on association is derived conservatively from page categories.

Useful modes:

```powershell
pnpm lore:reference:sync -- --offline
pnpm lore:reference:sync -- --refresh
pnpm lore:reference:sync -- --rebuild
pnpm lore:reference:validate
pnpm lore:coverage
pnpm lore:coverage fallout1
```

- `--offline` requires cached responses and performs no network access.
- `--refresh` bypasses the 24-hour cache TTL.
- `--rebuild` reruns deterministic classification/extraction from cached page metadata even when revision IDs are unchanged.

Normal unit tests use fixtures and never require live internet access.

## Candidate extraction

Each candidate stores a stable provider/page-ID identity, title, redirects, likely type, associated works, discovery and page categories, bounded related-title hints, possible primary-source leads, candidate relationship hints, material status, importance score, ingestion tier, proposed canonical match and full attribution metadata.

Candidate claims are deliberately weaker than canonical Assertions. They are labelled as requiring primary verification and must not be displayed as world facts.

Deterministic classification uses category ancestry, cross-work presence, link/size signals, prominent-role/title signals and mechanical/reference categories. It is a triage heuristic, not editorial judgement. Cut, unused and mentioned-only signals remain explicit.

## Matching

Matching proceeds from safest to least certain:

1. explicit reviewed mapping;
2. exact canonical display name;
3. exact `NameUsage` alias;
4. normalized canonical name or alias;
5. ambiguous candidate set;
6. no match.

Ambiguous candidates remain unresolved. Redirects are recorded as aliases but do not themselves prove identity.

## Coverage methodology

Coverage states are derived from existing canonical content:

- `production_quality`: major article, substantial sectioned prose and multiple source-backed assertions;
- `substantial_record`: meaningful sectioned prose and evidence;
- `supporting_record`: supported graph record without a full major article;
- `shallow_record`: existing identity with limited depth;
- `needs_review`: ambiguous match;
- `absent`: no proposed Archive identity.

The weighted estimate excludes gameplay-only and source/reference-only pages. Tier 1 candidates receive full importance weight, Tier 2 receives 35%, and Tier 3 receives 3%; covered records contribute 100%, 75%, 50% or 25% according to quality state. This deliberately prevents generic NPCs, minor items and other long-tail pages from dominating the estimate. It remains an estimate, not a completeness guarantee.

Work totals count subject-work associations, while `reference-corpus.json` deduplicates candidates by provider page ID. Add-on reports can legitimately be zero when the parent category traversal does not expose reliable add-on categories; the report preserves that limitation instead of fabricating associations.

## Ingestion and promotion

For a future candidate selected from the queue:

1. confirm the candidate represents one stable lore identity;
2. inspect redirect and cross-game identity ambiguity;
3. follow reference leads to released game dialogue, terminals, holotapes, notes, quests or first-party material;
4. create or enrich the canonical `Entity` and `NameUsage` records;
5. express substantive propositions as controlled `Assertion` records;
6. create precise `SourceWork`, `SourceItem` and `EvidenceLink` records;
7. retain uncertainty, source statements, material scope and disputes;
8. write original editorial synthesis rather than importing wiki prose;
9. validate and run the full quality/build/test gate.

Tier 1 contains principal gaps; Tier 2 important supporting lore; Tier 3 the long tail; Tier 4 generally mechanical/reference-only exclusions. `deep-research.json` concentrates expensive research on high-importance, cross-game, scientific, cut/unused or otherwise sensitive subjects.

## Licensing and attribution

Software and data licences are separate. See `LICENSE`, `LICENSE-DATA.md`, `ATTRIBUTION.md` and `NOTICE.md`.

The source API reports `CC-BY-SA`, and Fallout Wiki's copyright page specifies CC BY-SA 3.0 for community-authored text unless otherwise noted. Every candidate retains page/revision attribution even though the pipeline intentionally does not store article bodies. Media files are excluded because their rights may differ from wiki text.
