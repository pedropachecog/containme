import { readFileSync } from "node:fs";

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function isWSL(): boolean {
  if (process.platform !== "linux") {
    return false;
  }
  try {
    const procVersion = readFileSync("/proc/version", "utf-8").toLowerCase();
    return procVersion.includes("microsoft") || procVersion.includes("wsl");
  } catch {
    return false;
  }
}

export function getShell(): string {
  if (isWindows()) {
    return process.env.COMSPEC ?? "cmd.exe";
  }
  return process.env.SHELL ?? "/bin/sh";
}
