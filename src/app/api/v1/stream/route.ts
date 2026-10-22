import type { LiveEvent } from "@/lib/types";
import { decodeSession } from "@/mocks/session";
import { sessionFromToken, sim, subscribe } from "@/mocks/store";
import { getSessionById } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenFromCookie(header: string | null): string | undefined {
  if (!header) return undefined;
  const raw = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("nemu_session="))
    ?.slice("nemu_session=".length);
  return decodeSession(raw)?.token ?? raw;
}

/**
 * Apakah permintaan ini punya sesi sah?
 *
 * Ada dua mode:
 *  - mock: cookie berisi payload base64 yang bisa dibaca langsung
 *  - database: cookie hanya id sesi acak; harus diverifikasi ke Postgres
 *
 * Sebelumnya fungsi ini HANYA memeriksa store mock, sehingga pada mode database
 * setiap koneksi SSE dibalas 401. Akibatnya badge status di UI selalu
 * menampilkan "Offline" padahal jaringan normal — keluhan yang muncul setelah
 * backend dipindah ke PostgreSQL.
 */
async function isAuthorized(request: Request): Promise<boolean> {
  const token = tokenFromCookie(request.headers.get("cookie"));
  if (!token) return false;

  if (process.env.DATABASE_ENABLED === "true") {
    const session = await getSessionById(token);
    return Boolean(session);
  }
  return Boolean(sessionFromToken(token));
}

/** SSE tiruan: event berasal dari event bus in-memory, bukan Postgres LISTEN/NOTIFY. */
export async function GET(request: Request): Promise<Response> {
  if (!(await isAuthorized(request))) {
    return new Response("unauthorized", { status: 401 });
  }
  if (sim().offline) {
    return new Response("offline", { status: 503 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: LiveEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        } catch {
          closed = true;
        }
      };

      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      // Padding 2 KB: proxy (Cloudflare, nginx) menahan respons sampai buffer
      // penuh. Tanpa ini stream terbuka tetapi event `ready` tidak pernah
      // sampai ke browser, sehingga badge status berputar selamanya.
      controller.enqueue(encoder.encode(`: ${" ".repeat(2048)}\n\n`));
      controller.enqueue(encoder.encode('event: ready\ndata: {"ok":true}\n\n'));

      unsubscribe = subscribe(send);
      heartbeat = setInterval(() => {
        if (closed) return;
        if (sim().offline) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* sudah tertutup */
        }
      });
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
