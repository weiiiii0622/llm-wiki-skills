import type { TopicSelectionId, TopicTemplateId } from "./topic-templates.js";

export type OutputMode = "human" | "json";
export type InitWriteStatus = "created" | "updated" | "skipped";

export interface CommandOptions {
  root: string;
  json: boolean;
  debug: boolean;
  quiet: boolean;
  obsidian?: boolean;
  qmd?: boolean;
  qmdAction?: "enable" | "disable" | "status" | "reindex";
  ingestAction?: "plan" | "status" | "mark" | "validate" | "import-extractors";
  ingestRawRoots?: string[];
  ingestPlanId?: string;
  ingestSource?: string;
  ingestStatus?: "summarized" | "merged" | "skipped" | "deferred";
  ingestReason?: string;
  ingestFile?: string;
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
  integrations?: ManifestIntegrations;
}

export interface ManifestTopicMetadata {
  id: TopicSelectionId;
  scaffoldId: TopicTemplateId;
  customTopic?: string;
}

export interface ManifestIntegrations {
  obsidian?: {
    enabled: true;
    schemaVersion: 1;
    generatedFiles: string[];
  };
  qmd?: QmdIntegrationMetadata;
}

export type QmdSearchMode = "keyword" | "hybrid";
export type QmdRuntimeMode = "gpu-auto" | "cpu-forced" | "keyword-fallback";

export interface QmdModelMetadata {
  name: string;
  purpose: "embedding" | "reranking" | "query-expansion";
  size: string;
}

export type QmdIntegrationMetadata =
  | {
      enabled: true;
      schemaVersion: 1;
      collection: string;
      root: string;
      docsPath: string;
      searchMode: "keyword";
      lastIndexedAt?: string;
    }
  | {
      enabled: true;
      schemaVersion: 2;
      collection: string;
      root: string;
      docsPath: string;
      searchMode: QmdSearchMode;
      runtimeMode: QmdRuntimeMode;
      models: QmdModelMetadata[];
      modelCachePath: string;
      lastIndexedAt?: string;
      lastEmbeddedAt?: string;
      fallbackReason?: string;
    };

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
  integrations?: ManifestIntegrations;
  checkedFiles: string[];
  missingFiles: string[];
  extraManifestFiles: string[];
  missingManifestFiles: string[];
}
