import { NextResponse } from "next/server";

type TriggerRequest = {
  period?: "daily" | "weekly";
};

export async function POST(req: Request) {
  const body = (await req.json()) as TriggerRequest;
  const period = body.period ?? "daily";

  return NextResponse.json({
    ok: true,
    period,
    message: "Manual trigger endpoint scaffolded. Convex schedule hook pending.",
  });
}
