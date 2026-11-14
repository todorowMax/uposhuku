import { describe, expect, it } from "vitest";
import { proposeTaskLabel, proposeWorkAction } from "@/lib/requests/propose-work";

const open = { status: "open" as const };
const closed = { status: "closed" as const };

describe("«Запропонувати роботу» на картці виконавця", () => {
  it("є відкритий запит: одразу пропонуємо угоду цьому виконавцю", () => {
    expect(proposeWorkAction({ signedIn: true, requests: [closed, open] })).toBe("deal");
  });

  it("немає відкритих запитів: розгортаємо поле запиту", () => {
    expect(proposeWorkAction({ signedIn: true, requests: [] })).toBe("compose");
    expect(proposeWorkAction({ signedIn: true, requests: [closed] })).toBe("compose");
    expect(proposeWorkAction({ signedIn: true, requests: null })).toBe("compose");
  });

  it("гість завжди йде в поле запиту (вхід почнеться при відправці)", () => {
    expect(proposeWorkAction({ signedIn: false, requests: [open] })).toBe("compose");
  });

  it("підказка поля: опишіть задачу й запропонуйте її після публікації, без обіцянки привʼязки до виконавця", () => {
    expect(proposeTaskLabel("Данило Савченко")).toBe("Опишіть задачу. Після публікації запропонуйте її: Данило Савченко");
    expect(proposeTaskLabel("Данило Савченко")).not.toMatch(/^Задача для/);
  });
});
