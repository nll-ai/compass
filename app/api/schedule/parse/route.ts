import { NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const ScheduleSchema = z.object({
  dailyEnabled: z.boolean().describe("True if user wants a daily scan"),
  dailyHour: z.number().min(0).max(23).describe("Hour in 24h format (0-23)"),
  dailyMinute: z.number().min(0).max(59).describe("Minute (0-59)"),
  weeklyEnabled: z.boolean().describe("True if user wants a weekly scan"),
  weeklyDayOfWeek: z
    .number()
    .min(0)
    .max(6)
    .describe("0=Sunday, 1=Monday, ... 6=Saturday"),
  weeklyHour: z.number().min(0).max(23),
  weeklyMinute: z.number().min(0).max(59),
  weekdaysOnly: z
    .boolean()
    .optional()
    .describe("If true, daily run only on Mon-Fri"),
});

export type ParsedSchedule = z.infer<typeof ScheduleSchema>;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { description: string; timezone?: string };
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    if (!description) {
      return NextResponse.json(
        { error: "Missing or empty description" },
        { status: 400 }
      );
    }
    const timezone = typeof body.timezone === "string" ? body.timezone : "UTC";

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: ScheduleSchema,
      prompt: `Parse the user's schedule description into structured fields. Use 24-hour time. Default to daily at 9:00 if they say "every day" or "daily". Default to weekly on Monday at 9:00 if they say "weekly" or "every week". Infer weekdaysOnly when they say "weekdays", "business days", "Mon-Fri", etc. Only set one of dailyEnabled or weeklyEnabled to true unless they explicitly ask for both.

User description: "${description}"
Interpret times in timezone: ${timezone}

Return the schedule object.`,
    });

    return NextResponse.json({
      ok: true,
      timezone,
      rawDescription: description,
      ...object,
    });
  } catch (e) {
    console.error("schedule/parse error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Parse failed" },
      { status: 500 }
    );
  }
}
