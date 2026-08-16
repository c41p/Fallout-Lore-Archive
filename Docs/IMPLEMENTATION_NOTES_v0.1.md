# Fallout Lore Archive v0.1 implementation notes

## Decisions

- Tauri 2, React, TypeScript and Rust preserve the project’s provisional desktop direction.
- SQLite is compiled with FTS5 for runtime search; JSON remains the only canonical editable data.
- The compiler uses the standard SQLite CLI instead of a native Node binding, reducing Windows/Node ABI friction.
- Leaflet renders a bundled Natural Earth GeoJSON basemap without live tile or account dependencies.
- A compact predicate registry constrains relationship semantics and supplies inverse labels.
- The Jet-origin example is modelled as separate qualified assertions linked through a dispute, not as a resolved fact.
- Roger Maxson’s pre- and post-War affiliations demonstrate assertion `validTime` independently of event dates.

## Pragmatic simplifications

- Canonical record families are grouped into reviewable JSON files rather than one file per record.
- The spatial prototype supports exact and approximate points; the schema remains extensible to areas, routes and game coordinates.
- The continuity vocabulary is deliberately minimal until a dedicated canon/status research pass is completed.
- The web-development fallback derives the same views from generated JSON, while production Tauri commands use SQLite.

## Data review notes

Sample prose is original and neutral. Source items identify works and locators without redistributing extensive copyrighted text. Approximate marker coordinates are explicitly labelled as nominal browsing representations and must not be reused as asserted exact locations.
