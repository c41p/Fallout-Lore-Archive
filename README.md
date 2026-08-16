# Fallout Lore Archive

Fallout Lore Archive v0.1 is a Windows-first, local desktop prototype for exploring interconnected Fallout history. One evidence-aware dataset drives search, category browsing, entity records, chronology, geography, reverse relationships, appearances, sources, uncertainty and disputes.

The prototype contains 47 representative records around the early Brotherhood of Steel, Mariposa and FEV, early California and the NCR, and the Mojave conflict. It deliberately favours a small, reviewable sample over unsupported encyclopedic coverage.

## What works

- Local SQLite/FTS5 search over canonical names, aliases, summaries, descriptions and tags.
- Browse filters for people, organisations, places, events, technology and other record types.
- Entity pages with derived reverse links, temporal state, source locators and appearances.
- Precision-aware timeline with exact, year-only and approximate dates.
- Offline Leaflet map backed by bundled public-domain Natural Earth vectors.
- Exact and approximate map representations that are visually and textually distinct.
- Evidence links that distinguish source work, source item, role and directness.
- A Jet-origin dispute that preserves separate source statements and editorial inference.
- Canonical JSON validation and deterministic SQLite compilation.

## Prerequisites

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

An entity is a stable identity. A relationship is an assertion whose object references another entity. Reverse navigation is derived from the predicate registry rather than stored as a duplicate fact. `validTime` describes when a state held; a temporal assertion object records the date being asserted. Spatial representations are independent of place identity and carry their own precision, confidence and basis.

## Contribution rules

1. Add or update canonical JSON, never the compiled database.
2. Use stable family-prefixed IDs and existing predicates where semantics match.
3. Keep world claims, source statements and editorial inference distinct.
4. Add source metadata and locators for substantive assertions where defensible.
5. Preserve approximate dates and places without manufacturing precision.
6. Run `pnpm check` and review generated changes before committing.

AI output is not evidence. Do not include extensive copyrighted dialogue, terminals, scripts, game art or wiki text. Use original neutral summaries and precise metadata/locators.

## Licensing and intellectual property

Project code is available under the MIT License. Fallout and related names and settings remain the property of their respective rights holders; this independent project is not affiliated with or endorsed by Bethesda Softworks or ZeniMax Media. Bundled Natural Earth vector data is public domain and is credited in the map UI.

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for intentional v0.1 limits.
