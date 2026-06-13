import { describe, expect, it } from "vitest";
import { obsidianFileEntries, obsidianGeneratedFilePaths, obsidianGitignoreBlock, obsidianIntegrationMetadata } from "../src/core/obsidian.js";

describe("obsidian integration", () => {
  it("defines stable generated file paths for manifest and status checks", () => {
    expect(obsidianGeneratedFilePaths()).toEqual([
      ".obsidian/app.json",
      ".obsidian/core-plugins.json",
      ".obsidian/graph.json",
      ".obsidian/llm-wiki-skills.json"
    ]);
    expect(obsidianIntegrationMetadata()).toEqual({
      enabled: true,
      schemaVersion: 1,
      generatedFiles: obsidianGeneratedFilePaths()
    });
  });

  it("generates exact Obsidian config JSON", () => {
    expect(Object.fromEntries(obsidianFileEntries().map((entry) => [entry.relativePath, entry.content]))).toEqual({
      ".obsidian/app.json": `{
  "alwaysUpdateLinks": true,
  "attachmentFolderPath": "raw/attachments",
  "newFileFolderPath": "wiki",
  "newFileLocation": "folder",
  "showFrontmatter": true
}
`,
      ".obsidian/core-plugins.json": `[
  "file-explorer",
  "global-search",
  "switcher",
  "graph",
  "backlink",
  "outgoing-link",
  "tag-pane",
  "page-preview",
  "templates",
  "properties"
]
`,
      ".obsidian/graph.json": `{
  "collapse-display": false,
  "collapse-filter": false,
  "collapse-forces": true,
  "collapse-groups": true,
  "hideUnresolved": false,
  "search": "path:wiki/",
  "showAttachments": false,
  "showOrphans": true,
  "showTags": true
}
`,
      ".obsidian/llm-wiki-skills.json": `{
  "createdBy": "llm-wiki-skills",
  "generatedFiles": [
    ".obsidian/app.json",
    ".obsidian/core-plugins.json",
    ".obsidian/graph.json",
    ".obsidian/llm-wiki-skills.json"
  ],
  "integration": "obsidian",
  "schemaVersion": 1
}
`
    });
  });

  it("only ignores Obsidian runtime state by default", () => {
    expect(obsidianGitignoreBlock()).toBe(".obsidian/workspace.json\n.obsidian/workspace-mobile.json\n.obsidian/cache/");
    expect(obsidianGitignoreBlock()).not.toContain(".obsidian/plugins/");
    expect(obsidianGitignoreBlock()).not.toContain(".obsidian/themes/");
  });
});
