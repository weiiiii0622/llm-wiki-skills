import { HostSelectionCanceledError } from "../core/errors.js";
import { HOST_IDS, getHostAdapter } from "../core/hosts.js";
import type { HostId } from "../core/types.js";

export interface HostPromptChoice {
  name: HostId;
  message: string;
  hint: string;
  enabled?: boolean;
}

export interface PromptRuntime {
  readonly decorated: boolean;
  write(message: string): void;
  selectHosts(choices: HostPromptChoice[]): Promise<HostId[]>;
  confirm(message: string, initial?: boolean): Promise<boolean>;
}

export interface PromptRuntimeOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  decorated?: boolean;
}

export interface ScriptedPromptAnswers {
  hosts?: HostId[];
  confirm?: boolean;
  cancel?: "hosts" | "confirm";
}

type EnquirerConstructor = new () => {
  prompt<T extends object>(questions: unknown): Promise<T>;
};

type PromptsFunction = (question: unknown, options?: unknown) => Promise<Record<string, unknown>>;

export function hostPromptChoices(): HostPromptChoice[] {
  return HOST_IDS.map((host, index) => {
    const adapter = getHostAdapter(host);
    return {
      name: host,
      message: `${adapter.label} (${adapter.skillRoot})`,
      hint: hostHint(host),
      enabled: index === 0
    };
  });
}

export function createPromptRuntime(options: PromptRuntimeOptions = {}): PromptRuntime {
  const scripted = readScriptedPromptAnswers();
  if (scripted) return createScriptedPromptRuntime(scripted, options);
  return new LibraryPromptRuntime(options);
}

export function createScriptedPromptRuntime(script: ScriptedPromptAnswers, options: PromptRuntimeOptions = {}): PromptRuntime {
  const output = options.output ?? process.stdout;
  return {
    decorated: options.decorated ?? false,
    write(message: string): void {
      output.write(message);
    },
    async selectHosts(): Promise<HostId[]> {
      if (script.cancel === "hosts") throw new HostSelectionCanceledError();
      const hosts = script.hosts ?? ["codex"];
      if (hosts.length === 0) return ["codex"];
      return hosts;
    },
    async confirm(): Promise<boolean> {
      if (script.cancel === "confirm") throw new HostSelectionCanceledError();
      return script.confirm ?? true;
    }
  };
}

class LibraryPromptRuntime implements PromptRuntime {
  public readonly decorated: boolean;
  private readonly input: NodeJS.ReadStream;
  private readonly output: NodeJS.WriteStream;

  constructor(options: PromptRuntimeOptions) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.decorated = options.decorated ?? Boolean(this.output.isTTY);
  }

  write(message: string): void {
    this.output.write(message);
  }

  async selectHosts(choices: HostPromptChoice[]): Promise<HostId[]> {
    const Enquirer = await loadEnquirer();
    const enquirer = new Enquirer();
    try {
      const answers = await enquirer.prompt<{ hosts?: unknown }>({
        type: "multiselect",
        name: "hosts",
        message: "Where should LLM Wiki skills be installed?",
        hint: "Space selects, Enter continues",
        choices: choices.map((choice) => ({
          name: choice.name,
          message: choice.message,
          hint: choice.hint,
          enabled: choice.enabled
        })),
        stdin: this.input,
        stdout: this.output
      });
      return normalizeSelectedHosts(answers.hosts);
    } catch (error) {
      throw mapPromptError(error);
    }
  }

  async confirm(message: string, initial = true): Promise<boolean> {
    const prompts = await loadPrompts();
    let canceled = false;
    const answers = await prompts(
      {
        type: "confirm",
        name: "confirmed",
        message,
        initial,
        stdin: this.input,
        stdout: this.output
      },
      {
        onCancel: () => {
          canceled = true;
          return false;
        }
      }
    );
    if (canceled || typeof answers.confirmed !== "boolean") throw new HostSelectionCanceledError();
    return answers.confirmed;
  }
}

async function loadEnquirer(): Promise<EnquirerConstructor> {
  const imported = (await import("enquirer")) as { default?: EnquirerConstructor };
  if (!imported.default) throw new Error("Failed to load enquirer.");
  return imported.default;
}

async function loadPrompts(): Promise<PromptsFunction> {
  const imported = (await import("prompts")) as { default?: PromptsFunction };
  if (!imported.default) throw new Error("Failed to load prompts.");
  return imported.default;
}

function normalizeSelectedHosts(value: unknown): HostId[] {
  const rawHosts = Array.isArray(value) ? value : [];
  const hosts = rawHosts.filter((host): host is HostId => host === "codex" || host === "claude-code");
  return hosts.length > 0 ? hosts : ["codex"];
}

function mapPromptError(error: unknown): Error {
  if (error instanceof HostSelectionCanceledError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel|abort|escape|sigint/i.test(message)) return new HostSelectionCanceledError();
  return error instanceof Error ? error : new Error(message);
}

function readScriptedPromptAnswers(): ScriptedPromptAnswers | undefined {
  const raw = process.env.LLM_WIKI_SKILLS_TEST_PROMPTS;
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const hosts = Array.isArray(parsed.hosts)
    ? parsed.hosts.filter((host): host is HostId => host === "codex" || host === "claude-code")
    : undefined;
  const confirm = typeof parsed.confirm === "boolean" ? parsed.confirm : undefined;
  const cancel = parsed.cancel === "hosts" || parsed.cancel === "confirm" ? parsed.cancel : undefined;
  return { hosts, confirm, cancel };
}

function hostHint(host: HostId): string {
  switch (host) {
    case "codex":
      return "OpenAI Codex repo skills";
    case "claude-code":
      return "Claude Code project skills";
  }
}
