import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const TEST_DIR = path.join(os.tmpdir(), `containme-test-config-${Date.now()}`);
const TEST_CONFIG_FILE = path.join(TEST_DIR, "config.yml");

describe("global config", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("parses a valid local model config", () => {
    const config = {
      local: {
        "api-url": "http://host.docker.internal:8001",
        model: "unsloth/Qwen3.5-27B",
      },
    };
    writeFileSync(TEST_CONFIG_FILE, stringifyYaml(config), "utf-8");

    const parsed = parseYaml(readFileSync(TEST_CONFIG_FILE, "utf-8"));
    expect(parsed.local["api-url"]).toBe("http://host.docker.internal:8001");
    expect(parsed.local.model).toBe("unsloth/Qwen3.5-27B");
  });

  it("round-trips config through YAML", () => {
    const config = {
      local: {
        "api-url": "http://localhost:8080",
        model: "my-model",
      },
    };
    writeFileSync(TEST_CONFIG_FILE, stringifyYaml(config), "utf-8");

    const parsed = parseYaml(readFileSync(TEST_CONFIG_FILE, "utf-8"));
    expect(parsed).toEqual(config);
  });

  it("preserves other config sections", () => {
    const config = {
      someOtherSection: { key: "value" },
      local: {
        "api-url": "http://host.docker.internal:8001",
        model: "test-model",
      },
    };
    const yaml = stringifyYaml(config);
    const parsed = parseYaml(yaml);
    expect(parsed.someOtherSection.key).toBe("value");
    expect(parsed.local.model).toBe("test-model");
  });

  it("detects incomplete local config (missing model)", () => {
    const config = { local: { "api-url": "http://localhost:8001" } };
    const local = config.local as Record<string, string>;
    expect(local["api-url"] && local.model).toBeFalsy();
  });

  it("detects complete local config", () => {
    const config = {
      local: { "api-url": "http://localhost:8001", model: "my-model" },
    };
    expect(config.local["api-url"] && config.local.model).toBeTruthy();
  });
});
