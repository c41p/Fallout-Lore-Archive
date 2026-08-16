# Fallout Lore Archive Content Standard

This standard records the editorial baseline established by the Roger Maxson, Mariposa, FEV, Lost Hills and early Brotherhood pass. Future ingestion should reproduce its evidence discipline and useful depth, not merely its record count.

## Major records

A major record is a subject a reader reasonably expects to explore as an article. It should normally have:

- an original overview and at least three subject-appropriate article sections;
- enough chronological explanation to establish cause, change and consequence;
- links to the people, organisations, places and events necessary to continue exploring;
- structured assertions behind substantive propositions wherever practical;
- source context and locators that explain what kind of evidence supports the article;
- an explicit account of meaningful uncertainty, source perspective or contradiction.

Section headings should follow the subject. Do not force biography headings onto a place, event or technology. Length is evidence-led: substantial enough to orient a new reader, but never padded.

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

Article prose is original editorial synthesis. It may explain source perspective, chronology and institutional change, but must not bulk-copy dialogue, terminal text, subtitles, guidebook prose or wiki articles. Prefer paraphrase, metadata and precise locators. Brief quotations should be exceptional and necessary.

AI-generated prose is not evidence. A reputable wiki is useful for discovery and cross-checking; wherever possible, follow its reference to the underlying released material.

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
