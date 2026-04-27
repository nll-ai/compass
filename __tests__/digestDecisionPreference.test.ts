import { describe, expect, it } from "vitest";
import {
  isDecisionBriefEnabledByDefault,
  resolveDecisionBriefEnabled,
} from "../lib/digestDecisionPreference";

describe("digestDecisionPreference", () => {
  it("defaults system behavior to enabled unless explicitly false", () => {
    expect(isDecisionBriefEnabledByDefault("true")).toBe(true);
    expect(isDecisionBriefEnabledByDefault("FALSE")).toBe(false);
    expect(isDecisionBriefEnabledByDefault("1")).toBe(true);
    expect(isDecisionBriefEnabledByDefault(undefined)).toBe(true);
  });

  it("resolves inherit to system default", () => {
    expect(resolveDecisionBriefEnabled("inherit", true)).toBe(true);
    expect(resolveDecisionBriefEnabled("inherit", false)).toBe(false);
    expect(resolveDecisionBriefEnabled(undefined, true)).toBe(true);
  });

  it("applies user override over system default", () => {
    expect(resolveDecisionBriefEnabled("enabled", false)).toBe(true);
    expect(resolveDecisionBriefEnabled("disabled", true)).toBe(false);
  });
});
