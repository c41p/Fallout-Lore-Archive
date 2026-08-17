# Known Issues — v0.1

- The archive contains 2,358 canonical records and broad released-game coverage, but it is not an exhaustive franchise corpus. The completion manifest retains explicit exclusions for mechanical, reference-only, unreleased and low-value long-tail candidates.
- The content-quality report still identifies legacy prototype assertions without claim-level evidence and supporting Fallout records that are indexed through appearances or object-side relationships but do not yet have their own subject assertion. The major Fallout records and article claims are source-backed; the UI omits empty evidence sections rather than imply support.
- Tactics, Brotherhood of Steel and Shelter now have explicit non-primary/supplementary scopes. Television, Creation Club, Fallout Bible, cut content and other material still need a researched taxonomy before bulk ingestion.
- The map uses point and approximate-radius presentation only. Polygons, routes, game-space coordinates and historical territory overlays are deferred.
- Regional marker centres are browsing anchors, not claimed GPS coordinates. Their notes and certainty labels are part of the record.
- The timeline contains a dense day-level 2073–2077 research sequence plus year/variable-date Fallout events, but it does not yet cluster same-day items or solve complex relative-only constraint layout.
- Search supports ranked prefix/alias matching, entity-type filtering and source-work scope. Continuity, date and region filters are deferred.
- Game pages now have curated featured routes for the principal games. Add-ons remain associated through appearances but do not yet have independent top-level game pages.
- Most broad-franchise identities use revision-attributed Nukapedia articles for long-form reading. This is an intentional reference layer, not a statement of official canon authority. Claim-level released-game locators remain strongest in the Fallout 1/Maxson clusters and are the principal future evidence-deepening backlog.
- A provider article must be visited online once before it is available from the local stale-cache fallback. The structured record, maps, chronology and connections remain usable when the provider is offline.
- Provider mappings are page-ID based, but wiki redirects and franchise-specific homonyms still require editorial review as provider taxonomy evolves. The core Maxson/Mariposa/Brotherhood/FEV mappings are explicitly pinned and revision-checked.
- The quality report currently lists 26 mostly legacy graph orphans, 30 unsourced legacy assertions and a small undated-event backlog. It has no structural errors, and all generated promoted profiles carry source-backed assertions.
- Later-game branching is preserved in prose and epistemic notes, but reusable `ConditionSet`/`OutcomeGroup` modelling is still concentrated in Fallout 1.
- Entity pages expose structured relationship cards rather than a dedicated interactive graph canvas.
- Browser development uses generated JSON as a test fallback; the Tauri build is the authoritative SQLite runtime.
- Automatic update delivery, spoiler controls, bookmarks, user annotations, telemetry and accounts are intentionally absent.
- The NSIS installer is unsigned and may trigger Windows reputation warnings.
