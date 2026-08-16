import type { EntityType, TemporalValue } from "../types";

export const typeLabels: Record<EntityType, string> = {
  individual: "People",
  organisation: "Factions & organisations",
  place: "Locations",
  event: "Events",
  technology: "Technology",
  substance_condition: "Substances & conditions",
  artefact: "Artefacts",
  concept: "Concepts"
};

export function formatTemporal(value?: TemporalValue): string {
  if (!value) return "Date not recorded";
  if (value.display) return value.display;
  const date = value.start ?? value.end;
  if (!date) return value.kind === "unknown" ? "Unknown date" : "Relative date";
  const month = date.month ? new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, date.month - 1, 1))) : "";
  const rendered = date.day ? `${date.day} ${month} ${date.year}` : date.month ? `${month} ${date.year}` : String(date.year);
  return value.approximate ? `Approximately ${rendered}` : rendered;
}

export function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function typeLabel(type: EntityType): string {
  return typeLabels[type].replace("People", "Individual").replace("Factions & organisations", "Organisation").replace("Locations", "Place").replace("Events", "Event").replace("Substances & conditions", "Substance / condition").replace("Technology", "Technology");
}
