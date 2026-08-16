import { describe, expect, it } from "vitest";
import { analyseContentQuality, loadDataset, validateDataset } from "../scripts/lore";
import type { LoreDataset } from "../src/types";

const copy = (): LoreDataset => structuredClone(loadDataset());

describe("canonical lore validation", () => {
  it("accepts the representative dataset", () => expect(validateDataset(copy()).errors).toEqual([]));
  it("rejects duplicate stable IDs", () => { const dataset = copy(); dataset.entities.push(structuredClone(dataset.entities[0])); expect(validateDataset(dataset).errors.join("\n")).toContain("duplicate ID"); });
  it("rejects missing entity references", () => { const dataset = copy(); dataset.assertions[0].object = { entityId: "ent.missing" }; expect(validateDataset(dataset).errors.join("\n")).toContain("missing object entity ent.missing"); });
  it("rejects unknown predicates", () => { const dataset = copy(); dataset.assertions[0].predicateId = "pred.unknown"; expect(validateDataset(dataset).errors.join("\n")).toContain("unknown predicate pred.unknown"); });
  it("rejects invalid subject/object types", () => { const dataset = copy(); dataset.assertions[0].subjectId = "ent.hoover_dam"; expect(validateDataset(dataset).errors.join("\n")).toContain("place is not allowed"); });
  it("rejects malformed temporal values", () => { const dataset = copy(); dataset.assertions.find((a) => a.object.temporal)!.object.temporal!.start = { year: 2077, day: 23 }; expect(validateDataset(dataset).errors.join("\n")).toContain("day requires month"); });
  it("rejects malformed spatial records", () => { const dataset = copy(); dataset.spatialRepresentations[0].latitude = 190; expect(validateDataset(dataset).errors.join("\n")).toContain("must be <= 90"); });
  it("rejects broken source links", () => { const dataset = copy(); dataset.evidenceLinks[0].sourceItemId = "src.missing"; expect(validateDataset(dataset).errors.join("\n")).toContain("missing source item"); });
  it("rejects broken article assertion and related-record links", () => {
    const dataset = copy(); const section = dataset.entities.find((entity) => entity.id === "ent.roger_maxson")!.articleSections![0];
    section.assertionIds.push("asrt.missing"); section.relatedEntityIds!.push("ent.missing");
    expect(validateDataset(dataset).errors.join("\n")).toContain("missing supporting assertion asrt.missing");
    expect(validateDataset(dataset).errors.join("\n")).toContain("missing related entity ent.missing");
  });
  it("rejects malformed source URLs", () => { const dataset = copy(); dataset.sourceItems[0].url = "not a locator"; expect(validateDataset(dataset).errors.join("\n")).toContain("malformed source URL"); });
  it("flags major records without substantive sectioning", () => {
    const dataset = copy(); const maxson = dataset.entities.find((entity) => entity.id === "ent.roger_maxson")!; maxson.articleSections = maxson.articleSections!.slice(0, 1);
    expect(analyseContentQuality(dataset).errors.join("\n")).toContain("major entity needs at least three article sections");
  });
  it("reports cross-entity alias collisions for review", () => { const dataset = copy(); dataset.names.push({ id:"name.test.collision", entityId:"ent.tandi", name:"FEV", kind:"nickname" }); expect(validateDataset(dataset).warnings.join("\n")).toContain("alias collision 'fev'"); });
  it("rejects cycles in relative chronology", () => {
    const dataset = copy();
    dataset.assertions.push({ id:"asrt.test.relative_a", subjectId:"ent.great_war", predicateId:"pred.occurred_at_time", object:{ temporal:{ kind:"relative", relativeConstraints:[{relation:"before",entityId:"ent.mariposa_rebellion"}] } }, assertionMode:"editorial_inference", epistemicStatus:"uncertain", continuityScope:["games_primary"] });
    dataset.assertions.push({ id:"asrt.test.relative_b", subjectId:"ent.mariposa_rebellion", predicateId:"pred.occurred_at_time", object:{ temporal:{ kind:"relative", relativeConstraints:[{relation:"before",entityId:"ent.great_war"}] } }, assertionMode:"editorial_inference", epistemicStatus:"uncertain", continuityScope:["games_primary"] });
    expect(validateDataset(dataset).errors.join("\n")).toContain("contain a cycle");
  });
});
