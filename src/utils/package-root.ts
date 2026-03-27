import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not locate containme package root.");
    dir = parent;
  }
}

export function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return findPackageRoot(path.dirname(thisFile));
}
