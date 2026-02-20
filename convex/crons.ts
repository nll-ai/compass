import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("daily-scan", { hourUTC: 8, minuteUTC: 0 }, internal.scans.scheduleScan, { period: "daily" });
crons.weekly("weekly-scan", { dayOfWeek: "monday", hourUTC: 8, minuteUTC: 0 }, internal.scans.scheduleScan, { period: "weekly" });

export default crons;
