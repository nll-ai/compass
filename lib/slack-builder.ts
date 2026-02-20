import { formatCategory, formatDate, significanceEmoji } from "./formatters";
import type { DigestItem, DigestRun, WatchTarget } from "./types";

export function buildSlackPayload(digest: DigestRun, items: DigestItem[], targets: WatchTarget[]) {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🧭 Compass — ${digest.period === "weekly" ? "Weekly" : "Daily"} digest · ${formatDate(digest.generatedAt)}`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: digest.executiveSummary },
    },
    { type: "divider" },
  ];

  for (const item of items) {
    blocks.push(...buildItemBlocks(item, targets));
  }

  return { blocks };
}

function buildItemBlocks(item: DigestItem, targets: WatchTarget[]) {
  const target = targets.find((t) => t._id === item.watchTargetId);
  const lines = [
    `${significanceEmoji(item.significance)} *${item.significance.toUpperCase()}* · ${formatCategory(item.category)} · ${target?.name ?? "Unknown"}`,
    "",
    `*${item.headline}*`,
    "",
    item.synthesis,
    item.strategicImplication ? `\n⚡ _${item.strategicImplication}_` : "",
  ].filter(Boolean);

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    },
    { type: "divider" },
  ];
}
