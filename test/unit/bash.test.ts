import { describe, it, expect } from "vitest";
import { displayPath, filterContainers, resolveBashTarget } from "../../src/commands/bash.js";
import type { ContainmeContainer } from "../../src/commands/bash.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(overrides: Partial<ContainmeContainer> = {}): ContainmeContainer {
  return {
    id: "abc123def456",
    name: "compose-agent-run-abc123",
    agent: "claude",
    trust: "bind",
    project: "/run/desktop/mnt/host/d/Pedro/Repos/myproject",
    workspaceMount: "/run/desktop/mnt/host/d/Pedro/Repos/myproject",
    status: "Up 2 hours",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// displayPath
// ---------------------------------------------------------------------------

describe("displayPath", () => {
  it("converts WSL Docker Desktop path to Windows format", () => {
    expect(displayPath("/run/desktop/mnt/host/d/Pedro/Repos/foo")).toBe("D:/Pedro/Repos/foo");
  });

  it("uppercases drive letter", () => {
    expect(displayPath("/run/desktop/mnt/host/c/Users/pmpg/project")).toBe("C:/Users/pmpg/project");
  });

  it("passes through non-WSL paths unchanged", () => {
    expect(displayPath("/workspace")).toBe("/workspace");
    expect(displayPath("/home/agent/.claude")).toBe("/home/agent/.claude");
  });

  it("handles drive letter z", () => {
    expect(displayPath("/run/desktop/mnt/host/z/some/path")).toBe("Z:/some/path");
  });
});

// ---------------------------------------------------------------------------
// filterContainers
// ---------------------------------------------------------------------------

describe("filterContainers", () => {
  const claude1 = makeContainer({
    id: "aaa",
    agent: "claude",
    project: "/run/desktop/mnt/host/d/Repos/alpha",
    workspaceMount: "/run/desktop/mnt/host/d/Repos/alpha",
  });
  const claude2 = makeContainer({
    id: "bbb",
    agent: "claude",
    project: "/run/desktop/mnt/host/d/Repos/beta",
    workspaceMount: "/run/desktop/mnt/host/d/Repos/beta",
  });
  const codex1 = makeContainer({
    id: "ccc",
    agent: "codex",
    project: "/run/desktop/mnt/host/d/Repos/alpha",
    workspaceMount: "/run/desktop/mnt/host/d/Repos/alpha",
  });

  it("returns all containers when no filters", () => {
    expect(filterContainers([claude1, claude2, codex1], {})).toHaveLength(3);
  });

  it("filters by agent", () => {
    const result = filterContainers([claude1, claude2, codex1], { agent: "claude" });
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.agent === "claude")).toBe(true);
  });

  it("returns empty array when agent has no containers", () => {
    expect(filterContainers([claude1, claude2], { agent: "codex" })).toHaveLength(0);
  });

  it("matches by exact docker project path", () => {
    const result = filterContainers([claude1, claude2, codex1], {
      dockerPath: "/run/desktop/mnt/host/d/Repos/alpha",
    });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(["aaa", "ccc"]);
  });

  it("matches by exact workspaceMount when project label differs", () => {
    const c = makeContainer({
      id: "ddd",
      project: "",
      workspaceMount: "/run/desktop/mnt/host/d/Repos/gamma",
    });
    const result = filterContainers([c], {
      dockerPath: "/run/desktop/mnt/host/d/Repos/gamma",
    });
    expect(result).toHaveLength(1);
  });

  it("matches by basename for convenience", () => {
    const result = filterContainers([claude1, claude2], { dockerPath: "/d/Repos/alpha" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("aaa");
  });

  it("combines agent and path filters", () => {
    const result = filterContainers([claude1, claude2, codex1], {
      agent: "claude",
      dockerPath: "/run/desktop/mnt/host/d/Repos/alpha",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("aaa");
  });
});

// ---------------------------------------------------------------------------
// resolveBashTarget — pure decision logic: exec into existing vs start fresh
// ---------------------------------------------------------------------------

describe("resolveBashTarget", () => {
  const alpha = makeContainer({
    id: "aaa",
    agent: "claude",
    project: "/run/desktop/mnt/host/d/Repos/alpha",
    workspaceMount: "/run/desktop/mnt/host/d/Repos/alpha",
  });
  const beta = makeContainer({
    id: "bbb",
    agent: "claude",
    project: "/run/desktop/mnt/host/d/Repos/beta",
    workspaceMount: "/run/desktop/mnt/host/d/Repos/beta",
  });

  it("returns exec action when exactly one container matches", () => {
    const result = resolveBashTarget([alpha, beta], { dockerPath: "/run/desktop/mnt/host/d/Repos/alpha" });
    expect(result).toEqual({ action: "exec", container: alpha });
  });

  it("returns fresh action when no containers are running", () => {
    const result = resolveBashTarget([], {});
    expect(result).toEqual({ action: "fresh" });
  });

  it("returns fresh action when no containers match the project path", () => {
    const result = resolveBashTarget([alpha, beta], { dockerPath: "/run/desktop/mnt/host/d/Repos/gamma" });
    expect(result).toEqual({ action: "fresh" });
  });

  it("returns pick action when multiple containers match", () => {
    const result = resolveBashTarget([alpha, beta], {});
    expect(result).toEqual({ action: "pick", containers: [alpha, beta] });
  });

  it("returns fresh action when agent filter leaves no containers", () => {
    const result = resolveBashTarget([alpha], { agent: "codex" });
    expect(result).toEqual({ action: "fresh" });
  });

  it("applies agent filter before path filter", () => {
    const codexAlpha = makeContainer({ id: "ccc", agent: "codex", workspaceMount: "/run/desktop/mnt/host/d/Repos/alpha", project: "/run/desktop/mnt/host/d/Repos/alpha" });
    const result = resolveBashTarget([alpha, codexAlpha], {
      agent: "claude",
      dockerPath: "/run/desktop/mnt/host/d/Repos/alpha",
    });
    expect(result).toEqual({ action: "exec", container: alpha });
  });
});
