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
import type * as digestItems from "../digestItems.js";
import type * as digestRuns from "../digestRuns.js";
import type * as digests from "../digests.js";
import type * as lib_formatters from "../lib/formatters.js";
import type * as lib_slack_builder from "../lib/slack_builder.js";
import type * as lib_types from "../lib/types.js";
import type * as rawItems from "../rawItems.js";
import type * as scans from "../scans.js";
import type * as settings from "../settings.js";
import type * as slack from "../slack.js";
import type * as sources_clinicaltrials from "../sources/clinicaltrials.js";
import type * as sources_edgar from "../sources/edgar.js";
import type * as sources_exa from "../sources/exa.js";
import type * as sources_openfda from "../sources/openfda.js";
import type * as sources_patents from "../sources/patents.js";
import type * as sources_pubmed from "../sources/pubmed.js";
import type * as sources_rss from "../sources/rss.js";
import type * as watchTargets from "../watchTargets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  chat: typeof chat;
  crons: typeof crons;
  digestItems: typeof digestItems;
  digestRuns: typeof digestRuns;
  digests: typeof digests;
  "lib/formatters": typeof lib_formatters;
  "lib/slack_builder": typeof lib_slack_builder;
  "lib/types": typeof lib_types;
  rawItems: typeof rawItems;
  scans: typeof scans;
  settings: typeof settings;
  slack: typeof slack;
  "sources/clinicaltrials": typeof sources_clinicaltrials;
  "sources/edgar": typeof sources_edgar;
  "sources/exa": typeof sources_exa;
  "sources/openfda": typeof sources_openfda;
  "sources/patents": typeof sources_patents;
  "sources/pubmed": typeof sources_pubmed;
  "sources/rss": typeof sources_rss;
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
