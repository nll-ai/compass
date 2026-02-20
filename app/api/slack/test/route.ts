import { NextResponse } from "next/server";

type SlackTestRequest = {
  webhookUrl?: string;
  channel?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as SlackTestRequest;
  if (!body.webhookUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing webhookUrl in request body." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    channel: body.channel ?? null,
    message: "Slack test endpoint scaffolded. Live webhook post will be added next.",
  });
}
