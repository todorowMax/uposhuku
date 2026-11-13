import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";
import { getOrCreateConversation } from "@/lib/server/chat-repo";
import { proposeDeal } from "@/lib/server/deal-repo";
import { createRequest } from "@/lib/server/request-repo";
import { addReview } from "@/lib/server/review-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["id1", "id2"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});

describe("ідентифікатори нових сутностей", () => {
  it("newId: префікс і рівно 16 hex, значення різні", () => {
    const sample = Array.from({ length: 200 }, () => newId("deal"));
    for (const id of sample) expect(id).toMatch(/^deal_[0-9a-f]{16}$/);
    expect(new Set(sample).size).toBe(sample.length);
  });

  it("запит, розмова, угода й відгук отримують id з 16 hex", async () => {
    const request = await createRequest("id1", { text: "Потрібен логотип", tags: [], files: [] });
    expect(request.id).toMatch(/^req_[0-9a-f]{16}$/);

    const conversation = await getOrCreateConversation("id1", "me-id2", "id2");
    expect(conversation.id).toMatch(/^conv_[0-9a-f]{16}$/);

    const deal = await proposeDeal("id1", { requestId: request.id, responseId: "resp_id", method: "direct", performer: { id: "me-id2", name: "Виконавець", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Все", amount: 500, days: 2 }] }, { safeEnabled: true });
    expect(typeof deal).toBe("object");
    const dealId = (deal as { id: string; number: string }).id;
    expect(dealId).toMatch(/^deal_[0-9a-f]{16}$/);
    // Номер для призначення платежу береться з кінця id й лишається короткою міткою з 4 символів.
    expect((deal as { number: string }).number).toMatch(/^#[0-9A-F]{4}$/);

    const review = await addReview("id1", { performerId: "me-id2", dealId, stars: 5, text: "Добре", author: "Замовник" });
    expect(review.id).toMatch(/^rev_[0-9a-f]{16}$/);
  });

  it("старі короткі id продовжують жити: їх ніхто не перераховує і довжиною не розбирає", async () => {
    // Рядок зі старим 8-символьним id лишається в базі й читається як є.
    await ctx.db.prepare("insert into conversations (id, customer_user_id, performer_id, performer_user_id, created_at, updated_at) values ('conv_1a2b3c4d', 'id2', 'me-id1', 'id1', 1, 1)").run();
    const conversation = await getOrCreateConversation("id2", "me-id1", "id1");
    expect(conversation.id).toBe("conv_1a2b3c4d");
  });
});
