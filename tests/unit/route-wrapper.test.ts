import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { SessionUser } from "@/lib/auth/types";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  admin: null as { id: string } | null,
  limited: false,
  logged: [] as unknown[],
}));

vi.mock("@/lib/server/auth", () => ({
  getSessionUser: async () => state.user,
  AuthError: class AuthError extends Error {
    status = 401;
    title = "t";
    detail = "d";
    type = "about:blank";
  },
}));
vi.mock("@/lib/server/admin", () => ({ getAdmin: async () => state.admin }));
vi.mock("@/lib/server/rate-limit", () => ({
  rateLimited: async () => (state.limited ? new Response(null, { status: 429 }) : null),
}));
vi.mock("@/lib/telemetry/log", () => ({
  logServerError: (error: unknown) => state.logged.push(error),
  logServer: vi.fn(),
  serverEvent: vi.fn(),
}));

import { route } from "@/lib/server/route";

const post = (body: string) => new Request("https://x.test/api", { method: "POST", body });

beforeEach(() => {
  state.user = null;
  state.admin = null;
  state.limited = false;
  state.logged = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("route()", () => {
  it("без сесії: 401 problem+json, обробник не викликається", async () => {
    const handler = vi.fn(() => Response.json({ ok: true }));
    const response = await route({ auth: "user" }, handler)(new Request("https://x.test/api"));
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(handler).not.toHaveBeenCalled();
  });

  it("власна відповідь 401", async () => {
    const response = await route({ auth: "user", unauthorized: () => Response.json({ detail: "x" }, { status: 401 }) }, () => Response.json({}))(new Request("https://x.test/api"));
    expect(await response.json()).toEqual({ detail: "x" });
  });

  it("адмін: не адміністратор бачить 404", async () => {
    state.user = { id: "u1" };
    const response = await route({ auth: "admin" }, () => Response.json({}))(new Request("https://x.test/api"));
    expect(response.status).toBe(404);
  });

  it("передає користувача в обробник", async () => {
    state.user = { id: "u1" };
    const response = await route({ auth: "user" }, ({ user }: { user: SessionUser }) => Response.json({ id: user.id }))(new Request("https://x.test/api"));
    expect(await response.json()).toEqual({ id: "u1" });
  });

  it("ліміт частоти: 429 без виклику обробника", async () => {
    state.user = { id: "u1" };
    state.limited = true;
    const handler = vi.fn(() => Response.json({}));
    const response = await route({ auth: "user", rate: "message" }, handler)(new Request("https://x.test/api"));
    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });

  it("зламане тіло: 400 зі списком полів", async () => {
    const schema = z.object({ name: z.string().min(2) });
    const handler = vi.fn(() => Response.json({}));
    const wrapped = route({ body: schema }, handler);
    const bad = await wrapped(post(JSON.stringify({ name: "a" })));
    expect(bad.status).toBe(400);
    const json = (await bad.json()) as { errors: { path: string }[] };
    expect(json.errors[0]?.path).toBe("name");
    const notJson = await wrapped(post("{"));
    expect(notJson.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("добре тіло доходить до обробника", async () => {
    const schema = z.object({ name: z.string() });
    const response = await route({ body: schema }, ({ body }) => Response.json({ name: body.name }))(post(JSON.stringify({ name: "Ава" })));
    expect(await response.json()).toEqual({ name: "Ава" });
  });

  it("params розгортаються", async () => {
    const wrapped = route<"none", undefined, { id: string }>({}, ({ params }) => Response.json({ id: params.id }));
    const response = await wrapped(new Request("https://x.test/api"), { params: Promise.resolve({ id: "d1" }) });
    expect(await response.json()).toEqual({ id: "d1" });
  });

  it("помилка обробника: 500 через failure і запис у журнал", async () => {
    const boom = new Error("boom");
    const response = await route({}, () => {
      throw boom;
    })(new Request("https://x.test/api"));
    expect(response.status).toBe(500);
    expect(state.logged).toEqual([boom]);
  });
});
