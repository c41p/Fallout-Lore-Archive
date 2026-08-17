# Integrated Reference Articles Architecture

## Product boundary

Fallout Lore Archive owns the things that make the corpus explorable: stable entity identity, aliases, assertions, evidence, relationships, reverse traversal, chronology, spatial representations, appearances, disputes, game indexes and Lore Paths. A reference provider supplies long-form encyclopedic reading.

This boundary avoids copying an external encyclopedia into canonical JSON or manufacturing filler prose to make every local record appear complete. A provider article is readable inside the Archive, but it does not silently become an Archive world claim.

## Article modes

- `reference`: the provider article is the primary long-form reading surface; local structured exploration remains below it.
- `local`: the Archive supplies its own article and has no required provider dependency.
- `hybrid`: clearly labelled Archive synthesis appears alongside the integrated provider article. The Maxson/Mariposa/FEV/Lost Hills cluster uses this mode because its local primary-source research adds real editorial value.

`ReferenceMapping` joins one Archive entity to a stable provider/page ID and stores canonical title, URL, known revision metadata, retrieval time and article mode. SQLite enforces one page per provider and one provider mapping per entity. Curated mappings take precedence over automated matching for important or ambiguous identities.

## Runtime flow

```text
Entity route
  ├─ local SQLite/JSON detail (always available)
  └─ ReferenceMapping
       └─ Tauri provider command
            ├─ fresh user cache → return immediately
            ├─ MediaWiki parse API → refresh cache
            └─ network/provider failure → stale cache or non-fatal error
                 ↓
          whitelist sanitizer + link rewriter
                 ↓
          native React article + attribution footer
```

The desktop client uses Rust `reqwest` with a project User-Agent, 30-second timeout, 250 ms request spacing and bounded retries. Parsed articles are cached by stable page ID and canonical title under the application cache directory. Entries are fresh for 24 hours. A failed refresh serves a visited stale revision with an explicit warning.

Browser development mode uses the same MediaWiki API with `origin=*` and a localStorage cache. The Tauri SQLite/runtime path is authoritative for packaged behavior.

## Security and presentation

Provider HTML is never placed in an iframe and is never trusted directly. The frontend reconstructs a new document from a small tag whitelist. It removes scripts, styles, media, forms, embeds, inline event handlers, inline styles, provider navigation and other clutter. Only safe table span/scope attributes survive.

Wiki links are rewritten to an Archive entity when a canonical provider-title mapping exists. Unknown wiki links open a provider-only Archive route. Ordinary HTTP(S) links are intercepted by the existing safe external opener. Unsafe protocols lose their targets. Images and other remote media are not rendered.

Every article shows provider name, page/revision identity, retrieval time, cache state, text licence and a link to the original page. Provider failure never removes the local record or its exploration tools.

## Search

Local FTS remains authoritative and appears first. It searches names, aliases, local summaries/descriptions, genuine local article sections and tags. A separate remote provider search appears only for unscoped text queries. Mapped results open their entity; unmapped results open the provider-only route. Provider failure is isolated from local results.

## Migration from the generated-depth model

Retained:

- canonical JSON, semantic validation, deterministic SQLite and FTS;
- structured entities/assertions/evidence, aliases and appearances;
- primary-source local research, disputes, chronology, maps, games and Lore Paths;
- acquisition manifests and bounded structured extraction.

Deprecated and removed:

- generated `reference-*` article sections as the default reading layer;
- `depth-closure.json` filler sections;
- word-count/section-count acceptance thresholds;
- `content-depth.json` and its shallow-record queue.

Replaced by:

- stable `ReferenceMapping` shards and the `reference_mappings` SQLite table;
- `reference` / `local` / `hybrid` modes;
- runtime provider/cache/sanitizer components;
- `integrated-reference-coverage.json`, which measures mapping, relationship, timeline and spatial integration instead of prose volume.

## Verification

Run:

```powershell
pnpm lore:expand:offline
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Automated tests use fixture HTML and never require a live provider. Manual release checks should cover a hybrid mapped page, a provider-only page, local plus remote search, internal link rewriting, cache refresh, stale fallback, attribution, timeline and map preservation.
