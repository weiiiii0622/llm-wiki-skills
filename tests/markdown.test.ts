import { describe, expect, it } from "vitest";
import { extractFrontmatter, extractWikilinks, slugify } from "../src/core/markdown.js";

describe("markdown helpers", () => {
  it("slugifies stable wiki titles", () => {
    expect(slugify("Graph First Vault!")).toBe("graph-first-vault");
  });

  it("extracts wikilinks without aliases or headings", () => {
    expect(extractWikilinks("See [[topics/Graph First Vault|vault]] and [[Source#Quote]].")).toEqual([
      "Source",
      "topics/Graph First Vault"
    ]);
  });

  it("parses simple frontmatter lists", () => {
    const parsed = extractFrontmatter("---\ntype: topic\nsources:\n  - \"[[source]]\"\n---\n# Body\n", "page.md");
    expect(parsed.frontmatter).toEqual({ type: "topic", sources: ["[[source]]"] });
    expect(parsed.body).toBe("# Body\n");
  });
});
