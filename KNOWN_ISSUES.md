# Known Issues — v0.1

- The archive now contains more than 340 canonical records and substantial flagship coverage for every major released game, but it is not an exhaustive franchise corpus. Long-tail people, quests, locations, equipment and update-specific Fallout 76 material remain in the reference candidate queue.
- The content-quality report still identifies legacy prototype assertions without claim-level evidence and supporting Fallout records that are indexed through appearances or object-side relationships but do not yet have their own subject assertion. The major Fallout records and article claims are source-backed; the UI omits empty evidence sections rather than imply support.
- Tactics, Brotherhood of Steel and Shelter now have explicit non-primary/supplementary scopes. Television, Creation Club, Fallout Bible, cut content and other material still need a researched taxonomy before bulk ingestion.
- The map uses point and approximate-radius presentation only. Polygons, routes, game-space coordinates and historical territory overlays are deferred.
- Regional marker centres are browsing anchors, not claimed GPS coordinates. Their notes and certainty labels are part of the record.
- The timeline contains a dense day-level 2073–2077 research sequence plus year/variable-date Fallout events, but it does not yet cluster same-day items or solve complex relative-only constraint layout.
- Search supports ranked prefix/alias matching, entity-type filtering and source-work scope. Continuity, date and region filters are deferred.
- Game pages now have curated featured routes for the principal games. Add-ons remain associated through appearances but do not yet have independent top-level game pages.
- Most broad-franchise promotion records currently cite clearly labelled secondary reference pages. These are useful discovery and verification routes, not substitutes for the claim-level released-game locators already present in the production Fallout 1/Maxson clusters.
- Later-game branching is preserved in prose and epistemic notes, but reusable `ConditionSet`/`OutcomeGroup` modelling is still concentrated in Fallout 1.
- Entity pages expose structured relationship cards rather than a dedicated interactive graph canvas.
- Browser development uses generated JSON as a test fallback; the Tauri build is the authoritative SQLite runtime.
- Automatic update delivery, spoiler controls, bookmarks, user annotations, telemetry and accounts are intentionally absent.
- The NSIS installer is unsigned and may trigger Windows reputation warnings.
