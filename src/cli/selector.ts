import readline from "node:readline";
import type { ReadStream, WriteStream } from "node:tty";
import { HostRequiredError, HostSelectionCanceledError } from "../core/errors.js";
import { HOST_IDS } from "../core/hosts.js";
import type { HostId } from "../core/types.js";

export type SelectorKey = "up" | "down" | "space" | "enter" | "escape" | "ctrl-c";

export interface HostSelectorState {
  cursor: number;
  selected: HostId[];
  status: "active" | "submitted" | "canceled" | "empty";
}

export function initialHostSelectorState(defaultSelected: HostId[] = []): HostSelectorState {
  return {
    cursor: 0,
    selected: [...defaultSelected],
    status: "active"
  };
}

export function reduceHostSelector(state: HostSelectorState, key: SelectorKey): HostSelectorState {
  if (state.status !== "active") return state;
  switch (key) {
    case "up":
      return { ...state, cursor: (state.cursor + HOST_IDS.length - 1) % HOST_IDS.length };
    case "down":
      return { ...state, cursor: (state.cursor + 1) % HOST_IDS.length };
    case "space": {
      const host = HOST_IDS[state.cursor];
      const selected = state.selected.includes(host)
        ? state.selected.filter((candidate) => candidate !== host)
        : [...state.selected, host];
      return { ...state, selected };
    }
    case "enter":
      return { ...state, status: state.selected.length > 0 ? "submitted" : "empty" };
    case "escape":
    case "ctrl-c":
      return { ...state, status: "canceled" };
  }
}

export async function selectHosts(input: ReadStream, output: WriteStream): Promise<HostId[]> {
  let state = initialHostSelectorState();
  const wasRaw = input.isRaw;
  readline.emitKeypressEvents(input);
  if (input.isTTY) input.setRawMode(true);
  output.write(renderSelector(state));

  try {
    return await new Promise<HostId[]>((resolve, reject) => {
      function cleanup(): void {
        input.off("keypress", onKeypress);
      }
      function finish(next: HostSelectorState): void {
        cleanup();
        output.write("\n");
        if (next.status === "submitted") resolve(next.selected);
        else if (next.status === "empty") reject(new HostRequiredError("Select at least one host."));
        else reject(new HostSelectionCanceledError());
      }
      function onKeypress(_chunk: string, key: readline.Key): void {
        const selectorKey = toSelectorKey(key);
        if (!selectorKey) return;
        state = reduceHostSelector(state, selectorKey);
        output.write(renderSelector(state));
        if (state.status !== "active") finish(state);
      }
      input.on("keypress", onKeypress);
    });
  } finally {
    if (input.isTTY) input.setRawMode(wasRaw);
  }
}

function toSelectorKey(key: readline.Key): SelectorKey | undefined {
  if (key.ctrl && key.name === "c") return "ctrl-c";
  if (key.name === "up") return "up";
  if (key.name === "down") return "down";
  if (key.name === "space") return "space";
  if (key.name === "return" || key.name === "enter") return "enter";
  if (key.name === "escape") return "escape";
  return undefined;
}

function renderSelector(state: HostSelectorState): string {
  const lines = ["\x1b[2J\x1b[HSelect target host(s):", ""];
  HOST_IDS.forEach((host, index) => {
    const pointer = state.cursor === index ? ">" : " ";
    const checked = state.selected.includes(host) ? "x" : " ";
    lines.push(`${pointer} [${checked}] ${host}`);
  });
  lines.push("", "Use arrows, space, enter. Esc cancels.");
  return lines.join("\n");
}
