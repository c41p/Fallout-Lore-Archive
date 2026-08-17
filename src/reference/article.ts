import type { ReferenceMapping } from "../types";

export interface ArticleHeading { id: string; label: string; level: number }
export interface SanitizedArticle { html: string; headings: ArticleHeading[] }

const allowed = new Set(["P", "H2", "H3", "H4", "H5", "UL", "OL", "LI", "STRONG", "EM", "B", "I", "A", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "CAPTION", "SUP", "SUB", "BLOCKQUOTE", "DL", "DT", "DD", "HR", "BR", "CODE", "PRE", "SMALL", "SPAN"]);
const omitted = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "IMG", "VIDEO", "AUDIO", "SVG", "CANVAS", "NOSCRIPT"]);

function slug(value: string, fallback: string) {
  return value.toLocaleLowerCase("en-US").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || fallback;
}

function wikiTitle(href: string): string | undefined {
  try {
    const url = new URL(href, "https://fallout.fandom.com");
    if (url.hostname !== "fallout.fandom.com" || !url.pathname.startsWith("/wiki/")) return undefined;
    return decodeURIComponent(url.pathname.slice(6)).replaceAll("_", " ");
  } catch { return undefined; }
}

export function sanitizeReferenceArticle(sourceHtml: string, mappings: ReferenceMapping[]): SanitizedArticle {
  const source = new DOMParser().parseFromString(sourceHtml, "text/html");
  source.querySelectorAll(".mw-editsection,.navbox,.vertical-navbox,.metadata,.ambox,.portable-infobox,.toc,.reference,.noprint").forEach((node) => node.remove());
  const output = document.implementation.createHTMLDocument("");
  const headings: ArticleHeading[] = []; const usedIds = new Set<string>();
  const mappingByTitle = new Map(mappings.map((mapping) => [mapping.canonicalTitle.toLocaleLowerCase("en-US"), mapping]));

  const clean = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return output.createTextNode(node.textContent ?? "");
    if (!(node instanceof Element) || omitted.has(node.tagName) || !allowed.has(node.tagName)) {
      if (node instanceof Element && omitted.has(node.tagName)) return null;
      const fragment = output.createDocumentFragment(); node.childNodes.forEach((child) => { const value = clean(child); if (value) fragment.append(value); }); return fragment;
    }
    const element = output.createElement(node.tagName.toLocaleLowerCase("en-US"));
    if (["TD", "TH"].includes(node.tagName)) for (const attribute of ["rowspan", "colspan", "scope"]) { const value = node.getAttribute(attribute); if (value && /^\d+$|^(row|col)$/.test(value)) element.setAttribute(attribute, value); }
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? ""; const title = wikiTitle(href);
      if (title) {
        const mapping = mappingByTitle.get(title.toLocaleLowerCase("en-US"));
        element.setAttribute("href", mapping ? `#/entity/${mapping.entityId}` : `#/reference/nukapedia?title=${encodeURIComponent(title)}`);
      } else {
        try { const url = new URL(href); if (["http:", "https:"].includes(url.protocol)) { element.setAttribute("href", url.href); element.setAttribute("data-external", "true"); } }
        catch { /* unsafe or relative non-wiki link intentionally loses its target */ }
      }
    }
    node.childNodes.forEach((child) => { const value = clean(child); if (value) element.append(value); });
    if (/^H[2-5]$/.test(node.tagName)) {
      let id = slug(element.textContent ?? "", `section-${headings.length + 1}`); let suffix = 2;
      while (usedIds.has(id)) id = `${id}-${suffix++}`; usedIds.add(id); element.id = id;
      headings.push({ id, label: element.textContent?.trim() ?? id, level: Number(node.tagName[1]) });
    }
    return element;
  };
  source.body.childNodes.forEach((node) => { const value = clean(node); if (value) output.body.append(value); });
  return { html: output.body.innerHTML, headings };
}
