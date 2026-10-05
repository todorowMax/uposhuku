// worker/realtime.ts
//
// Durable Object «кімната»: тримає WebSocket-з'єднання й розсилає їм події.
// Кімнат кілька: `user:<id>` (особисті події: нове повідомлення, угода, відгук
// на мій запит) і `global` (публічні: з'явився запит, змінилась карта). Працює в
// режимі hibernation: поки сокети мовчать, об'єкт спить, і за тишу не платимо;
// пінги від клієнта відповідає сама платформа, не будячи його.
//
// У кімнаті користувача DO ще веде присутність (онлайн/офлайн у D1) і пересилає
// «друкує» співрозмовнику: сокет мовчить, крім пульсу раз на хвилину й подій набору.

import { DurableObject } from "cloudflare:workers";
import { ONLINE_TTL, markPresence } from "../lib/server/presence-sql";

interface Attachment {
  userId: string;
}

/** Не частіше однієї події «друкує» на секунду з одного користувача. */
const TYPING_GAP = 1000;

export class Realtime extends DurableObject<CloudflareEnv> {
  private lastTyping = 0;

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
      // Хто за сокетом, каже наш вхід (worker/index.ts) після перевірки сесії.
      const userId = request.headers.get("x-rt-user");
      if (userId) {
        pair[1].serializeAttachment({ userId } satisfies Attachment);
        await this.setOnline(userId, true);
      }
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return new Response("Потрібен WebSocket", { status: 426 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> | void {
    const who = socket.deserializeAttachment() as Attachment | null;
    if (!who || typeof message !== "string") return;
    let data: { t?: string; c?: string };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    if (data.t === "hb") return this.setOnline(who.userId, true);
    if (data.t === "typing" && typeof data.c === "string") return this.relayTyping(who.userId, data.c);
  }

  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    try {
      socket.close(code === 1005 ? 1000 : code);
    } catch {
      // Уже закрито.
    }
    await this.afterDisconnect(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.afterDisconnect(socket);
  }

  /** Остання вкладка закрита: людина офлайн. */
  private async afterDisconnect(socket: WebSocket): Promise<void> {
    const who = socket.deserializeAttachment() as Attachment | null;
    if (!who) return;
    const left = this.ctx.getWebSockets().filter((other) => other !== socket);
    if (left.length === 0) await this.setOnline(who.userId, false);
  }

  /** Пише присутність у D1 і, якщо вона змінилась, сповіщає карту. */
  private async setOnline(userId: string, online: boolean): Promise<void> {
    try {
      const was = (await this.env.DB.prepare("select online, last_seen from presence where user_id = ?").bind(userId).first<{ online: number; last_seen: number }>()) ?? null;
      await markPresence(this.env.DB, userId, online);
      const changed = !was || Boolean(was.online) !== online || (online && Date.now() - was.last_seen > ONLINE_TTL);
      if (changed) await this.push("global", '{"t":"presence"}');
    } catch (error) {
      console.warn("presence не записано", error);
    }
  }

  /** «Друкує» іде лише другій стороні тієї самої розмови. */
  private async relayTyping(userId: string, conversationId: string): Promise<void> {
    const now = Date.now();
    if (now - this.lastTyping < TYPING_GAP) return;
    this.lastTyping = now;
    try {
      const row = await this.env.DB.prepare("select customer_user_id, performer_user_id from conversations where id = ?").bind(conversationId).first<{ customer_user_id: string; performer_user_id: string | null }>();
      if (!row) return;
      const other = row.customer_user_id === userId ? row.performer_user_id : row.performer_user_id === userId ? row.customer_user_id : null;
      if (other) await this.push(`user:${other}`, JSON.stringify({ t: "typing", conversationId }));
    } catch (error) {
      console.warn("typing не передано", error);
    }
  }

  private async push(room: string, body: string): Promise<void> {
    await this.env.REALTIME.get(this.env.REALTIME.idFromName(room)).fetch("https://realtime/push", { method: "POST", body });
  }
}
