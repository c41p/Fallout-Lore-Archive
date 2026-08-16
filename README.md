# Fallout Lore Archive

Fallout Lore Archive v0.1 is a Windows-first, local desktop prototype for exploring interconnected Fallout history. One evidence-aware dataset drives search, category browsing, entity records, chronology, geography, reverse relationships, appearances, sources, uncertainty and disputes.

The archive now combines deep primary-source clusters with a revision-attributed community-reference baseline. Community material is transformed into canonical profiles with explicit page/revision provenance and conservative relationship semantics; it is never presented as an official canon authority, and stronger released-game evidence remains attached at claim level.

The current corpus contains 2,354 records, 12,097 assertions, 12,081 evidence links, 9,523 relationship edges and 159 dated events. It spans the released games and major add-ons while retaining production-depth histories for the Roger Maxson/Mariposa/Brotherhood and Fallout (1997) clusters. The generated depth audit reports no shallow Tier 1 or Tier 2 records.

## What works

- Local SQLite/FTS5 search over canonical names, aliases, summaries, descriptions, curated article sections and tags, with article-match snippets weighted below names and aliases.
- Browse filters for people, organisations, places, events, technology and other record types, with optional source-work scope.
- Scalable Games navigation with a Fallout work page, featured records, typed index, source browser, and links into work-filtered browse, timeline and map views.
- Entity pages with long-form sectioned articles, compact contents navigation, related-record links, derived reverse relationships, temporal state, source context and appearances.
- Precision-aware timeline with exact, year-only and approximate dates.
- Timeline filtering by record type, connected-record type and related subject text.
- Six curated Lore Paths and type-filtered relationship exploration for dense records.
- Offline Leaflet map backed by bundled public-domain Natural Earth vectors.
- Exact and approximate map representations that are visually and textually distinct.
- Evidence links that distinguish source work, source item, role and directness.
- Generic condition sets and outcome groups that preserve mutually exclusive endings without presenting every branch as simultaneous history.
- A Jet-origin dispute that preserves separate source statements and editorial inference.
- Canonical JSON validation and deterministic SQLite compilation.

## Prerequisites

Check and optionally install all Windows prerequisites from PowerShell (the script always asks before installing anything):

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
```

- Windows 10 or 11.
- Node.js 20 or newer and pnpm 11.
- SQLite 3 with FTS5 available on `PATH` for rebuilding lore data.
- Rust stable MSVC, Microsoft C++ Build Tools with “Desktop development with C++”, and WebView2 for Tauri development. See the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

The generated development database is committed, so ordinary frontend inspection does not require rebuilding it. Canonical-data changes do.

## Running the application

```powershell
pnpm install
pnpm tauri dev
```

For frontend-only development in a browser:

```powershell
pnpm lore:build
pnpm dev
```

The browser mode uses the generated runtime JSON fallback. The packaged desktop application uses the compiled SQLite database through typed Tauri commands.

## Lore data

Human-reviewable canonical data lives under `lore/`:

- `entities/`: stable navigable subjects.
- `assertions/`: evidence-bearing propositions and entity relationships.
- `names/`: aliases, abbreviations and historical usages.
- `sources/` and `evidence/`: works, locators and provenance edges.
- `spatial/`: place representations separate from place identity.
- `appearances/` and `disputes/`: work appearances and preserved conflicts.
- `fallout1/`: sharded Fallout corpus additions, entity enrichments, condition sets and outcome groups merged by the standard loader.
- `franchise/`: revision-attributed cross-franchise profiles, assertions, sources, evidence, appearances and ordered enrichments.
- `vocabularies/`: controlled predicates and their allowed types.

Do not edit `generated/fallout-lore.db` or `public/data/runtime.json` by hand. Both are derived outputs.

### Rebuilding the database

```powershell
pnpm lore:build
```

Set `FLA_SQLITE3` to an explicit SQLite executable if `sqlite3` is not on `PATH`.

### Validation

```powershell
pnpm lore:validate
```

Validation reports the affected record and rule for duplicate IDs, missing references, predicate type violations, malformed temporal/spatial records, source integrity, alias collisions and relative-date cycles.

Run the editorial quality audit separately when reviewing ingestion work:

```powershell
pnpm lore:quality
```

It reports unsourced assertions, shallow major records, graph orphans, duplicate propositions, source-poor entities, undated events and spatial records missing precision metadata. Warnings identify editorial backlog; structural quality errors fail the command.

## Development and tests

```powershell
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

Run the complete data, test and frontend build gate with:

```powershell
pnpm check
```

## Packaging for Windows

```powershell
pnpm tauri build
```

The configured target is an NSIS installer. Output is written below `src-tauri/target/release/bundle/nsis/`.

## Architecture

```text
canonical JSON lore
        │
        ├── JSON Schema + semantic validation
        │
        ▼
generated SQLite + FTS5
        │
        ├── indexed entity, assertion, timeline, map and evidence queries
        │
        ▼
Tauri commands → React views
```

An entity is a stable identity. A relationship is an assertion whose object references another entity. Reverse navigation is derived from the predicate registry rather than stored as a duplicate fact. `validTime` describes when a state held; a temporal assertion object records the date being asserted. A condition set qualifies an assertion that only applies on one route or failure state, while an outcome group presents related alternatives. Spatial representations are independent of place identity and carry their own precision, confidence and basis.

## Contribution rules

1. Add or update canonical JSON, never the compiled database.
2. Use stable family-prefixed IDs and existing predicates where semantics match.
3. Keep world claims, source statements and editorial inference distinct; broad navigational associations must remain labelled inference.
4. Community-reference provenance is acceptable for routine informational profiles. Use claim-level released-game evidence for disputed, continuity-sensitive or high-impact propositions whenever practical.
5. Preserve approximate dates and places without manufacturing precision.
6. Run `pnpm check` and review generated changes before committing.

AI output is not evidence. Do not include extensive copyrighted dialogue, terminals, scripts, game art or wiki text. Use original neutral summaries and precise metadata/locators.

See [Docs/CONTENT_STANDARD.md](Docs/CONTENT_STANDARD.md) for the depth, sourcing and uncertainty standard established by the first production-quality cluster.

## Reference acquisition and coverage

The acquisition layer under `reference/` is cached, revision-aware and resumable. Its complete candidate manifest remains separate from canonical data; the explicit expansion command promotes a filtered released-material subset into transformed, attributed records under `lore/franchise/`.

```powershell
pnpm lore:reference:sync
pnpm lore:reference:sync fallout1
pnpm lore:coverage
pnpm lore:coverage fallout1
pnpm lore:expand
pnpm lore:expand:offline
```

Use `--offline` to require cache-only operation, `--refresh` to bypass the 24-hour cache TTL, or `--rebuild` to rerun extraction/classification without requiring changed wiki revisions. Normal tests use local fixtures and do not contact external services.

`lore:expand` acquires Tier 1/2 revision text, writes a stable per-page ignored cache, reconciles identities, and generates canonical JSON plus a completion manifest and depth audit. `lore:expand:offline` then reproduces the transformation without network access. Gameplay/reference-only, unreleased and low-value long-tail pages remain explicitly excluded.

See [Docs/REFERENCE_PIPELINE.md](Docs/REFERENCE_PIPELINE.md) for provider design, cache/security behaviour, scoring, reports, queues and the reviewed promotion workflow.

## Licensing and intellectual property

Project code is available under the MIT License. Original lore/reference content and compatible reference-derived data are separately covered by [LICENSE-DATA.md](LICENSE-DATA.md); source credits are in [ATTRIBUTION.md](ATTRIBUTION.md). Fallout and related names and settings remain the property of their respective rights holders; this independent project is not affiliated with or endorsed by Bethesda Softworks or ZeniMax Media. Bundled Natural Earth vector data is public domain and is credited in the map UI.

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for intentional v0.1 limits.
