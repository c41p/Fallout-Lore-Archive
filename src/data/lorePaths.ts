export interface LorePathStep { entityId: string; label: string; transition?: string }
export interface LorePath { id: string; title: string; summary: string; steps: LorePathStep[] }

export const lorePaths: LorePath[] = [
  { id: "brotherhood-origins", title: "Origins of the Brotherhood", summary: "Follow the institutional chain from secret FEV research to the order established at Lost Hills.", steps: [
    { entityId: "ent.mariposa", label: "Mariposa Military Base" }, { entityId: "ent.fev", label: "Forced Evolutionary Virus", transition: "research programme" },
    { entityId: "ent.roger_maxson", label: "Roger Maxson", transition: "security command" }, { entityId: "ent.mariposa_rebellion", label: "Mariposa Rebellion", transition: "break with authority" },
    { entityId: "ent.exodus", label: "Exodus from Mariposa", transition: "survival and migration" }, { entityId: "ent.lost_hills", label: "Lost Hills", transition: "new home" },
    { entityId: "ent.brotherhood", label: "Brotherhood of Steel", transition: "new institution" }
  ] },
  { id: "rise-of-ncr", title: "Rise of the NCR", summary: "Trace the communities, leaders and expansion that turned a Vault-descended settlement into a regional republic.", steps: [
    { entityId: "ent.vault_15", label: "Vault 15" }, { entityId: "ent.shady_sands", label: "Shady Sands", transition: "settlement" },
    { entityId: "ent.aradesh", label: "Aradesh", transition: "founding leadership" }, { entityId: "ent.tandi", label: "Tandi", transition: "political development" },
    { entityId: "ent.ncr", label: "New California Republic", transition: "republic" }, { entityId: "ent.mojave", label: "Mojave Wasteland", transition: "eastward expansion" },
    { entityId: "ent.hoover_dam", label: "Hoover Dam", transition: "strategic frontier" }
  ] },
  { id: "history-of-fev", title: "History of FEV", summary: "Move through the organisations, experiments and mutant programmes that reused FEV across different regions and eras.", steps: [
    { entityId: "ent.west_tek", label: "West Tek" }, { entityId: "ent.fev", label: "Forced Evolutionary Virus", transition: "research" },
    { entityId: "ent.mariposa", label: "Mariposa Military Base", transition: "human experimentation" },
    { entityId: "ent.master", label: "Richard Grey / The Master", transition: "transformation and new identity" }, { entityId: "ent.unity", label: "Unity", transition: "mutant programme" },
    { entityId: "ent.enclave", label: "Enclave", transition: "post-War research" }, { entityId: "ent.vault_87", label: "Vault 87", transition: "eastern strain" },
    { entityId: "ent.institute", label: "Institute", transition: "Commonwealth experiments" }, { entityId: "ent.appalachia", label: "Appalachia", transition: "regional variants" }
  ] },
  { id: "road-to-hoover-dam", title: "Road to Hoover Dam", summary: "Explore the competing powers and earlier battle that set the conditions for the Mojave conflict's climax.", steps: [
    { entityId: "ent.ncr", label: "New California Republic" }, { entityId: "ent.mojave", label: "Mojave Wasteland", transition: "campaign frontier" },
    { entityId: "ent.first_hoover_battle", label: "First Battle of Hoover Dam", transition: "first confrontation" }, { entityId: "ent.robert_house", label: "Robert House", transition: "New Vegas power" },
    { entityId: "ent.caesars_legion", label: "Caesar's Legion", transition: "eastern expansion" }, { entityId: "ent.second_hoover_battle", label: "Second Battle of Hoover Dam", transition: "conditional climax" }
  ] },
  { id: "enclave-survival", title: "Survival of the Enclave", summary: "Follow the pre-War state remnant from its institutional roots through western and eastern campaigns.", steps: [
    { entityId: "ent.united_states", label: "United States" }, { entityId: "ent.great_war", label: "Great War", transition: "state collapse" },
    { entityId: "ent.enclave", label: "Enclave", transition: "continuity government" }, { entityId: "ent.frank_horrigan", label: "Frank Horrigan", transition: "western campaign" },
    { entityId: "ent.raven_rock", label: "Raven Rock", transition: "eastern headquarters" }, { entityId: "ent.project_purity", label: "Project Purity", transition: "Capital Wasteland conflict" }
  ] },
  { id: "appalachian-recovery", title: "Appalachian Recovery", summary: "Follow the early post-War factions, plague response and later return of organised settlement to Appalachia.", steps: [
    { entityId: "ent.vault_76", label: "Vault 76" }, { entityId: "ent.appalachia", label: "Appalachia", transition: "reclamation" },
    { entityId: "ent.responders", label: "Responders", transition: "civil defence" }, { entityId: "ent.scorched_plague", label: "Scorched Plague", transition: "regional catastrophe" },
    { entityId: "ent.inoculation_project", label: "Scorched inoculation project", transition: "countermeasure" }, { entityId: "ent.foundation", label: "Foundation", transition: "resettlement" },
    { entityId: "ent.burning_springs", label: "Burning Springs", transition: "later expansion" }
  ] }
];
