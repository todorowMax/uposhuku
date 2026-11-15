import { describe, expect, it } from "vitest";
import { attentionCount, inboxLabel, isUnread } from "@/lib/chat/unread";

const item = (over: { unread?: number; unreadDeal?: boolean; needsMe?: boolean }) => ({ unread: over.unread ?? 0, unreadDeal: over.unreadDeal ?? false, ...(over.needsMe === undefined ? {} : { deal: { label: "Угода в роботі", needsMe: over.needsMe } }) });

describe("підпис кнопки «Повідомлення»", () => {
  it("без числа, коли непрочитаного немає", () => {
    expect(inboxLabel(0)).toBe("Повідомлення");
  });

  it("правильне закінчення за українським множинним числом", () => {
    expect(inboxLabel(1)).toBe("Повідомлення: 1 непрочитана");
    expect(inboxLabel(2)).toBe("Повідомлення: 2 непрочитані");
    expect(inboxLabel(4)).toBe("Повідомлення: 4 непрочитані");
    expect(inboxLabel(5)).toBe("Повідомлення: 5 непрочитаних");
    expect(inboxLabel(11)).toBe("Повідомлення: 11 непрочитаних");
    expect(inboxLabel(21)).toBe("Повідомлення: 21 непрочитана");
  });
});

describe("бейдж: непрочитані й ті, де чекають моєї дії", () => {
  it("рядок непрочитаний за текстом чи за подією угоди", () => {
    expect(isUnread(item({}))).toBe(false);
    expect(isUnread(item({ unread: 1 }))).toBe(true);
    expect(isUnread(item({ unreadDeal: true }))).toBe(true);
  });

  it("рахує розмови, а не повідомлення; стара розмова з угодою, що чекає на мене, теж входить", () => {
    const list = [item({ unread: 7 }), item({ unreadDeal: true, needsMe: true }), item({ needsMe: true }), item({ needsMe: false }), item({})];
    expect(attentionCount(list)).toBe(3);
    expect(attentionCount([item({})])).toBe(0);
  });
});
