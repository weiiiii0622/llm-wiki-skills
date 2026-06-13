export class LlmWikiError extends Error {
  constructor(
    public readonly code:
      | "VaultNotFoundError"
      | "InvalidFrontmatterError"
      | "BrokenLinkError"
      | "GraphDriftError"
      | "ImmutableRawViolationError"
      | "WriteConflictError"
      | "PackageAssetMissingError"
      | "InvalidHostError"
      | "InvalidTopicError"
      | "ConflictingTopicOptionError"
      | "ConflictingObsidianOptionError"
      | "HostRequiredError"
      | "HostSelectionCanceledError"
      | "RequiredFileMissingError"
      | "ManifestMismatchError",
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

export class InvalidHostError extends LlmWikiError {
  constructor(message: string) {
    super("InvalidHostError", message, 9);
  }
}

export class InvalidTopicError extends LlmWikiError {
  constructor(message: string) {
    super("InvalidTopicError", message, 14);
  }
}

export class ConflictingTopicOptionError extends LlmWikiError {
  constructor(message: string) {
    super("ConflictingTopicOptionError", message, 15);
  }
}

export class ConflictingObsidianOptionError extends LlmWikiError {
  constructor(message = "Conflicting Obsidian options: use either --obsidian or --no-obsidian, not both.") {
    super("ConflictingObsidianOptionError", message, 16);
  }
}

export class HostRequiredError extends LlmWikiError {
  constructor(message = "Select at least one host with --host when running outside a TTY.") {
    super("HostRequiredError", message, 10);
  }
}

export const INIT_CANCELED_MESSAGE = "llm-wiki-skills initialization canceled.";

export class HostSelectionCanceledError extends LlmWikiError {
  constructor(message = INIT_CANCELED_MESSAGE) {
    super("HostSelectionCanceledError", message, 11);
  }
}

export class RequiredFileMissingError extends LlmWikiError {
  constructor(message: string) {
    super("RequiredFileMissingError", message, 12);
  }
}

export class ManifestMismatchError extends LlmWikiError {
  constructor(message: string) {
    super("ManifestMismatchError", message, 13);
  }
}
