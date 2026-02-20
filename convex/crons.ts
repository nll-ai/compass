import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check user-configured schedule every 15 minutes; triggers daily/weekly when due
crons.interval("check-scan-schedule", { minutes: 15 }, internal.scanSchedule.checkAndTrigger);

export default crons;
