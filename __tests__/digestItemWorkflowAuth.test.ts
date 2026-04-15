import { describe, expect, it } from "vitest";
import { isEligibleDigestAssignee } from "../convex/lib/digestWorkflowAssignee";

describe("digest item workflow assignee rules", () => {
  it("allows target owner regardless of team", () => {
    expect(
      isEligibleDigestAssignee({
        targetOwnerUserId: "u_owner",
        targetTeamId: "t1",
        assigneeUserId: "u_owner",
        assigneeTeamId: undefined,
      }),
    ).toBe(true);
  });

  it("allows teammate when target has teamId", () => {
    expect(
      isEligibleDigestAssignee({
        targetOwnerUserId: "u_owner",
        targetTeamId: "t1",
        assigneeUserId: "u_peer",
        assigneeTeamId: "t1",
      }),
    ).toBe(true);
  });

  it("rejects user not owner and not on target team", () => {
    expect(
      isEligibleDigestAssignee({
        targetOwnerUserId: "u_owner",
        targetTeamId: "t1",
        assigneeUserId: "u_stranger",
        assigneeTeamId: "t2",
      }),
    ).toBe(false);
  });

  it("rejects non-owner when target has no team (solo target)", () => {
    expect(
      isEligibleDigestAssignee({
        targetOwnerUserId: "u_owner",
        targetTeamId: null,
        assigneeUserId: "u_other",
        assigneeTeamId: null,
      }),
    ).toBe(false);
  });
});
