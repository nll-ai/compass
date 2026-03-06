export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function formatSchedule(schedule: {
  timezone: string;
  dailyEnabled: boolean;
  dailyHour: number;
  dailyMinute: number;
  weeklyEnabled: boolean;
  weeklyDayOfWeek: number;
  weeklyHour: number;
  weeklyMinute: number;
  weekdaysOnly?: boolean;
  rawDescription?: string;
}): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const parts: string[] = [];
  if (schedule.dailyEnabled) {
    const time = `${schedule.dailyHour}:${pad(schedule.dailyMinute)}`;
    parts.push(schedule.weekdaysOnly ? `Weekdays at ${time}` : `Daily at ${time}`);
  }
  if (schedule.weeklyEnabled) {
    const time = `${schedule.weeklyHour}:${pad(schedule.weeklyMinute)}`;
    parts.push(`${dayNames[schedule.weeklyDayOfWeek]} at ${time}`);
  }
  if (parts.length === 0) return "No automatic scans scheduled.";
  return parts.join(". ") + ` (${schedule.timezone})`;
}
