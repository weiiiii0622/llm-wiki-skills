import { HostSelectionCanceledError } from "../core/errors.js";
import { HOST_IDS, getHostAdapter } from "../core/hosts.js";
import type { TopicSelectionId } from "../core/topic-templates.js";
import type { HostId } from "../core/types.js";

export interface HostPromptChoice {
  name: HostId;
  message: string;
  hint: string;
  enabled?: boolean;
}

export interface TopicPromptChoice {
  name: TopicSelectionId;
  message: string;
  hint: string;
  enabled?: boolean;
}

export interface PromptRuntime {
  readonly decorated: boolean;
  enterAlternateScreen(): void;
  exitAlternateScreen(): void;
  write(message: string): void;
  selectHosts(choices: HostPromptChoice[]): Promise<HostId[]>;
  selectTopic(choices: TopicPromptChoice[]): Promise<TopicSelectionId>;
  text(message: string, initial?: string): Promise<string>;
  confirm(message: string, initial?: boolean): Promise<boolean>;
}

export interface PromptRuntimeOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  decorated?: boolean;
}

export interface ScriptedPromptAnswers {
  hosts?: HostId[];
  topic?: TopicSelectionId;
  customTopic?: string;
  confirm?: boolean;
  cancel?: "hosts" | "topic" | "text" | "confirm";
}

type EnquirerConstructor = new () => {
  prompt<T extends object>(questions: unknown): Promise<T>;
};

type PromptsFunction = (question: unknown, options?: unknown) => Promise<Record<string, unknown>>;

export const ENTER_ALTERNATE_SCREEN = "\x1b[?1049h";
export const EXIT_ALTERNATE_SCREEN = "\x1b[?1049l";
const DEFAULT_TOPIC_OPTIONS_PER_PAGE = 10;
const MIN_TOPIC_OPTIONS_PER_PAGE = 1;
const TOPIC_PROMPT_RESERVED_ROWS = 3;
const HOST_SELECTION_REQUIRED_MESSAGE = "You must select at least one host.";

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
    enterAlternateScreen(): void {
      if (this.decorated) output.write(ENTER_ALTERNATE_SCREEN);
    },
    exitAlternateScreen(): void {
      if (this.decorated) output.write(EXIT_ALTERNATE_SCREEN);
    },
    write(message: string): void {
      output.write(message);
    },
    async selectHosts(): Promise<HostId[]> {
      if (script.cancel === "hosts") throw new HostSelectionCanceledError();
      const hosts = script.hosts ?? ["codex"];
      if (hosts.length === 0) throw new HostSelectionCanceledError(HOST_SELECTION_REQUIRED_MESSAGE);
      return hosts;
    },
    async selectTopic(): Promise<TopicSelectionId> {
      if (script.cancel === "topic") throw new HostSelectionCanceledError();
      return script.topic ?? "general";
    },
    async text(): Promise<string> {
      if (script.cancel === "text") throw new HostSelectionCanceledError();
      return script.customTopic ?? "";
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

  enterAlternateScreen(): void {
    if (this.decorated) this.output.write(ENTER_ALTERNATE_SCREEN);
  }

  exitAlternateScreen(): void {
    if (this.decorated) this.output.write(EXIT_ALTERNATE_SCREEN);
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
        validate: (value: unknown) => (Array.isArray(value) && value.length > 0 ? true : HOST_SELECTION_REQUIRED_MESSAGE),
        stdin: this.input,
        stdout: this.output
      });
      return normalizeSelectedHosts(answers.hosts);
    } catch (error) {
      throw mapPromptError(error);
    }
  }

  async selectTopic(choices: TopicPromptChoice[]): Promise<TopicSelectionId> {
    const prompts = await loadPrompts();
    let canceled = false;
    const answers = await prompts(
      {
        type: "select",
        name: "topic",
        message: "What kind of wiki are you starting?",
        choices: choices.map((choice) => ({
          title: choice.message,
          value: choice.name,
          description: choice.hint
        })),
        initial: Math.max(
          0,
          choices.findIndex((choice) => choice.enabled)
        ),
        optionsPerPage: topicOptionsPerPage(this.output, choices.length),
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
    if (canceled || !isTopicSelection(answers.topic)) throw new HostSelectionCanceledError();
    return answers.topic;
  }

  async text(message: string, initial = ""): Promise<string> {
    const prompts = await loadPrompts();
    let canceled = false;
    const answers = await prompts(
      {
        type: "text",
        name: "value",
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
    if (canceled || typeof answers.value !== "string") throw new HostSelectionCanceledError();
    return answers.value;
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
  if (hosts.length === 0) throw new HostSelectionCanceledError(HOST_SELECTION_REQUIRED_MESSAGE);
  return hosts;
}

function mapPromptError(error: unknown): Error {
  if (error instanceof HostSelectionCanceledError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.trim() === "" || /cancel|abort|escape|sigint/i.test(message)) return new HostSelectionCanceledError();
  return error instanceof Error ? error : new Error(message);
}

function readScriptedPromptAnswers(): ScriptedPromptAnswers | undefined {
  const raw = process.env.LLM_WIKI_SKILLS_TEST_PROMPTS;
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const hosts = Array.isArray(parsed.hosts)
    ? parsed.hosts.filter((host): host is HostId => host === "codex" || host === "claude-code")
    : undefined;
  const topic = typeof parsed.topic === "string" && isTopicSelection(parsed.topic) ? parsed.topic : undefined;
  const customTopic = typeof parsed.customTopic === "string" ? parsed.customTopic : undefined;
  const confirm = typeof parsed.confirm === "boolean" ? parsed.confirm : undefined;
  const cancel = parsed.cancel === "hosts" || parsed.cancel === "topic" || parsed.cancel === "text" || parsed.cancel === "confirm" ? parsed.cancel : undefined;
  return { hosts, topic, customTopic, confirm, cancel };
}

function hostHint(host: HostId): string {
  switch (host) {
    case "codex":
      return "OpenAI Codex repo skills";
    case "claude-code":
      return "Claude Code project skills";
  }
}

export function topicOptionsPerPage(output: NodeJS.WriteStream, choiceCount: number): number {
  const rows = typeof (output as NodeJS.WriteStream & { rows?: unknown }).rows === "number" ? (output as NodeJS.WriteStream & { rows: number }).rows : undefined;
  if (!rows) return Math.min(choiceCount, DEFAULT_TOPIC_OPTIONS_PER_PAGE);
  const availableRows = Math.max(MIN_TOPIC_OPTIONS_PER_PAGE, rows - TOPIC_PROMPT_RESERVED_ROWS);
  return Math.min(choiceCount, availableRows);
}

function isTopicSelection(value: unknown): value is TopicSelectionId {
  return (
    value === "general" ||
    value === "study-research" ||
    value === "work-project" ||
    value === "product-builder" ||
    value === "writing-content" ||
    value === "trip-plan" ||
    value === "finance" ||
    value === "home-life" ||
    value === "medical" ||
    value === "legal-admin" ||
    value === "custom"
  );
}
