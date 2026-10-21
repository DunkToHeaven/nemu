import { type NextRequest, NextResponse } from "next/server";
import { buildRequest, handleRequest } from "@/mocks/api";
import { sim } from "@/mocks/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function dispatch(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const state = sim();
  if (state.offline) {
    return NextResponse.json(
      { error: { code: "OFFLINE", message: "Koneksi terputus. Periksa sinyal lalu coba lagi." } },
      { status: 503 },
    );
  }

  if (state.latencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, state.latencyMs));
  }

  let body: unknown = null;
  if (request.method !== "GET" && request.method !== "DELETE") {
    try {
      body = await request.json();
    } catch {
      body = null;
    }
  }

  const req = buildRequest({
    method: request.method,
    url: `http://nemu.local/api/v1/${segments.join("/")}${request.nextUrl.search}`,
    body,
    cookie: request.headers.get("cookie") ?? undefined,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1",
  });

  const result = await handleRequest(req);
  const response = NextResponse.json(result.body, { status: result.status });
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) response.headers.set(key, value);
  }
  return response;
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return dispatch(request, path);
}

export async function POST(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return dispatch(request, path);
}

export async function PATCH(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return dispatch(request, path);
}

export async function DELETE(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return dispatch(request, path);
}
