import path from "node:path";
import { isWindows } from "../utils/platform.js";

/**
 * Converts a path to a Docker-compatible bind-mount path.
 *
 * On Windows, a path like D:\foo\bar becomes /d/foo/bar so that
 * Docker Desktop (which expects Unix-style paths) can resolve it.
 * On Linux/Mac the path is simply resolved to an absolute path.
 */
export function resolveProjectPath(inputPath: string): string {
  if (isWindows()) {
    // Normalise to forward slashes first
    let converted = inputPath.replace(/\\/g, "/");

    // Match a drive letter prefix such as D:/ or D:/
    const driveMatch = converted.match(/^([A-Za-z]):\//);
    if (driveMatch) {
      const driveLetter = driveMatch[1].toLowerCase();
      converted = `/${driveLetter}/${converted.slice(3)}`;
    }

    // Strip any trailing slash (unless it's the root "/")
    if (converted.length > 1 && converted.endsWith("/")) {
      converted = converted.slice(0, -1);
    }

    return converted;
  }

  // Non-Windows: resolve to an absolute path using Node's path module
  return path.resolve(inputPath);
}

/**
 * Resolves the given path to an absolute path using the platform's native
 * path resolution (node:path.resolve).
 */
export function toAbsolute(inputPath: string): string {
  return path.resolve(inputPath);
}

