import { HostSelectionCanceledError } from "../core/errors.js";
import { getHostAdapter } from "../core/hosts.js";
import type { HostId } from "../core/types.js";
import { buildInitPlan, groupInitPlanFiles, type InitFileGroupId, type InitPlan } from "./init-plan.js";
import { createPromptRuntime, hostPromptChoices, type PromptRuntime } from "./prompt-runtime.js";

export interface InitPreviewModel {
  root: string;
  hosts: string[];
  groups: InitPreviewGroup[];
}

export interface InitPreviewGroup {
  id: InitFileGroupId;
  label: string;
  files: string[];
}

export interface RenderInitPreviewOptions {
  decorated?: boolean;
}

export async function runInitWizard(root: string, runtime: PromptRuntime = createPromptRuntime()): Promise<InitPlan> {
  const hosts = await runtime.selectHosts(hostPromptChoices());
  const plan = buildInitPlan(root, hosts);
  runtime.write(renderInitPreview(buildInitPreviewModel(plan), { decorated: runtime.decorated }));
  const confirmed = await runtime.confirm("Create these LLM Wiki skill files?", true);
  if (!confirmed) throw new HostSelectionCanceledError("Init canceled before writing files.");
  return plan;
}

export function buildInitPreviewModel(plan: InitPlan): InitPreviewModel {
  const grouped = groupInitPlanFiles(plan);
  return {
    root: plan.root,
    hosts: plan.hosts.map(hostLabel),
    groups: (["starter", "host", "shared", "manifest"] as const).map((id) => ({
      id,
      label: groupLabel(id),
      files: grouped[id].map((file) => file.relativePath).sort()
    }))
  };
}

export function renderInitPreview(model: InitPreviewModel, options: RenderInitPreviewOptions = {}): string {
  const ui = theme(Boolean(options.decorated));
  const lines = [
    "",
    `${ui.accent("◆")} ${ui.bold("LLM Wiki init preview")}`,
    `${ui.dim("Root")}  ${model.root}`,
    `${ui.dim("Hosts")} ${model.hosts.join(", ")}`,
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
    case "host":
      return "Agent skill files";
    case "shared":
      return "Shared references";
    case "manifest":
      return "Install manifest";
  }
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
