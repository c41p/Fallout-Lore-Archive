# Known Issues — v0.1

- The 186-record dataset is not yet an encyclopedic franchise corpus. Fallout (1997) and the Roger Maxson/Mariposa/FEV cluster now have substantial depth; most Fallout 2 and later-game records remain intentionally representative.
- The content-quality report still identifies legacy prototype assertions without claim-level evidence and supporting Fallout records that are indexed through appearances or object-side relationships but do not yet have their own subject assertion. The major Fallout records and article claims are source-backed; the UI omits empty evidence sections rather than imply support.
- Continuity uses a minimal `games_primary` classification. Television, Creation Club, Fallout Bible, cut content and other material need a researched taxonomy before bulk ingestion.
- The map uses point and approximate-radius presentation only. Polygons, routes, game-space coordinates and historical territory overlays are deferred.
- Regional marker centres are browsing anchors, not claimed GPS coordinates. Their notes and certainty labels are part of the record.
- The timeline contains a dense day-level 2073–2077 research sequence plus year/variable-date Fallout events, but it does not yet cluster same-day items or solve complex relative-only constraint layout.
- Search supports ranked prefix/alias matching, entity-type filtering and source-work scope. Continuity, date and region filters are deferred.
- Game pages exist for every indexed game, but Fallout (1997) is the only game with a deliberately game-sized index and curated featured route in this pass.
- Entity pages expose structured relationship cards rather than a dedicated interactive graph canvas.
- Browser development uses generated JSON as a test fallback; the Tauri build is the authoritative SQLite runtime.
- Automatic update delivery, spoiler controls, bookmarks, user annotations, telemetry and accounts are intentionally absent.
- The NSIS installer is unsigned and may trigger Windows reputation warnings.
