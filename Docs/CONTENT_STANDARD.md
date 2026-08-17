# Fallout Lore Archive Content Standard

This standard records the editorial baseline established by the Roger Maxson, Mariposa, FEV, Lost Hills and early Brotherhood pass. Future ingestion should reproduce its evidence discipline and useful depth, not merely its record count.

## Major records

A major record is a subject a reader reasonably expects to explore as an article. The article may be `reference`, `local` or `hybrid`. Regardless of mode, the Archive-owned record should normally have:

- a clear local overview and a reliable provider mapping and/or original subject-appropriate article sections;
- enough chronological explanation to establish cause, change and consequence;
- links to the people, organisations, places and events necessary to continue exploring;
- structured assertions behind substantive propositions wherever practical;
- source context and locators that explain what kind of evidence supports the article;
- an explicit account of meaningful uncertainty, source perspective or contradiction.

Section headings should follow the subject. Do not force biography headings onto a place, event or technology. Length is evidence-led and never padded. Integrated provider articles do not need to be copied into canonical JSON to satisfy a local word-count threshold.

## Supporting records

A supporting record must have a clear identity, neutral summary and useful graph connection. Add one or more short article sections when a summary cannot explain its role responsibly. Supporting records still require evidence for substantive assertions; `supporting` is not permission for an unsupported placeholder.

## Assertions and evidence

The canonical chain remains `Entity → Assertion → EvidenceLink → SourceItem → SourceWork`.

- Use a world claim only for a proposition the source establishes about the setting.
- Use a source statement when recording what a person, terminal or document says.
- Use editorial inference only when the reasoning is useful and the underlying sources are linked.
- Attach multiple EvidenceLinks to one proposition when several sources support the same claim.
- Split assertions only when wording, time, continuity or conclusion materially differs.
- Do not store inverse relationship assertions; the predicate registry derives reverse navigation.
- Give each major article section assertion IDs and related entity IDs so prose remains connected to the knowledge graph.

Source items should identify the work, source type, human-readable title, defensible in-game locator and context. A web URL may point to a reference/transcript page for verification, but the source of authority remains the released work. Never invent quest stages, terminal headings, dialogue speakers or dates.

## Time, uncertainty and contradictions

Use the precision present in the source: exact day, month, year, interval, relative constraint or approximate label. Do not backfill missing day/month values. An undated recording may support a sequence or doctrine without supporting an exact date.

Keep competing claims separate and attach their evidence separately. Use a Dispute for a meaningful conflict. Do not resolve contradictions by silently selecting the most convenient version or rewriting earlier material out of the archive.

## Article prose and copyright

Local article prose is original editorial synthesis. It may explain source perspective, chronology and institutional change, but must not bulk-copy dialogue, terminal text, subtitles, guidebook prose or wiki articles. Prefer paraphrase, metadata and precise locators. Brief quotations should be exceptional and necessary.

Integrated reference articles are a separate licensed presentation layer. They are fetched from the configured provider at runtime, sanitized, attributed by page/revision, and cached locally for resilience. They do not become local editorial assertions merely because they are readable in the application. `Hybrid` pages must label Archive synthesis separately from provider text.

AI-generated prose is not evidence. Revision-attributed community references may supply the routine informational baseline for broad profiles, aliases, appearances and conservative navigation. They must remain identifiable as secondary sources and must not be described as official canon. Follow them to released material when a proposition is disputed, continuity-sensitive, unusually specific or important enough to warrant claim-level verification.

## Required checks

Run the complete gate before committing canonical content:

```powershell
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
```

During editing, the focused commands are:

```powershell
pnpm lore:validate
pnpm lore:quality
pnpm lore:build
```

Treat quality warnings as an editorial backlog. Resolve warnings in the cluster being changed; do not fabricate assertions merely to make the warning count zero.

Raw candidates under `reference/` are not canonical records. The controlled expansion in [REFERENCE_PIPELINE.md](REFERENCE_PIPELINE.md) may promote a filtered candidate by resolving identity, retaining page/revision/licence provenance, adding a stable provider mapping and creating evidence-bearing structured records. Primary-source research remains the preferred deepening step for disputed or historically important claims.

## Franchise-scale integration tiers

Importance tiers remain triage signals for identity, graph, chronology and primary-evidence work. They no longer impose article word counts. Review `reference/reports/integrated-reference-coverage.json` for provider mapping, relationship, timeline and spatial coverage. A record is useful when it has a reliable identity and exploration role, not when generated prose crosses a numeric threshold.

## Conditional and player-dependent history

Player choices and ending slides must not be flattened into unconditional chronology. Put a branch-qualified assertion in a reusable `ConditionSet`, then collect mutually exclusive assertions in an `OutcomeGroup` attached to the affected topic records. Shared successful-route facts may use one successful-route condition, while incompatible local endings require separate conditions in a common `mutuallyExclusiveGroup`.

Dates controlled by player travel should retain only justified precision. A label such as “during the Vault Dweller's 2161 journey; exact date varies” is preferable to manufacturing a day. Technical dates from executable behaviour must identify that evidentiary class instead of masquerading as dialogue or narrative text.

## Game-sized ingestion

A game ingestion reuses existing cross-work entity IDs, adds one appearance edge per relevant work, and supplies a work profile with a stable slug, description and curated featured entities. The resulting game page should expose a typed record index, primary-source locators and links to work-filtered browse, timeline and map views.

SourceItems remain metadata and precise locators; they do not reproduce dialogue trees, scripts or terminal text. Conditions and work associations are generic archive concepts, not game-specific database columns.

For franchise-wide batches, maintain a review manifest such as [FRANCHISE_INGESTION_STATUS.md](FRANCHISE_INGESTION_STATUS.md). Automated importance tiers are triage signals: generic uniforms, list pages and category artefacts must not be promoted merely because a score calls them Tier 1. A broad article supported only by a secondary reference is a useful canonical start, but its evidence debt must remain explicit until released-game locators are attached.
