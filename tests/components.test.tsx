import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EntityCard } from "../src/components/EntityCard";
import { StatusBadge } from "../src/components/StatusBadge";

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
});
