/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chat from "../chat.js";
import type * as crons from "../crons.js";
import type * as crossTargetGraph from "../crossTargetGraph.js";
import type * as digestGenerate from "../digestGenerate.js";
import type * as digestItems from "../digestItems.js";
import type * as digestRuns from "../digestRuns.js";
import type * as digests from "../digests.js";
import type * as email from "../email.js";
import type * as feedbackForScan from "../feedbackForScan.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crossTargetLinks from "../lib/crossTargetLinks.js";
import type * as lib_digestHelpers from "../lib/digestHelpers.js";
import type * as lib_digestWorkflowAssignee from "../lib/digestWorkflowAssignee.js";
import type * as lib_formatters from "../lib/formatters.js";
import type * as lib_slack_builder from "../lib/slack_builder.js";
import type * as lib_sourceIds from "../lib/sourceIds.js";
import type * as lib_types from "../lib/types.js";
import type * as pageContentCache from "../pageContentCache.js";
import type * as rawItems from "../rawItems.js";
import type * as scanSchedule from "../scanSchedule.js";
import type * as scans from "../scans.js";
import type * as settings from "../settings.js";
import type * as slack from "../slack.js";
import type * as sourceLinkFeedback from "../sourceLinkFeedback.js";
import type * as sources_clinicaltrials from "../sources/clinicaltrials.js";
import type * as sources_edgar from "../sources/edgar.js";
import type * as sources_exa from "../sources/exa.js";
import type * as sources_openfda from "../sources/openfda.js";
import type * as sources_patents from "../sources/patents.js";
import type * as sources_pubmed from "../sources/pubmed.js";
import type * as sources_rss from "../sources/rss.js";
import type * as targetSubscriptions from "../targetSubscriptions.js";
import type * as teams from "../teams.js";
import type * as userDigestSchedule from "../userDigestSchedule.js";
import type * as users from "../users.js";
import type * as watchTargets from "../watchTargets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  chat: typeof chat;
  crons: typeof crons;
  crossTargetGraph: typeof crossTargetGraph;
  digestGenerate: typeof digestGenerate;
  digestItems: typeof digestItems;
  digestRuns: typeof digestRuns;
  digests: typeof digests;
  email: typeof email;
  feedbackForScan: typeof feedbackForScan;
  "lib/auth": typeof lib_auth;
  "lib/crossTargetLinks": typeof lib_crossTargetLinks;
  "lib/digestHelpers": typeof lib_digestHelpers;
  "lib/digestWorkflowAssignee": typeof lib_digestWorkflowAssignee;
  "lib/formatters": typeof lib_formatters;
  "lib/slack_builder": typeof lib_slack_builder;
  "lib/sourceIds": typeof lib_sourceIds;
  "lib/types": typeof lib_types;
  pageContentCache: typeof pageContentCache;
  rawItems: typeof rawItems;
  scanSchedule: typeof scanSchedule;
  scans: typeof scans;
  settings: typeof settings;
  slack: typeof slack;
  sourceLinkFeedback: typeof sourceLinkFeedback;
  "sources/clinicaltrials": typeof sources_clinicaltrials;
  "sources/edgar": typeof sources_edgar;
  "sources/exa": typeof sources_exa;
  "sources/openfda": typeof sources_openfda;
  "sources/patents": typeof sources_patents;
  "sources/pubmed": typeof sources_pubmed;
  "sources/rss": typeof sources_rss;
  targetSubscriptions: typeof targetSubscriptions;
  teams: typeof teams;
  userDigestSchedule: typeof userDigestSchedule;
  users: typeof users;
  watchTargets: typeof watchTargets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
