import { NextResponse } from "next/server";

type ChatRequest = {
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  sessionId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequest;
  const messageCount = Array.isArray(body.messages) ? body.messages.length : 0;

  return NextResponse.json({
    ok: true,
    sessionId: body.sessionId ?? null,
    message: "Chat endpoint scaffolded. Tool-backed streaming will be wired in a follow-up slice.",
    messageCount,
  });
}
