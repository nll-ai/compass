import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mocked-model"),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/scan/sources/edgar-agent", () => ({
  resolveCompanyToSEC: vi.fn(),
}));

function mockGenerateObjectResult(object: Record<string, unknown>) {
  return {
    object,
    finishReason: "stop" as const,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    warnings: [],
    request: {},
    response: {},
    text: JSON.stringify(object),
    toJsonResponse: () => new Response(JSON.stringify(object)),
  };
}

describe("POST /api/targets/lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("@spec R-PERSON-2.1: Lookup API identifies researchers", () => {
    it("returns type: person for researcher names", async () => {
      const { generateObject } = await import("ai");
      vi.mocked(generateObject).mockResolvedValueOnce(
        mockGenerateObjectResult({
          name: "Jennifer Doudna",
          displayName: "Jennifer Doudna",
          aliases: ["J. Doudna", "Jennifer A. Doudna"],
          type: "person",
          therapeuticArea: "other",
          indication: null,
          company: null,
          affiliation: "Stanford University",
        }) as any
      );

      const { POST } = await import("@/app/api/targets/lookup/route");
      const req = new NextRequest("http://localhost/api/targets/lookup", {
        method: "POST",
        body: JSON.stringify({ query: "Jennifer Doudna" }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.type).toBe("person");
      expect(data.name).toBe("Jennifer Doudna");
      expect(data.affiliation).toBe("Stanford University");
    });

    it("includes affiliation in response for person type", async () => {
      const { generateObject } = await import("ai");
      vi.mocked(generateObject).mockResolvedValueOnce(
        mockGenerateObjectResult({
          name: "Eric Lander",
          displayName: "Eric Lander",
          aliases: ["E. Lander"],
          type: "person",
          therapeuticArea: "other",
          indication: null,
          company: null,
          affiliation: "Broad Institute",
        }) as any
      );

      const { POST } = await import("@/app/api/targets/lookup/route");
      const req = new NextRequest("http://localhost/api/targets/lookup", {
        method: "POST",
        body: JSON.stringify({ query: "Eric Lander" }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.affiliation).toBe("Broad Institute");
    });
  });

  describe("existing types still work (no regression)", () => {
    it("returns type: drug for drug queries", async () => {
      const { generateObject } = await import("ai");
      vi.mocked(generateObject).mockResolvedValueOnce(
        mockGenerateObjectResult({
          name: "REGN5381",
          displayName: "REGN5381 (Regeneron NPR1 agonist)",
          aliases: ["Regeneron NPR1"],
          type: "drug",
          therapeuticArea: "cardiovascular",
          indication: "Heart failure",
          company: "Regeneron",
          affiliation: null,
        }) as any
      );

      const { resolveCompanyToSEC } = await import("@/lib/scan/sources/edgar-agent");
      vi.mocked(resolveCompanyToSEC).mockResolvedValueOnce({ displayName: "Regeneron Pharmaceuticals Inc" } as any);

      const { POST } = await import("@/app/api/targets/lookup/route");
      const req = new NextRequest("http://localhost/api/targets/lookup", {
        method: "POST",
        body: JSON.stringify({ query: "REGN5381" }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.type).toBe("drug");
    });
  });
});
