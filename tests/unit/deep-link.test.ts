import { describe, expect, it } from "vitest";
import { deepLinkNext, requestLinkStep } from "@/lib/map/deep-link";

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
