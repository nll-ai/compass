import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check user-configured schedule every minute; triggers daily/weekly at the exact scheduled minute
crons.interval("check-scan-schedule", { minutes: 1 }, internal.scanSchedule.checkAndTrigger);

export default crons;
