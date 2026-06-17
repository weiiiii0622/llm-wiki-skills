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
      | "ConflictingQmdOptionError"
      | "HostRequiredError"
      | "HostSelectionCanceledError"
      | "RequiredFileMissingError"
      | "ManifestMismatchError"
      | "QmdNotInstalledError"
      | "QmdRuntimeUnsupportedError"
      | "QmdDoctorFailedError"
      | "QmdCollectionError"
      | "QmdIndexUpdateError"
      | "QmdCommandError"
      | "IngestPlanMissingError"
      | "IngestPlanAmbiguousError"
      | "IngestPlanInvalidError"
      | "IngestRawPathInvalidError"
      | "IngestRawDriftError"
      | "IngestInvalidTransitionError"
      | "IngestValidationFailedError"
      | "IngestSummaryMissingError"
      | "IngestExtractorReportInvalidError",
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

export class ConflictingQmdOptionError extends LlmWikiError {
  constructor(message = "Conflicting qmd options: use either --qmd or --no-qmd, not both.") {
    super("ConflictingQmdOptionError", message, 17);
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

export class QmdNotInstalledError extends LlmWikiError {
  constructor(message = "qmd is not installed. Install it with `npm install -g @tobilu/qmd` and then run `npx llm-wiki-skills qmd enable`.") {
    super("QmdNotInstalledError", message, 18);
  }
}

export class QmdRuntimeUnsupportedError extends LlmWikiError {
  constructor(message = "qmd requires Node.js 22 or newer.") {
    super("QmdRuntimeUnsupportedError", message, 19);
  }
}

export class QmdDoctorFailedError extends LlmWikiError {
  constructor(message: string) {
    super("QmdDoctorFailedError", message, 20);
  }
}

export class QmdCollectionError extends LlmWikiError {
  constructor(message: string) {
    super("QmdCollectionError", message, 21);
  }
}

export class QmdIndexUpdateError extends LlmWikiError {
  constructor(message: string) {
    super("QmdIndexUpdateError", message, 22);
  }
}

export class QmdCommandError extends LlmWikiError {
  constructor(message: string) {
    super("QmdCommandError", message, 23);
  }
}

export class IngestPlanMissingError extends LlmWikiError {
  constructor(message = "No active ingest plan found. Run `npx llm-wiki-skills ingest plan` first or pass --plan.") {
    super("IngestPlanMissingError", message, 24);
  }
}

export class IngestPlanAmbiguousError extends LlmWikiError {
  constructor(message: string) {
    super("IngestPlanAmbiguousError", message, 25);
  }
}

export class IngestPlanInvalidError extends LlmWikiError {
  constructor(message: string) {
    super("IngestPlanInvalidError", message, 26);
  }
}

export class IngestRawPathInvalidError extends LlmWikiError {
  constructor(message: string) {
    super("IngestRawPathInvalidError", message, 27);
  }
}

export class IngestRawDriftError extends LlmWikiError {
  constructor(message: string) {
    super("IngestRawDriftError", message, 28);
  }
}

export class IngestInvalidTransitionError extends LlmWikiError {
  constructor(message: string) {
    super("IngestInvalidTransitionError", message, 29);
  }
}

export class IngestValidationFailedError extends LlmWikiError {
  constructor(message: string) {
    super("IngestValidationFailedError", message, 30);
  }
}

export class IngestSummaryMissingError extends LlmWikiError {
  constructor(message: string) {
    super("IngestSummaryMissingError", message, 31);
  }
}

export class IngestExtractorReportInvalidError extends LlmWikiError {
  constructor(message: string) {
    super("IngestExtractorReportInvalidError", message, 32);
  }
}
