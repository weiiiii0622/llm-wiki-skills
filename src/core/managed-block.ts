export interface ManagedBlock {
  name: string;
  content: string;
}

export function upsertManagedBlock(existing: string | undefined, block: ManagedBlock): { content: string; status: "created" | "updated" | "skipped" } {
  const original = existing ?? "";
  const blockText = renderManagedBlock(block);
  const pattern = managedBlockPattern(block.name);
  if (pattern.test(original)) {
    const next = original.replace(pattern, `${blockText}\n`);
    return {
      content: ensureTrailingNewline(next),
      status: next === original ? "skipped" : "updated"
    };
  }

  const prefix = original.length === 0 ? "" : `${ensureTrailingNewline(original)}\n`;
  return {
    content: `${prefix}${blockText}\n`,
    status: original.length === 0 ? "created" : "updated"
  };
}

function renderManagedBlock(block: ManagedBlock): string {
  return [`# llm-wiki-skills: ${block.name} start`, block.content.trimEnd(), `# llm-wiki-skills: ${block.name} end`].join("\n");
}

function managedBlockPattern(name: string): RegExp {
  return new RegExp(`^# llm-wiki-skills: ${escapeRegExp(name)} start\\n[\\s\\S]*?\\n# llm-wiki-skills: ${escapeRegExp(name)} end\\n?`, "m");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
