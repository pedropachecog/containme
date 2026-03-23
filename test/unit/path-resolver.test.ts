import { describe, it, expect, vi, afterEach } from "vitest";

// We need to mock isWindows before importing the module under test
const mockIsWindows = vi.fn(() => false);
vi.mock("../../src/utils/platform.js", () => ({
  isWindows: mockIsWindows,
}));

const { resolveProjectPath, toAbsolute } = await import(
  "../../src/core/path-resolver.js"
);

describe("resolveProjectPath", () => {
  afterEach(() => {
    mockIsWindows.mockReset();
  });

  it("converts Windows drive paths to Docker format", () => {
    mockIsWindows.mockReturnValue(true);
    expect(resolveProjectPath("D:\\foo\\bar")).toBe("/d/foo/bar");
  });

  it("converts uppercase drive letters to lowercase", () => {
    mockIsWindows.mockReturnValue(true);
    expect(resolveProjectPath("C:\\Users\\test")).toBe("/c/Users/test");
  });

  it("strips trailing slash on Windows", () => {
    mockIsWindows.mockReturnValue(true);
    expect(resolveProjectPath("D:\\foo\\bar\\")).toBe("/d/foo/bar");
  });

  it("handles forward-slash Windows paths", () => {
    mockIsWindows.mockReturnValue(true);
    expect(resolveProjectPath("D:/foo/bar")).toBe("/d/foo/bar");
  });

  it("returns resolved absolute path on non-Windows", () => {
    mockIsWindows.mockReturnValue(false);
    const result = resolveProjectPath("/home/user/project");
    // On actual Windows, path.resolve("/home/user/project") prepends the drive letter
    // This test validates the non-Windows branch runs (no drive letter conversion)
    expect(result).toMatch(/home[\\/]user[\\/]project$/);
  });
});

describe("toAbsolute", () => {
  it("resolves relative paths to absolute", () => {
    const result = toAbsolute(".");
    expect(result).toBeTruthy();
    // Should be an absolute path (starts with / or drive letter)
    expect(result === process.cwd() || /^[A-Z]:\\/i.test(result) || result.startsWith("/")).toBe(true);
  });
});
