import { describe, expect, it } from "vitest";
import { initialHostSelectorState, reduceHostSelector } from "../src/cli/selector.js";

describe("host selector reducer", () => {
  it("moves down and up through hosts", () => {
    let state = initialHostSelectorState();
    state = reduceHostSelector(state, "down");
    expect(state.cursor).toBe(1);
    state = reduceHostSelector(state, "up");
    expect(state.cursor).toBe(0);
    state = reduceHostSelector(state, "up");
    expect(state.cursor).toBe(1);
  });

  it("toggles selected hosts with space", () => {
    let state = initialHostSelectorState();
    state = reduceHostSelector(state, "space");
    expect(state.selected).toEqual(["codex"]);
    state = reduceHostSelector(state, "down");
    state = reduceHostSelector(state, "space");
    expect(state.selected).toEqual(["codex", "claude-code"]);
    state = reduceHostSelector(state, "space");
    expect(state.selected).toEqual(["codex"]);
  });

  it("submits non-empty selections with enter", () => {
    let state = initialHostSelectorState();
    state = reduceHostSelector(state, "space");
    state = reduceHostSelector(state, "enter");
    expect(state.status).toBe("submitted");
  });

  it("marks empty enter as empty", () => {
    const state = reduceHostSelector(initialHostSelectorState(), "enter");
    expect(state.status).toBe("empty");
  });

  it("cancels on escape and Ctrl+C", () => {
    expect(reduceHostSelector(initialHostSelectorState(), "escape").status).toBe("canceled");
    expect(reduceHostSelector(initialHostSelectorState(), "ctrl-c").status).toBe("canceled");
  });
});
