import { describe, expect, it } from "vitest";
import { deepLinkNext, parsePerformerLink, performerLinkHref, performerLinkStep, requestLinkStep } from "@/lib/map/deep-link";

describe("посилання /?open=… для входу й відгуку", () => {
  it("після входу через Google повертає на те саме посилання", () => {
    expect(deepLinkNext("request:req_ab12")).toBe("/?open=request%3Areq_ab12");
    expect(deepLinkNext("chat:conv_1")).toBe("/?open=chat%3Aconv_1");
  });

  it("запит: чекаємо профіль, без опублікованого профілю ведемо його створювати, з ним відкриваємо запит", () => {
    expect(requestLinkStep({ status: "loading", published: false })).toBe(
      "wait",
    );
    expect(requestLinkStep({ status: "ready", published: false })).toBe(
      "create-profile",
    );
    expect(requestLinkStep({ status: "ready", published: true })).toBe("open");
  });
});

describe("посилання performer:<id> зі сторінки профілю", () => {
  it("будує адресу й розбирає її назад", () => {
    expect(performerLinkHref("me-user_1")).toBe("/?open=performer%3Ame-user_1");
    expect(parsePerformerLink("me-user_1")).toBe("me-user_1");
  });

  it("чужі й порожні значення відкидає", () => {
    expect(parsePerformerLink("")).toBeNull();
    expect(parsePerformerLink("user_1")).toBeNull();
    expect(parsePerformerLink("me-")).toBeNull();
    expect(parsePerformerLink("me-a/../b")).toBeNull();
  });

  it("чекає запити, з відкритим пропонує угоду, без нього поле запиту", () => {
    expect(performerLinkStep({ requests: null })).toBe("wait");
    expect(performerLinkStep({ requests: [] })).toBe("compose");
    expect(performerLinkStep({ requests: [{ status: "closed" }] })).toBe("compose");
    expect(performerLinkStep({ requests: [{ status: "open" }] })).toBe("deal");
  });
});
