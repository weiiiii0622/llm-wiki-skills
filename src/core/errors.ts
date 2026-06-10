export class LlmWikiError extends Error {
  constructor(
    public readonly code:
      | "VaultNotFoundError"
      | "InvalidFrontmatterError"
      | "BrokenLinkError"
      | "GraphDriftError"
      | "ImmutableRawViolationError"
      | "WriteConflictError"
      | "PackageAssetMissingError",
    message: string,
    public readonly exitCode: number
  ) {
    super(message);
    this.name = code;
  }
}

export class VaultNotFoundError extends LlmWikiError {
  constructor(message = "Vault not found. Run `llm-wiki-skills init` first.") {
    super("VaultNotFoundError", message, 2);
  }
}

export class InvalidFrontmatterError extends LlmWikiError {
  constructor(message: string) {
    super("InvalidFrontmatterError", message, 3);
  }
}

export class BrokenLinkError extends LlmWikiError {
  constructor(message: string) {
    super("BrokenLinkError", message, 4);
  }
}

export class GraphDriftError extends LlmWikiError {
  constructor(message = "wiki/graph.json or wiki/graph.md is out of date.") {
    super("GraphDriftError", message, 5);
  }
}

export class ImmutableRawViolationError extends LlmWikiError {
  constructor(message = "Refusing to mutate raw/ without an explicit override.") {
    super("ImmutableRawViolationError", message, 6);
  }
}

export class WriteConflictError extends LlmWikiError {
  constructor(message: string) {
    super("WriteConflictError", message, 7);
  }
}

export class PackageAssetMissingError extends LlmWikiError {
  constructor(message: string) {
    super("PackageAssetMissingError", message, 8);
  }
}
