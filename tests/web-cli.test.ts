import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { execaNode } from "./helpers/process.js";
import { DEFAULT_ATLAS_PORT, startAtlasServer, staticPathnameToRelative } from "../src/core/web-server.js";

describe("web cli", () => {
  it("web build writes deployable atlas assets and clean json", async () => {
    const root = await copyDemoVault();
    const out = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-web-out-"));
    const result = await execaNode(["dist/cli/index.js", "web", "build", "--root", root, "--out", out, "--json"]);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.outDir).toBe(out);
    expect(parsed.nodeCount).toBe(2);
    await expect(stat(path.join(out, "index.html"))).resolves.toBeTruthy();
    await expect(readFile(path.join(out, "atlas/manifest.json"), "utf8")).resolves.toContain('"schemaVersion": 1');
  });

  it("web build --quiet emits no output", async () => {
    const root = await copyDemoVault();
    const out = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-web-quiet-"));
    const result = await execaNode(["dist/cli/index.js", "web", "build", "--root", root, "--out", out, "--quiet"]);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("web build rejects a missing vault", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-missing-"));
    const out = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-web-missing-"));
    const result = await execaNode(["dist/cli/index.js", "web", "build", "--root", root, "--out", out], {}, false);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Vault not found");
  });

  it("build output contains packaged viewer assets", async () => {
    await expect(stat(path.resolve("dist/web-viewer/index.html"))).resolves.toBeTruthy();
    await expect(readFile(path.resolve("dist/web-viewer/assets/app.js"), "utf8")).resolves.toContain("Graph Atlas");
  });

  it("web serve defaults to the atlas port", async () => {
    const root = await copyDemoVault();
    const out = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-web-serve-"));
    const server = await startAtlasServer(root, out);
    try {
      expect(server.port).toBe(DEFAULT_ATLAS_PORT);
      expect(server.url).toBe(`http://127.0.0.1:${DEFAULT_ATLAS_PORT}/`);
    } finally {
      await server.close();
    }
  });

  it("web serve preserves encoded page ids with slashes", () => {
    expect(staticPathnameToRelative(`/atlas/pages/${encodeURIComponent("topics/graph-first-vault")}.json`)).toBe(
      "atlas/pages/topics%2Fgraph-first-vault.json"
    );
  });
});

async function copyDemoVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-demo-"));
  await cp(path.resolve("fixtures/demo-vault"), root, { recursive: true });
  return root;
}
