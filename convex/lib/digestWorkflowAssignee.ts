/**
 * Pure rules for who may be assigned digest workflow on a watch target.
 */
export function isEligibleDigestAssignee(params: {
  targetOwnerUserId: string;
  targetTeamId: string | null | undefined;
  assigneeUserId: string;
  assigneeTeamId: string | null | undefined;
}): boolean {
  if (params.assigneeUserId === params.targetOwnerUserId) return true;
  if (params.targetTeamId != null && params.assigneeTeamId === params.targetTeamId) return true;
  return false;
}
