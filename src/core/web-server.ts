import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs.js";
import { exportAtlas, type AtlasManifest, type AtlasSearchDocument } from "./web-export.js";
import { searchAtlas } from "./web-search.js";

export const DEFAULT_ATLAS_PORT = 3678;

export interface AtlasServer {
  root: string;
  outDir: string;
  port: number;
  url: string;
  server: Server;
  close(): Promise<void>;
}

export async function startAtlasServer(root: string, outDir: string, port = DEFAULT_ATLAS_PORT): Promise<AtlasServer> {
  const resolvedRoot = path.resolve(root);
  const resolvedOut = path.resolve(outDir);
  await exportAtlas(resolvedRoot, resolvedOut);
  const manifest = JSON.parse(await readFile(path.join(resolvedOut, "atlas/manifest.json"), "utf8")) as AtlasManifest;
  const searchIndex = JSON.parse(await readFile(path.join(resolvedOut, "atlas/search-index.json"), "utf8")) as AtlasSearchDocument[];
  const server = createServer((request, response) => {
    void handleRequest(request, response, resolvedRoot, resolvedOut, manifest, searchIndex);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    root: resolvedRoot,
    outDir: resolvedOut,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}/`,
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  outDir: string,
  manifest: AtlasManifest,
  searchIndex: AtlasSearchDocument[]
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/api/search") {
    const query = url.searchParams.get("q") ?? "";
    const result = await searchAtlas(root, query, searchIndex, manifest.qmd.available);
    writeJson(response, 200, result);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    writeText(response, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const filePath = await resolveStaticPath(outDir, url.pathname);
  if (!filePath) {
    writeText(response, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  response.writeHead(200, {
    "content-type": contentType(filePath),
    "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=60"
  });
  response.end(await readFile(filePath));
}

async function resolveStaticPath(outDir: string, pathname: string): Promise<string | undefined> {
  const relative = staticPathnameToRelative(pathname);
  const target = path.resolve(outDir, relative);
  if (!target.startsWith(`${path.resolve(outDir)}${path.sep}`) && target !== path.resolve(outDir)) return undefined;
  if (await pathExists(target)) return target;
  return path.join(outDir, "index.html");
}

export function staticPathnameToRelative(pathname: string): string {
  const decoded = decodeURIComponent(pathname.replace(/%2f/gi, "%252F"));
  return decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  writeText(response, status, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

function writeText(response: ServerResponse, status: number, value: string, type: string): void {
  response.writeHead(status, { "content-type": type });
  response.end(value);
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}
