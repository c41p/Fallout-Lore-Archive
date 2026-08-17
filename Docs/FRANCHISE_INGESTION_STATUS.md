# Franchise ingestion status

This document summarizes the franchise-wide canonical baseline. The authoritative record-by-record disposition is `reference/manifests/franchise-completion.json`; the files under `lore/franchise/` are the generated canonical transformation.

## Delivered scope

| Work | Promoted subject-work associations | Coverage character |
| --- | ---: | --- |
| Fallout | 143 | Existing production cluster retained and connected to the franchise baseline |
| Fallout 2 | 260 | Main people, settlements, factions, events and supporting subjects |
| Fallout Tactics | 63 | Scoped to the game's secondary-status continuity |
| Fallout: Brotherhood of Steel | 93 | Isolated in a separate/disputed game continuity |
| Fallout 3 and add-ons | 397 | Capital Wasteland plus major add-on clusters |
| Fallout: New Vegas and DLC | 498 | Mojave factions, settlements, events, companions and narrative DLC |
| Fallout 4 and add-ons | 525 | Commonwealth factions, locations, people and add-on clusters |
| Fallout 76 | 515 | Appalachian eras, factions, updates and supporting subjects |
| Fallout Shelter | 148 | Explicitly gameplay-forward supplementary scope |

The canonical validator reports 2,358 entities and 2,121 stable provider mappings. The graph contains more than 9,500 relationship edges and the timeline contains 159 dated records. Purposeful local synthesis remains concentrated in the primary-research clusters; the broader franchise receives integrated provider reading instead of generated depth-padding sections.

## Evidence tiers used in this pass

- Existing production clusters retain claim-level primary locators from released games.
- Bethesda release documentation is used as official supplementary evidence for Wastelanders, Steel Dawn and the released Burning Springs expansion.
- Fallout Wiki/Nukapedia revisions provide the routine informational baseline for broad promotion batches. They remain clearly labelled secondary sources and are never presented as official canon authority.
- Fallout Tactics, Brotherhood of Steel and Fallout Shelter assertions use dedicated continuity scopes rather than being silently merged into `games_primary`.

The broad records are useful, connected articles. Future research should selectively supplement sensitive and high-value claims with precise dialogue, terminal, holotape, quest, ending and official-guide locators. Multiple locators supporting one proposition attach to one Assertion through multiple EvidenceLinks.

## Curated priority manifest

The selection excludes category/title artefacts, generic equipment, mechanical pages, source records, unreleased material and the low-value long tail. The review priority for primary-source deepening is:

1. Fallout 2: Chosen One, Enclave, Frank Horrigan, Vault City, New Reno, Shi and the Oil Rig campaign.
2. Fallout 3: Lone Wanderer, Project Purity, James, Lyons' Brotherhood, Autumn/Eden and the Pitt.
3. New Vegas: Courier, House, Caesar/Legion, NCR occupation, Hoover Dam, Elijah and Ulysses.
4. Fallout 4: Sole Survivor, Institute/Shaun, synth identity, Railroad, Minutemen, Arthur Maxson and DiMA.
5. Fallout 76: the scorched research chain, original Appalachian organisations, Wastelanders gold dispute, Rahmani/Shin schism, Vault 63 and Burning Springs in-game quest records.

## Commands

```powershell
pnpm lore:reference:sync -- --rebuild
pnpm lore:coverage
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
```

Run the cached reference rebuild after canonical promotion so page candidates are rematched against new entity names. Coverage percentages measure identity and provider/graph integration; they do not certify primary-source completeness.

## Research gaps

- Most newly promoted broad-franchise claims still require claim-level primary locators.
- Conditional outcome groups are strongest in Fallout 1; later games currently explain branching in prose but need reusable `ConditionSet` and `OutcomeGroup` records for their principal endings.
- Tactics, Brotherhood of Steel and Shelter have correct continuity boundaries but need more internal source items before further expansion.
- The Fallout 76 world evolves through updates; post-2024 records require periodic official-release verification and in-game extraction rather than model-memory updates.
- Twenty-six mostly minor legacy records remain graph-orphaned in the quality report. They are retained because appearances and non-relationship data remain useful, but they are an editorial backlog.

The best next automated expansion target is a claim-level primary-source locator pass for Fallout 2, followed by reusable conditional outcome modelling for New Vegas. That sequence improves evidence quality and branch handling before adding more long-tail entities.
