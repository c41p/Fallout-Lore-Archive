# Known Issues — v0.1

- The representative dataset is intentionally small (47 entities) and is not an encyclopedic Fallout corpus.
- Some assertions do not yet have claim-level evidence links. The UI omits empty evidence sections rather than implying that missing sample citations are confirmed facts.
- Continuity uses a minimal `games_primary` classification. Television, Creation Club, Fallout Bible, cut content and other material need a researched taxonomy before bulk ingestion.
- The map uses point and approximate-radius presentation only. Polygons, routes, game-space coordinates and historical territory overlays are deferred.
- Regional marker centres are browsing anchors, not claimed GPS coordinates. Their notes and certainty labels are part of the record.
- The timeline is year-oriented and does not yet solve complex relative-only constraint layout.
- Search supports ranked prefix/alias matching and entity-type filtering; source-work, continuity, date and region filters are deferred.
- Entity pages expose structured relationship cards rather than a dedicated interactive graph canvas.
- Browser development uses generated JSON as a test fallback; the Tauri build is the authoritative SQLite runtime.
- Automatic update delivery, spoiler controls, bookmarks, user annotations, telemetry and accounts are intentionally absent.
- The NSIS installer is unsigned and may trigger Windows reputation warnings.
