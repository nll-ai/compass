import {
  resolveDecisionBriefEnabled,
  type DecisionBriefPreference,
} from "./digestDecisionPreference";
import {
  digestItemQualifiesBySourceRecency,
  lookbackWindowCutoffMs,
} from "./scan/lookback";

/** One signal card in digest email HTML (no raw linkage — that lives only on {@link DigestItemForEmailPlan}). */
export type DigestEmailRenderableItem = {
  watchTargetId: string;
  significance: string;
  category: string;
  headline: string;
  synthesis?: string;
  sources?: Array<{
    url: string;
    title?: string;
    source?: string;
    date?: string;
  }>;
};

/** Digest item shape needed for subscription + source-recency filtering before HTML. */
export type DigestItemForEmailPlan = DigestEmailRenderableItem & {
  rawItemIds: readonly string[];
};

/** Subset of `digestRuns` needed to assemble email copy and Decision brief visibility. */
export type DigestRunFieldsForEmail = {
  generatedAt: number;
  period: string;
  executiveSummary: string;
  deltaSummary?: string;
  materialitySummary?: string;
  strategicReadSummary?: string;
  recommendedActionsSummary?: string;
  confidence?: "low" | "medium" | "high";
};

/** Arguments to the HTML builder — kept in one type so policy and render stay aligned. */
export type DigestEmailHtmlArgs = {
  appUrl: string;
  period: string;
  dateStr: string;
  executiveSummary: string;
  showExecutiveSummary: boolean;
  deltaSummary?: string;
  materialitySummary?: string;
  strategicReadSummary?: string;
  recommendedActionsSummary?: string;
  confidence?: string;
  includeDecisionBrief: boolean;
  emailLookbackDays: number;
  recipientTargetIds: string[];
  items: DigestEmailRenderableItem[];
  targetDisplayNameById: Map<string, string>;
};

/**
 * Pure digest-email policy + structured render input for one recipient.
 *
 * Caller must load `rawById` for every `rawItemId` referenced by digest items in the run (or a superset),
 * e.g. one batched `getByIdsInternal` over the union of ids.
 *
 * :param subscribedWatchTargetIds: **`null`** when the user is not on a team — all `scanRunTargetIds`
 * are in scope. Otherwise ids the user is subscribed to (intersected with the scan run).
 */
export function planDigestEmailForRecipient(args: {
  digestRun: DigestRunFieldsForEmail;
  scanRunTargetIds: readonly string[];
  allDigestItems: readonly DigestItemForEmailPlan[];
  targetDisplayNameById: Map<string, string>;
  subscribedWatchTargetIds: readonly string[] | null;
  rawById: Map<string, { publishedAt?: number; _creationTime: number }>;
  digestEmailLookbackDays: number;
  decisionBriefPreference?: DecisionBriefPreference;
  systemDecisionBriefDefault: boolean;
  appUrl: string;
  dateStr: string;
}): { subject: string; htmlArgs: DigestEmailHtmlArgs } {
  const targetIdsInRun = new Set(args.scanRunTargetIds);
  const allowed =
    args.subscribedWatchTargetIds === null
      ? targetIdsInRun
      : new Set(args.subscribedWatchTargetIds);

  const recipientTargetIds = args.scanRunTargetIds.filter((id) => allowed.has(id));
  const itemsForUserSub = args.allDigestItems.filter((item) => allowed.has(item.watchTargetId));

  const cutoffMs = lookbackWindowCutoffMs(args.digestRun.generatedAt, args.digestEmailLookbackDays);
  const itemsInWindow = itemsForUserSub.filter((item) =>
    digestItemQualifiesBySourceRecency(item.rawItemIds, (id) => args.rawById.get(id), cutoffMs),
  );

  const showExecutiveSummary = itemsForUserSub.length > 0 && itemsInWindow.length > 0;
  const renderItems: DigestEmailRenderableItem[] = itemsInWindow.map(
    ({ rawItemIds: _raw, ...renderable }) => renderable,
  );

  const htmlArgs: DigestEmailHtmlArgs = {
    appUrl: args.appUrl,
    period: args.digestRun.period,
    dateStr: args.dateStr,
    executiveSummary: args.digestRun.executiveSummary,
    showExecutiveSummary,
    deltaSummary: args.digestRun.deltaSummary,
    materialitySummary: args.digestRun.materialitySummary,
    strategicReadSummary: args.digestRun.strategicReadSummary,
    recommendedActionsSummary: args.digestRun.recommendedActionsSummary,
    confidence: args.digestRun.confidence,
    includeDecisionBrief:
      itemsInWindow.length > 0 &&
      resolveDecisionBriefEnabled(
        args.decisionBriefPreference,
        args.systemDecisionBriefDefault,
      ),
    emailLookbackDays: args.digestEmailLookbackDays,
    recipientTargetIds,
    items: renderItems,
    targetDisplayNameById: args.targetDisplayNameById,
  };

  const multi = args.scanRunTargetIds.length > 1;
  const subject = multi
    ? `Compass: ${args.digestRun.period} digest (${args.scanRunTargetIds.length} targets)`
    : `Compass: New ${args.digestRun.period} digest`;

  return { subject, htmlArgs };
}
