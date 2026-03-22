import { describe, it, expect } from "vitest";
import {
  linkKeyForRawItem,
  mergeRawItemIds,
  orderedTargetPair,
  scopeKeyForWatchTarget,
} from "../convex/lib/crossTargetLinks";
import type { Doc, Id } from "../convex/_generated/dataModel";

function watchTarget(partial: Partial<Doc<"watchTargets">>): Doc<"watchTargets"> {
  return partial as Doc<"watchTargets">;
}

describe("linkKeyForRawItem", () => {
  it("joins source and externalId with a colon", () => {
    expect(
      linkKeyForRawItem({
        source: "pubmed",
        externalId: "12345",
      }),
    ).toBe("pubmed:12345");
  });

  it("works for clinicaltrials NCT ids", () => {
    expect(
      linkKeyForRawItem({
        source: "clinicaltrials",
        externalId: "NCT01234567",
      }),
    ).toBe("clinicaltrials:NCT01234567");
  });
});

describe("scopeKeyForWatchTarget", () => {
  it("uses team scope when teamId is set", () => {
    const teamId = "tm_team111" as Id<"teams">;
    expect(
      scopeKeyForWatchTarget(
        watchTarget({
          teamId,
          userId: "jd7user00" as Id<"users">,
        }),
      ),
    ).toBe(`team:${teamId}`);
  });

  it("uses user scope when only userId is set", () => {
    const userId = "jd7user00" as Id<"users">;
    expect(scopeKeyForWatchTarget(watchTarget({ userId, teamId: undefined }))).toBe(`user:${userId}`);
  });

  it("returns null when neither teamId nor userId is set", () => {
    expect(scopeKeyForWatchTarget(watchTarget({ teamId: undefined, userId: undefined }))).toBeNull();
  });
});

describe("orderedTargetPair", () => {
  it("orders lexicographically ascending", () => {
    const a = "k1aaaa" as Id<"watchTargets">;
    const b = "k1bbbb" as Id<"watchTargets">;
    expect(orderedTargetPair(b, a)).toEqual([a, b]);
    expect(orderedTargetPair(a, b)).toEqual([a, b]);
  });
});

describe("mergeRawItemIds", () => {
  it("dedupes and prefers additions order before existing", () => {
    const r1 = "ri_one01" as Id<"rawItems">;
    const r2 = "ri_two02" as Id<"rawItems">;
    const r3 = "ri_three" as Id<"rawItems">;
    expect(mergeRawItemIds([r2, r3], [r1, r2])).toEqual([r1, r2, r3]);
  });

  it("caps at 40 unique ids", () => {
    const existing = Array.from({ length: 25 }, (_, i) => `ri_ex_${i}` as Id<"rawItems">);
    const additions = Array.from({ length: 25 }, (_, i) => `ri_new_${i}` as Id<"rawItems">);
    const merged = mergeRawItemIds(existing, additions);
    expect(merged.length).toBe(40);
    expect(merged[0]).toBe(additions[0]);
  });
});
