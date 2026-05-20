"use client";

import Link from "next/link";
import {
  RECENCY_RANGE_OPTIONS,
  rangeParamFromLookbackDays,
} from "@/lib/sourceLinksRecencyUi";

type SourceLinksRecencyBarProps = {
  /** Pathname only, no query (e.g. `/targets/abc/timeline`). */
  basePath: string;
  /** Extra fixed query keys (e.g. timeline `focus`). */
  extraParams?: Record<string, string>;
  /** Current selection as Convex `lookbackDays` (**0** = all time). */
  lookbackDays: number;
};

/**
 * URL-driven recency control for Source Links and Timeline (segmented pills, same family as focus bar).
 */
export function SourceLinksRecencyBar({ basePath, extraParams = {}, lookbackDays }: SourceLinksRecencyBarProps) {
  const hrefFor = (param: string): string => {
    const q = new URLSearchParams({ ...extraParams, range: param });
    return `${basePath}?${q.toString()}`;
  };
  const currentParam = rangeParamFromLookbackDays(lookbackDays);

  return (
    <div className="focus-bar" role="tablist" aria-label="Recency filter">
      {RECENCY_RANGE_OPTIONS.map((opt) => (
        <Link
          key={opt.param}
          href={hrefFor(opt.param)}
          className="focus-pill"
          data-active={opt.param === currentParam}
          role="tab"
          aria-selected={opt.param === currentParam}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
