export type OutputMode = "human" | "json";

export interface CommandOptions {
  root: string;
  json: boolean;
  debug: boolean;
  quiet: boolean;
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
