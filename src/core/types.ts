import type { TopicSelectionId, TopicTemplateId } from "./topic-templates.js";

export type OutputMode = "human" | "json";

export interface CommandOptions {
  root: string;
  json: boolean;
  debug: boolean;
  quiet: boolean;
  hosts: HostId[];
  topicValues: string[];
  templateValues: string[];
  customTopic?: string;
}

export type HostId = "codex" | "claude-code";

export interface HostSkill {
  name: "llm-wiki-ingest" | "llm-wiki-query" | "llm-wiki-lint";
  content: string;
}

export interface HostAdapter {
  id: HostId;
  label: string;
  skillRoot: string;
  skills: HostSkill[];
}

export interface Manifest {
  manifestVersion: 1;
  createdBy: "llm-wiki-skills";
  hosts: HostId[];
  directories: string[];
  files: string[];
  topic?: ManifestTopicMetadata;
}

export interface ManifestTopicMetadata {
  id: TopicSelectionId;
  scaffoldId: TopicTemplateId;
  customTopic?: string;
}

export interface WikiPage {
  id: string;
  path: string;
  title: string;
  slug: string;
  frontmatter: Record<string, unknown>;
  body: string;
  wikilinks: string[];
  sources: string[];
  tags: string[];
}

export interface GraphMetadata {
  llmWikiGraphVersion: 1;
  createdBy: string;
  scoringRubricVersion: 1;
  generatedAt: string;
}

export interface GraphNode {
  id: string;
  path: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  reasons: string[];
}

export interface WikiGraph {
  metadata: GraphMetadata;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ValidationIssue {
  code:
    | "VaultNotFoundError"
    | "InvalidFrontmatterError"
    | "BrokenLinkError"
    | "GraphDriftError"
    | "ImmutableRawViolationError"
    | "WriteConflictError"
    | "PackageAssetMissingError";
  severity: "error" | "warning";
  path?: string;
  message: string;
}

export interface HealthReport {
  status: "pass" | "fail";
  root: string;
  pageCount: number;
  countsByType: Record<string, number>;
  countsByStatus: Record<string, number>;
  orphanPages: string[];
  issues: ValidationIssue[];
}

export interface StatusReport {
  status: "pass" | "fail";
  root: string;
  manifestPath: string;
  hosts: HostId[];
  topic?: ManifestTopicMetadata;
  checkedFiles: string[];
  missingFiles: string[];
  extraManifestFiles: string[];
  missingManifestFiles: string[];
}
