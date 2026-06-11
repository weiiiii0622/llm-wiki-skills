import { claudeCodeAdapter } from "../adapters/claude.js";
import { codexAdapter } from "../adapters/codex.js";
import { InvalidHostError } from "./errors.js";
import type { HostAdapter, HostId } from "./types.js";

export const HOST_IDS = ["codex", "claude-code"] as const satisfies readonly HostId[];

const HOST_ALIASES: Record<string, HostId> = {
  codex: "codex",
  claude: "claude-code",
  "claude-code": "claude-code",
  claude_code: "claude-code"
};

const HOST_REGISTRY = new Map<HostId, HostAdapter>([
  ["codex", codexAdapter()],
  ["claude-code", claudeCodeAdapter()]
]);

export function normalizeHost(value: string): HostId {
  const normalized = HOST_ALIASES[value.trim().toLowerCase()];
  if (!normalized) {
    throw new InvalidHostError(`Unknown host: ${value}. Supported hosts: ${HOST_IDS.join(", ")}`);
  }
  return normalized;
}

export function parseHostValues(values: string[]): HostId[] {
  const hosts = new Set<HostId>();
  for (const value of values) {
    for (const part of value.split(",")) {
      if (part.trim() === "") continue;
      hosts.add(normalizeHost(part));
    }
  }
  return [...hosts];
}

export function getHostAdapter(host: HostId): HostAdapter {
  const adapter = HOST_REGISTRY.get(host);
  if (!adapter) throw new InvalidHostError(`Unknown host: ${host}`);
  return adapter;
}

export function getHostAdapters(hosts: HostId[]): HostAdapter[] {
  return hosts.map(getHostAdapter);
}
