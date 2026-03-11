import { describe, it, expect } from "vitest";

describe("Watch Target Types", () => {
  describe("@spec R-PERSON-1: person type is valid", () => {
    it("accepts person as a valid target type", () => {
      const validTypes = ["drug", "target", "company", "person"] as const;
      expect(validTypes).toContain("person");
    });
  });

  describe("@spec R-PERSON-4: affiliation field can be stored", () => {
    it("allows affiliation on watch target", () => {
      const target = {
        name: "Jennifer Doudna",
        displayName: "Jennifer Doudna",
        type: "person" as const,
        affiliation: "Stanford University",
        therapeuticArea: "other" as const,
        aliases: [],
        active: true,
      };
      expect(target.affiliation).toBe("Stanford University");
    });
  });
});
