import { describe, expect, it } from "vitest";
import { formatTemporal, statusLabel, typeLabel } from "../src/lib/format";

describe("presentation formatting", () => {
  it("does not invent missing date components", () => expect(formatTemporal({ kind:"point", start:{year:2189}, precision:"year" })).toBe("2189"));
  it("uses the editorial display for approximate dates", () => expect(formatTemporal({ kind:"point", start:{year:2077}, precision:"approximate", approximate:true, display:"late 2077" })).toBe("late 2077"));
  it("makes controlled terms readable", () => { expect(statusLabel("strongly_supported")).toBe("Strongly supported"); expect(typeLabel("substance_condition")).toBe("Substance / condition"); });
});
