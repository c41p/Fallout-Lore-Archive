import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EntityCard } from "../src/components/EntityCard";
import { StatusBadge } from "../src/components/StatusBadge";
import { RelationshipExplorer } from "../src/components/RelationshipExplorer";
import { LorePathsPage } from "../src/pages/LorePathsPage";
import type { RelationshipView } from "../src/types";

describe("record presentation", () => {
  it("links search/browse cards to stable entity routes", () => {
    render(<MemoryRouter><EntityCard entity={{ id:"ent.fev", type:"substance_condition", subtype:"biological_agent", displayName:"Forced Evolutionary Virus", summary:"A structured sample.", tags:["fev"], recordStatus:"reviewed" }} /></MemoryRouter>);
    expect(screen.getByRole("link", { name:/Forced Evolutionary Virus/ })).toHaveAttribute("href", "/entity/ent.fev");
    expect(screen.getByText("Substance / condition · biological agent")).toBeInTheDocument();
  });
  it("renders uncertainty with text rather than colour alone", () => { render(<StatusBadge value="disputed" />); expect(screen.getByText("Disputed")).toBeVisible(); });
  it("explains article-body search matches without replacing the record summary", () => {
    render(<MemoryRouter><EntityCard entity={{ id:"ent.roger_maxson", type:"individual", subtype:"person", displayName:"Roger Maxson", summary:"Founding Brotherhood leader.", tags:["brotherhood"], recordStatus:"reviewed", aliases:[], rank:25, matchField:"article", matchSnippet:"…a displaced community at Lost Hills" }} /></MemoryRouter>);
    expect(screen.getByText("Founding Brotherhood leader.")).toBeVisible();
    expect(screen.getByText(/Matched in article/)).toBeVisible();
    expect(screen.getByText(/displaced community/)).toBeVisible();
  });
  it("filters and progressively reveals dense relationship sets", () => {
    const relationships: RelationshipView[] = Array.from({ length: 40 }, (_, index) => ({ assertionId: `asrt.${index}`, direction: "outgoing", label: "associated with", entity: { id: `ent.${index}`, type: index % 2 ? "place" : "individual", subtype: "test", displayName: `Record ${index}`, summary: "Connected record", tags: [], recordStatus: "reviewed" }, epistemicStatus: "inferred" }));
    const { container } = render(<MemoryRouter><RelationshipExplorer relationships={relationships} /></MemoryRouter>);
    expect(container.querySelectorAll(".relationship-grid > a")).toHaveLength(36);
    fireEvent.click(screen.getByRole("button", { name: "Locations" }));
    expect(container.querySelectorAll(".relationship-grid > a")).toHaveLength(20);
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });
  it("renders curated Lore Paths as connected entity routes", () => {
    render(<MemoryRouter><LorePathsPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Lore Paths" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Origins of the Brotherhood" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Roger Maxson" })).toHaveAttribute("href", "/entity/ent.roger_maxson");
  });
});
