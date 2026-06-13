import { stableJson } from "./fs.js";

export const OBSIDIAN_INTEGRATION_ID = "obsidian";
export const OBSIDIAN_INTEGRATION_VERSION = 1;

export interface ObsidianFileEntry {
  relativePath: string;
  content: string;
}

export interface ObsidianIntegrationMetadata {
  enabled: true;
  schemaVersion: 1;
  generatedFiles: string[];
}

const OBSIDIAN_APP = {
  alwaysUpdateLinks: true,
  newFileLocation: "folder",
  newFileFolderPath: "wiki",
  attachmentFolderPath: "raw/attachments",
  showFrontmatter: true
};

const OBSIDIAN_CORE_PLUGINS = [
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
];

const OBSIDIAN_GRAPH = {
  search: "path:wiki/",
  showTags: true,
  showAttachments: false,
  hideUnresolved: false,
  showOrphans: true,
  "collapse-filter": false,
  "collapse-display": false,
  "collapse-forces": true,
  "collapse-groups": true
};

export function obsidianFileEntries(): ObsidianFileEntry[] {
  const generatedFiles = obsidianGeneratedFilePaths();
  return [
    {
      relativePath: ".obsidian/app.json",
      content: stableJson(OBSIDIAN_APP)
    },
    {
      relativePath: ".obsidian/core-plugins.json",
      content: stableJson(OBSIDIAN_CORE_PLUGINS)
    },
    {
      relativePath: ".obsidian/graph.json",
      content: stableJson(OBSIDIAN_GRAPH)
    },
    {
      relativePath: ".obsidian/llm-wiki-skills.json",
      content: stableJson({
        createdBy: "llm-wiki-skills",
        integration: OBSIDIAN_INTEGRATION_ID,
        schemaVersion: OBSIDIAN_INTEGRATION_VERSION,
        generatedFiles
      })
    }
  ];
}

export function obsidianGeneratedFilePaths(): string[] {
  return [".obsidian/app.json", ".obsidian/core-plugins.json", ".obsidian/graph.json", ".obsidian/llm-wiki-skills.json"].sort();
}

export function obsidianIntegrationMetadata(): ObsidianIntegrationMetadata {
  return {
    enabled: true,
    schemaVersion: OBSIDIAN_INTEGRATION_VERSION,
    generatedFiles: obsidianGeneratedFilePaths()
  };
}

export function obsidianGitignoreBlock(): string {
  return [".obsidian/workspace.json", ".obsidian/workspace-mobile.json", ".obsidian/cache/"].join("\n");
}
