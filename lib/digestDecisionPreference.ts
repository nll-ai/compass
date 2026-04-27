export type DecisionBriefPreference = "inherit" | "enabled" | "disabled";

export function isDecisionBriefEnabledByDefault(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "false") return false;
  return true;
}

export function resolveDecisionBriefEnabled(
  preference: DecisionBriefPreference | undefined,
  systemDefaultEnabled: boolean,
): boolean {
  if (preference === "enabled") return true;
  if (preference === "disabled") return false;
  return systemDefaultEnabled;
}
