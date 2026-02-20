import type { SourceResult, ScanOptions } from "../types";

export async function runOpenFda(
  _targets?: unknown,
  _env?: Record<string, string | undefined>,
  _options?: ScanOptions
): Promise<SourceResult> {
  return { items: [] };
}
