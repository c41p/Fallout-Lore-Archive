# Franchise ingestion status

This document is the review manifest for the first franchise-wide canonical promotion pass. It records what was promoted from the external reference corpus, what evidence class currently supports it, and where deeper primary-source extraction is still required. The machine-generated candidate corpus remains under `reference/`; the files under `lore/franchise/` are the curated canonical result.

## Delivered scope

| Work | Canonical pass | Current depth |
| --- | --- | --- |
| Fallout | Existing production cluster retained | Game-sized index plus deep Vault 13, Unity, Mariposa, FEV and Brotherhood histories |
| Fallout 2 | 16 major records | Chosen One, Arroyo, Vault City, northern California settlements, New Reno, San Francisco, Navarro, Horrigan and Marcus |
| Fallout Tactics | 8 major records | Warrior, Midwestern Brotherhood, Calculator, Vault 0 and principal enemy groups, explicitly scoped to the game's secondary-status continuity |
| Fallout: Brotherhood of Steel | 6 major records | Texas chapter, initiates, Carbon, Los, Attis and his army, isolated in a separate/disputed game continuity |
| Fallout 3 and add-ons | 26 major records | Lone Wanderer, Project Purity, Enclave/Brotherhood actors, major settlements, the Pitt, Point Lookout and Mothership Zeta |
| Fallout: New Vegas and DLC | 29 new major records plus 11 in-place upgrades | Courier, Strip/Freeside, faction infrastructure, major companions and all four narrative DLC clusters; mutually exclusive endings remain conditional |
| Fallout 4 and add-ons | 29 major records | Institute conflict, Commonwealth settlements, faction leadership, Automatron, Far Harbor and Nuka-World |
| Fallout 76 | 29 major records | Original Appalachian factions and plague, Wastelanders, Steel Dawn/Reign, Atlantic City, Skyline Valley and the released 2025 Burning Springs region |
| Fallout Shelter | 4 scoped records | Overseer, simulated Vault, dwellers and an explicit gameplay-forward continuity rule |

The canonical validator currently reports 410 entities after the cross-game event and Tier 2 gap-closure passes. The archive contains 196 major articles, while the new supporting set adds companions, faction leaders, major Vaults, facilities and regional organisations. Eleven additional events place the new clusters on the timeline at the precision supportable by their sources.

## Evidence tiers used in this pass

- Existing production clusters retain claim-level primary locators from released games.
- Bethesda release documentation is used as official supplementary evidence for Wastelanders, Steel Dawn and the released Burning Springs expansion.
- Fallout Wiki/Nukapedia pages are stored as clearly labelled secondary discovery and cross-check sources for the broad promotion batches. They are never labelled as primary game evidence, and their context directs editors to the cited released material.
- Fallout Tactics, Brotherhood of Steel and Fallout Shelter assertions use dedicated continuity scopes rather than being silently merged into `games_primary`.

The broad records are useful, connected articles, but a secondary reference link is not the final claim-level source standard. Future research should replace or supplement those links with precise dialogue, terminal, holotape, quest, ending and official-guide locators. Multiple locators supporting one proposition should attach to one Assertion through multiple EvidenceLinks.

## Curated priority manifest

The automated Tier 1 queue contains category and title false positives, including generic equipment and list pages. Promotion therefore used a curated flagship manifest rather than mechanically converting every Tier 1 candidate. The review priority for primary-source deepening is:

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

Run the cached reference rebuild after canonical promotion so page candidates are rematched against the new entity names. Coverage percentages measure candidate matching and article depth; they do not certify primary-source completeness.

## Research gaps

- Most newly promoted broad-franchise claims still require claim-level primary locators.
- Conditional outcome groups are strongest in Fallout 1; later games currently explain branching in prose but need reusable `ConditionSet` and `OutcomeGroup` records for their principal endings.
- Tactics, Brotherhood of Steel and Shelter have correct continuity boundaries but need more internal source items before further expansion.
- The Fallout 76 world evolves through updates; post-2024 records require periodic official-release verification and in-game extraction rather than model-memory updates.
- Forty-one mostly minor legacy Fallout 1/prototype records remain orphaned or subject-assertion-light in the quality report. They are retained because appearances and object-side relationships are still useful, but they are an editorial backlog.

The best next automated expansion target is a claim-level primary-source locator pass for Fallout 2, followed by reusable conditional outcome modelling for New Vegas. That sequence improves evidence quality and branch handling before adding more long-tail entities.
