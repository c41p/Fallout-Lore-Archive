# Attribution

## Fallout Wiki / Nukapedia

The project uses the public MediaWiki API at [Fallout Wiki (Nukapedia)](https://fallout.fandom.com/) for its secondary reference corpus and integrated long-form reference layer.

The wiki's [copyright notice](https://fallout.fandom.com/wiki/Fallout_Wiki:Copyrights) states that community-authored wiki text is available under CC BY-SA 3.0 unless otherwise noted. Raw article bodies are not committed or packaged. The application fetches article HTML on demand, sanitizes it, rewrites safe internal links and stores visited revisions in a user-local cache. Each mapping and promoted SourceItem retains:

- wiki and source-site name;
- page title and canonical URL;
- page and revision IDs;
- revision and retrieval timestamps;
- content-licence and attribution URLs;
- redirect sources where available.

Candidate attribution is stored under `reference/manifests/reference-corpus.json`; promoted records point to human-readable SourceItems under `lore/franchise/source-items/`. Provider text remains attributed to the linked page and revision under its displayed terms. Local adapted expression is covered by `LICENSE-DATA.md` and its CC BY-SA terms. Contributors must inspect page-specific exceptions.

Wiki pages are secondary reference units, not official lore authorities. They provide a practical informational baseline and navigation layer. Disputed, continuity-sensitive and high-impact claims should be followed to underlying released material; existing primary-source evidence is preserved and takes precedence in editorial review.

## Natural Earth

The offline basemap uses [Natural Earth](https://www.naturalearthdata.com/). Natural Earth data is in the public domain under its [terms of use](https://www.naturalearthdata.com/about/terms-of-use/).

## Fallout intellectual property

Fallout and related names, characters, settings, game text, art, audio, marks and other protected material belong to their respective rights holders. This independent archive is not affiliated with or endorsed by Bethesda Softworks, ZeniMax Media, Microsoft, Interplay or other Fallout rights holders.

The project includes original summaries, structured facts, bibliographic metadata and short source locators; it does not grant rights to third-party Fallout assets.
