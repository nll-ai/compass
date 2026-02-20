import type { DigestItem, DigestRun, WatchTarget } from "./lib/types";
import { buildSlackPayload } from "./lib/slack_builder";

export async function postDigestToSlack(digest: DigestRun, items: DigestItem[], targets: WatchTarget[]) {
  const payload = buildSlackPayload(digest, items, targets);
  return {
    ok: true,
    payload,
    message: "Scaffold: perform webhook POST and record Slack status.",
  };
}
