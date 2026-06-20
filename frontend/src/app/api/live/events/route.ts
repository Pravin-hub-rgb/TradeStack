import { NextRequest } from "next/server";

const clients = new Set<(data: string) => void>();

export function subscribeClient(write: (data: string) => void): () => void {
  clients.add(write);
  return () => { clients.delete(write); };
}

export function broadcast(data: string): void {
  for (const write of clients) {
    try { write(data); } catch { clients.delete(write); }
  }
}

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const write = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch { /* client disconnected */ }
      };
      const unsubscribe = subscribeClient(write);
      controller.enqueue(encoder.encode(`data: {"type":"connected"}\n\n`));
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
