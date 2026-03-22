import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check user-configured schedule every minute; triggers daily/weekly at the exact scheduled minute
crons.interval("check-scan-schedule", { minutes: 1 }, internal.scanSchedule.checkAndTrigger);

// Mark scan runs stuck in pending/running after thresholds (see convex/scans.ts STALE_* constants)
crons.interval("reconcile-stale-scans", { minutes: 15 }, internal.scans.reconcileStaleScanRuns);

export default crons;
