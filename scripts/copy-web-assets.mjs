import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "src/web-viewer");
const target = path.join(root, "dist/web-viewer");

await rm(target, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
