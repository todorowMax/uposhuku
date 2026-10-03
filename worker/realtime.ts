// worker/realtime.ts
//
// Durable Object «кімната»: тримає WebSocket-з'єднання й розсилає їм події.
// Кімнат кілька: `user:<id>` (особисті події: нове повідомлення, угода, відгук
// на мій запит) і `global` (публічні: з'явився запит, змінилась карта). Працює в
// режимі hibernation: поки сокети мовчать, об'єкт спить, і за тишу не платимо;
// пінги від клієнта відповідає сама платформа, не будячи його.

import { DurableObject } from "cloudflare:workers";

export class Realtime extends DurableObject<CloudflareEnv> {
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Подія від нашого сервера (lib/server/realtime.ts): розсилаємо всім у кімнаті.
    if (request.method === "POST" && url.pathname === "/push") {
      const body = await request.text();
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(body);
        } catch {
          // Мертвий сокет платформа прибере сама.
        }
      }
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return new Response("Потрібен WebSocket", { status: 426 });
  }

  /** Клієнт нічого не шле, окрім пінгів, які обробляє платформа. */
  webSocketMessage(): void {}

  webSocketClose(socket: WebSocket, code: number): void {
    try {
      socket.close(code === 1005 ? 1000 : code);
    } catch {
      // Уже закрито.
    }
  }
}
