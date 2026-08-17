import { describe, expect, it } from "vitest";
import { sanitizeReferenceArticle } from "../src/reference/article";
import type { ReferenceMapping } from "../src/types";

const mappings: ReferenceMapping[] = [{ id:"refmap.test.1", entityId:"ent.roger_maxson", providerId:"nukapedia", pageId:1, canonicalTitle:"Roger Maxson", canonicalUrl:"https://fallout.fandom.com/wiki/Roger_Maxson", retrievedAt:"2026-08-17T00:00:00Z", articleMode:"hybrid" }];

describe("integrated reference article sanitizer", () => {
  it("preserves useful article structure while removing executable and media content", () => {
    const result = sanitizeReferenceArticle(`<script>alert(1)</script><style>body{display:none}</style><h2 onclick="bad()">History</h2><p style="color:red">Text <strong>kept</strong><img src="x" onerror="bad()"></p><table><tr><th scope="col">Year</th><td colspan="2">2077</td></tr></table>`, mappings);
    expect(result.html).toContain("<h2 id=\"history\">History</h2>");
    expect(result.html).toContain("<strong>kept</strong>");
    expect(result.html).toContain("scope=\"col\"");
    expect(result.html).not.toMatch(/script|style=|onclick|onerror|<img/i);
    expect(result.headings).toEqual([{ id:"history", label:"History", level:2 }]);
  });
  it("rewrites mapped wiki links to Archive records and unknown pages to provider routes", () => {
    const result = sanitizeReferenceArticle(`<p><a href="/wiki/Roger_Maxson">Maxson</a> <a href="https://fallout.fandom.com/wiki/Unknown_Page">unknown</a> <a href="javascript:alert(1)">unsafe</a></p>`, mappings);
    expect(result.html).toContain(`href="#/entity/ent.roger_maxson"`);
    expect(result.html).toContain(`href="#/reference/nukapedia?title=Unknown%20Page"`);
    expect(result.html).not.toContain("javascript:");
  });
  it("marks ordinary HTTPS links for the safe external opener", () => {
    const result = sanitizeReferenceArticle(`<a href="https://example.org/source">source</a>`, mappings);
    expect(result.html).toContain(`data-external="true"`);
  });
});
