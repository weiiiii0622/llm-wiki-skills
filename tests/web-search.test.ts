import { describe, expect, it } from "vitest";
import type { QmdRunner } from "../src/core/qmd.js";
import { searchAtlas, searchTextIndex } from "../src/core/web-search.js";
import type { AtlasSearchDocument } from "../src/core/web-export.js";

const index: AtlasSearchDocument[] = [
  {
    id: "topics/graph-first-vault",
    title: "Graph First Vault",
    path: "wiki/topics/graph-first-vault.md",
    type: "topic",
    status: "draft",
    tags: ["graph"],
    text: "graph atlas relationship map"
  },
  {
    id: "sources/package-plan",
    title: "Package Plan",
    path: "wiki/sources/package-plan.md",
    type: "source",
    status: "stable",
    tags: ["release"],
    text: "package cli release"
  }
];

describe("web search", () => {
  it("searches the static text index", () => {
    expect(searchTextIndex(index, "relationship")[0]).toMatchObject({ id: "topics/graph-first-vault", source: "text" });
  });

  it("normalizes qmd results when qmd succeeds", async () => {
    const runner: QmdRunner = {
      async run() {
        return { stdout: JSON.stringify({ results: [{ path: "wiki/sources/package-plan.md", score: 42, snippet: "package" }] }), stderr: "" };
      }
    };
    await expect(searchAtlas("/tmp/wiki", "package", index, true, { runner })).resolves.toMatchObject({
      mode: "qmd",
      results: [{ id: "sources/package-plan", score: 42, source: "qmd" }]
    });
  });

  it("falls back when qmd is disabled", async () => {
    await expect(searchAtlas("/tmp/wiki", "graph", index, false)).resolves.toMatchObject({
      mode: "text",
      fallbackReason: "qmd disabled",
      results: [{ id: "topics/graph-first-vault" }]
    });
  });

  it("falls back when qmd returns malformed JSON", async () => {
    const runner: QmdRunner = {
      async run() {
        return { stdout: "not json", stderr: "" };
      }
    };
    const result = await searchAtlas("/tmp/wiki", "graph", index, true, { runner });
    expect(result.mode).toBe("text");
    expect(result.fallbackReason).toContain("malformed JSON");
  });

  it("falls back when qmd times out", async () => {
    const runner: QmdRunner = {
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { stdout: "[]", stderr: "" };
      }
    };
    const result = await searchAtlas("/tmp/wiki", "graph", index, true, { runner, timeoutMs: 1 });
    expect(result.mode).toBe("text");
    expect(result.fallbackReason).toContain("timed out");
  });
});
