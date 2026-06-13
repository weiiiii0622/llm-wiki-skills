import type { CommandOptions } from "../../core/types.js";
import { renderInitReport } from "../../core/reports.js";
import { ConflictingTopicOptionError, HostRequiredError, InvalidTopicError } from "../../core/errors.js";
import { printResult } from "../format.js";
import { buildInitPlan, executeInitPlan, type InitPlan } from "../init-plan.js";
import { getTopicTemplate, isTopicSelectionId, type ResolvedTopicSelection, type TopicSelectionId } from "../../core/topic-templates.js";

export async function initCommand(options: CommandOptions): Promise<void> {
  const plan = await resolveInitPlan(options);
  const results = await executeInitPlan(plan);
  const customHandoffPrompt = buildCustomTopicHandoffPrompt(plan.topic);
  const obsidianHandoff = buildObsidianHandoff(plan.obsidianEnabled);

  printResult(
    {
      root: plan.root,
      hosts: plan.hosts,
      topic: plan.topic,
      obsidian: plan.obsidianEnabled,
      files: results,
      ...(obsidianHandoff ? { obsidianHandoff } : {}),
      ...(customHandoffPrompt ? { customHandoffPrompt } : {})
    },
    options.json,
    options.quiet,
    `${renderInitReport(results, obsidianHandoff)}${customHandoffPrompt ? `\n${customHandoffPrompt}\n` : ""}`
  );
}

async function resolveInitPlan(options: CommandOptions): Promise<InitPlan> {
  const topic = resolveTopicSelection(options);
  if (options.hosts.length > 0) return buildInitPlan(options.root, options.hosts, topic, options.obsidian ?? true);
  if (options.json || options.quiet) throw new HostRequiredError();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (!process.env.LLM_WIKI_SKILLS_TEST_PROMPTS) throw new HostRequiredError();
  }
  const { runInitWizard } = await import("../init-wizard.js");
  return runInitWizard(options.root, undefined, topicWasProvided(options) ? topic : undefined, options.obsidian);
}

export function resolveTopicSelection(options: Pick<CommandOptions, "topicValues" | "templateValues" | "customTopic">): ResolvedTopicSelection {
  const rawValues = [...options.topicValues, ...options.templateValues];
  const values: TopicSelectionId[] = [];
  for (const value of rawValues) {
    if (!isTopicSelectionId(value)) {
      throw new InvalidTopicError(`Unknown topic: ${value}. Supported topics: ${supportedTopics()}`);
    }
    values.push(value);
  }
  const unique = [...new Set(values)];
  if (unique.length > 1) {
    throw new ConflictingTopicOptionError(`Conflicting topic values: ${unique.join(", ")}. Use one matching --topic/--template value.`);
  }
  const id = unique[0] ?? "general";
  if (id === "custom") {
    const customTopic = validateCustomTopic(options.customTopic);
    return {
      id,
      scaffoldId: "general",
      label: "Custom topic",
      customTopic
    };
  }
  if (options.customTopic !== undefined) {
    throw new InvalidTopicError("--custom-topic can only be used with --topic custom.");
  }
  const template = getTopicTemplate(id);
  return {
    id,
    scaffoldId: id,
    label: template.label
  };
}

function topicWasProvided(options: Pick<CommandOptions, "topicValues" | "templateValues" | "customTopic">): boolean {
  return options.topicValues.length > 0 || options.templateValues.length > 0 || options.customTopic !== undefined;
}

function validateCustomTopic(value: string | undefined): string {
  if (value === undefined) throw new InvalidTopicError("--topic custom requires --custom-topic.");
  if (!/^[ -~]{1,120}$/.test(value)) {
    throw new InvalidTopicError("--custom-topic must be 1-120 printable single-line characters.");
  }
  return value;
}

function supportedTopics(): string {
  return "general, study-research, work-project, product-builder, writing-content, trip-plan, finance, home-life, medical, legal-admin, custom";
}

function buildCustomTopicHandoffPrompt(topic: ResolvedTopicSelection): string | undefined {
  if (topic.id !== "custom" || !topic.customTopic) return undefined;
  return [
    "Custom topic handoff:",
    `You are helping organize an LLM Wiki vault for: ${topic.customTopic}`,
    "Use the generated general scaffold and docs/llm-wiki-routing.md. Propose small source-grounded routing refinements under wiki/ without overwriting existing files.",
    "Do not overwrite existing files. Keep raw evidence under raw/ and cite source pages from synthesized wiki pages."
  ].join("\n");
}

function buildObsidianHandoff(enabled: boolean): string | undefined {
  if (!enabled) return undefined;
  return "Open this folder as a vault. Native graph is configured for `path:wiki/`; personal workspace files are ignored in `.gitignore`.";
}
