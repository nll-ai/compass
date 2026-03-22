import { describe, it, expect } from "vitest";
import { watchTargetRowOwnerIs } from "../convex/lib/auth";

describe("watchTargetRowOwnerIs", () => {
  const uid = "jd7abc123" as import("../convex/_generated/dataModel").Id<"users">;

  it("returns true when userId matches row userId", () => {
    expect(watchTargetRowOwnerIs(uid, { userId: uid })).toBe(true);
  });

  it("returns false when user is not the row owner", () => {
    const other = "jd7other00" as import("../convex/_generated/dataModel").Id<"users">;
    expect(watchTargetRowOwnerIs(uid, { userId: other })).toBe(false);
  });

  it("returns false when userId or target is missing", () => {
    expect(watchTargetRowOwnerIs(null, { userId: uid })).toBe(false);
    expect(watchTargetRowOwnerIs(uid, null)).toBe(false);
    expect(watchTargetRowOwnerIs(uid, { userId: undefined })).toBe(false);
  });
});
