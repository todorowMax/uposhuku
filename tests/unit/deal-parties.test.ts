import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => session.user }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn() }));
vi.mock("@/lib/server/realtime", async () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null) }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), serverEvent: vi.fn() }));

import { POST } from "@/app/api/deals/route";
import { emptyProfile } from "@/lib/profile/types";
import { listDeals } from "@/lib/server/deal-repo";
import { saveProfile } from "@/lib/server/profile-repo";
import { createRequest, saveResponse } from "@/lib/server/request-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let requestId = "";
let otherRequestId = "";

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["dp-cust", "dp-perf", "dp-evil", "dp-cust2"]) await makeUser(ctx.db, id);
  const draft = { text: "Потрібен логотип", tags: [], files: [] };
  requestId = (await createRequest("dp-cust", draft)).id;
  otherRequestId = (await createRequest("dp-cust2", draft)).id;
  await saveProfile("dp-perf", { ...emptyProfile("Справжня Юлія"), cityId: "kyiv", specialty: "Дизайнерка", published: true });
  await saveProfile("dp-evil", { ...emptyProfile("Інший"), cityId: "kyiv", specialty: "Хтось", published: true });
  await saveResponse("dp-perf", requestId, { price: 1000, days: 3, message: "Зроблю" });
  await saveResponse("dp-perf", otherRequestId, { price: 1000, days: 3, message: "Зроблю" });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  session.user = { id: "dp-cust", email: "dp-cust@example.com" };
});

const post = (body: Record<string, unknown>) => POST(new Request("https://findlyfy.test/api/deals", { method: "POST", body: JSON.stringify(body) }));
const body = (over: Record<string, unknown> = {}) => ({
  requestId,
  responseId: `resp_${requestId}_dp-perf`,
  performer: { id: "me-dp-perf", name: "Підроблене ім'я", specialty: "Підроблена", avatarIndex: 200, photo: "data:image/jpeg;base64,AAAA" },
  method: "direct",
  stages: [
    { title: "Аванс", amount: 300, days: 2 },
    { title: "Решта", amount: 700, days: 3 },
  ],
  ...over,
});

describe("POST /api/deals: виконавця визначає сервер", () => {
  it("ім'я, спеціальність і фото беруться з профілю, а не з тіла; кілька етапів у прямому переказі проходять", async () => {
    const response = await post(body());
    expect(response.status).toBe(201);
    const { deal } = (await response.json()) as { deal: { performer: { name: string; specialty: string; avatarIndex: number; photo?: string }; stages: unknown[] } };
    expect(deal.performer).toMatchObject({ name: "Справжня Юлія", specialty: "Дизайнерка", avatarIndex: 0 });
    expect(deal.performer.photo).toBeUndefined();
    expect(deal.stages).toHaveLength(2);
  });

  it("чужий виконавець у тілі при відгуку іншого автора: 400, угоди немає", async () => {
    const response = await post(body({ performer: { id: "me-dp-evil", name: "Інший" } }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { detail: string }).detail).toMatch(/не збігається/);
    expect((await listDeals("dp-cust", requestId)).filter((deal) => deal.performer.id === "me-dp-evil")).toHaveLength(0);
  });

  it("відгук з іншого запиту, вигаданий відгук і демо-виконавець відхиляються", async () => {
    expect((await post(body({ responseId: `resp_${otherRequestId}_dp-perf` }))).status).toBe(400);
    expect((await post(body({ responseId: `resp_${requestId}_dp-evil`, performer: { id: "me-dp-evil" } }))).status).toBe(400);
    expect((await post(body({ responseId: `resp_${requestId}_demo-12`, performer: { id: "demo-12" } }))).status).toBe(400);
    expect((await post(body({ requestId: otherRequestId }))).status).toBe(404);
  });

  it("угода із самим собою: замовник відгукнувся на власний запит", async () => {
    session.user = { id: "dp-cust2", email: "dp-cust2@example.com" };
    await saveProfile("dp-cust2", { ...emptyProfile("Сам"), cityId: "kyiv", specialty: "X", published: true });
    await saveResponse("dp-cust2", otherRequestId, { price: 1, days: 1, message: "Я" });
    const response = await post(body({ requestId: otherRequestId, responseId: `resp_${otherRequestId}_dp-cust2`, performer: { id: "me-dp-cust2" } }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { detail: string }).detail).toMatch(/З собою/);
  });
});
