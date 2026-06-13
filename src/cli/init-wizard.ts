import { HostSelectionCanceledError } from "../core/errors.js";
import { getHostAdapter } from "../core/hosts.js";
import { getTopicTemplate, TOPIC_TEMPLATE_IDS, type ResolvedTopicSelection, type TopicSelectionId } from "../core/topic-templates.js";
import type { HostId } from "../core/types.js";
import { buildInitPlan, groupInitPlanFiles, type InitFileGroupId, type InitPlan } from "./init-plan.js";
import { createPromptRuntime, hostPromptChoices, type PromptRuntime, type TopicPromptChoice } from "./prompt-runtime.js";

export interface InitPreviewModel {
  root: string;
  hosts: string[];
  topic: {
    id: TopicSelectionId;
    label: string;
    examples: string[];
    customTopic?: string;
  };
  groups: InitPreviewGroup[];
}

export interface InitPreviewGroup {
  id: InitFileGroupId | "topic-directory";
  label: string;
  files: string[];
}

export interface RenderInitPreviewOptions {
  decorated?: boolean;
}

export async function runInitWizard(
  root: string,
  runtime: PromptRuntime = createPromptRuntime(),
  fixedTopic?: ResolvedTopicSelection
): Promise<InitPlan> {
  const hosts = await runtime.selectHosts(hostPromptChoices());
  const topic = fixedTopic ?? (await selectTopic(runtime));
  const plan = buildInitPlan(root, hosts, topic);
  runtime.write(renderInitPreview(buildInitPreviewModel(plan), { decorated: runtime.decorated }));
  const confirmed = await runtime.confirm("Create these LLM Wiki skill files?", true);
  if (!confirmed) throw new HostSelectionCanceledError();
  return plan;
}

export function buildInitPreviewModel(plan: InitPlan): InitPreviewModel {
  const grouped = groupInitPlanFiles(plan);
  return {
    root: plan.root,
    hosts: plan.hosts.map(hostLabel),
    topic: {
      id: plan.topic.id,
      label: plan.topic.label,
      examples: topicExamples(plan.topic),
      ...(plan.topic.customTopic ? { customTopic: plan.topic.customTopic } : {})
    },
    groups: [
      {
        id: "topic-directory" as const,
        label: "Topic directories",
        files: plan.topicDirectories.map((directory) => `${directory}/`).sort()
      },
      ...(["starter", "topic", "host", "shared", "manifest"] as const).map((id) => ({
        id,
        label: groupLabel(id),
        files: grouped[id].map((file) => file.relativePath).sort()
      }))
    ]
  };
}

export function renderInitPreview(model: InitPreviewModel, options: RenderInitPreviewOptions = {}): string {
  const ui = theme(Boolean(options.decorated));
  const lines = [
    "",
    `${ui.accent("◆")} ${ui.bold("LLM Wiki init preview")}`,
    `${ui.dim("Root")}  ${model.root}`,
    `${ui.dim("Hosts")} ${model.hosts.join(", ")}`,
    `${ui.dim("Topic")} ${model.topic.label}${model.topic.customTopic ? `: ${model.topic.customTopic}` : ""}`,
    `${ui.dim("Examples")} ${model.topic.examples.join(", ")}`,
    "",
    ui.bold("Files to create or update:")
  ];
  for (const group of model.groups) {
    lines.push(`${ui.accent("●")} ${group.label} ${ui.dim(`(${group.files.length})`)}`);
    for (const file of group.files) {
      lines.push(`  ${ui.dim("•")} ${file}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function hostLabel(host: HostId): string {
  return getHostAdapter(host).label;
}

function groupLabel(group: InitFileGroupId): string {
  switch (group) {
    case "starter":
      return "Starter wiki files";
    case "topic":
      return "Topic routing files";
    case "host":
      return "Agent skill files";
    case "shared":
      return "Shared references";
    case "manifest":
      return "Install manifest";
  }
}

async function selectTopic(runtime: PromptRuntime): Promise<ResolvedTopicSelection> {
  const id = await runtime.selectTopic(topicPromptChoices());
  if (id === "custom") {
    const customTopic = await runtime.text("Describe the custom topic", "");
    if (!/^[ -~]{1,120}$/.test(customTopic)) {
      throw new HostSelectionCanceledError("Custom topic must be 1-120 printable single-line characters.");
    }
    return {
      id,
      scaffoldId: "general",
      label: "Custom topic",
      customTopic
    };
  }
  const template = getTopicTemplate(id);
  return {
    id,
    scaffoldId: id,
    label: template.label
  };
}

function topicPromptChoices(): TopicPromptChoice[] {
  return [
    ...TOPIC_TEMPLATE_IDS.map((id, index) => {
      const template = getTopicTemplate(id);
      return {
        name: id,
        message: template.label,
        hint: template.description,
        enabled: index === 0
      };
    }),
    {
      name: "custom" as const,
      message: "Custom topic",
      hint: "Use the general scaffold and print an LLM handoff prompt"
    }
  ];
}

function topicExamples(topic: ResolvedTopicSelection): string[] {
  if (topic.id === "custom") return ["custom structure prompt", "source-grounded sections", "no generated import"];
  return getTopicTemplate(topic.id).examples;
}

function theme(decorated: boolean): { accent: (value: string) => string; bold: (value: string) => string; dim: (value: string) => string } {
  if (!decorated) {
    return {
      accent: (value) => value,
      bold: (value) => value,
      dim: (value) => value
    };
  }
  return {
    accent: (value) => `\x1b[36m${value}\x1b[39m`,
    bold: (value) => `\x1b[1m${value}\x1b[22m`,
    dim: (value) => `\x1b[2m${value}\x1b[22m`
  };
}
