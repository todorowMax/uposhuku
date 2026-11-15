import { describe, expect, it } from "vitest";
import { attentionCount, inboxLabel, isUnread } from "@/lib/chat/unread";

const item = (over: { unread?: number; unreadDeal?: boolean; needsMe?: boolean }) => ({ unread: over.unread ?? 0, unreadDeal: over.unreadDeal ?? false, ...(over.needsMe === undefined ? {} : { deal: { label: "Угода в роботі", needsMe: over.needsMe } }) });

const many = (count: number, over: Parameters<typeof item>[0]) => Array.from({ length: count }, () => item(over));

describe("підпис кнопки «Повідомлення»", () => {
  it("без числа, коли нічого не чекає", () => {
    expect(inboxLabel([])).toBe("Повідомлення");
    expect(inboxLabel([item({}), item({ needsMe: false })])).toBe("Повідомлення");
  });

  it("непрочитані розмови: закінчення за українським множинним числом", () => {
    expect(inboxLabel(many(1, { unread: 3 }))).toBe("Повідомлення: 1 непрочитана");
    expect(inboxLabel(many(2, { unread: 1 }))).toBe("Повідомлення: 2 непрочитані");
    expect(inboxLabel(many(4, { unreadDeal: true, needsMe: true }))).toBe("Повідомлення: 4 непрочитані");
    expect(inboxLabel(many(5, { unread: 1 }))).toBe("Повідомлення: 5 непрочитаних");
    expect(inboxLabel(many(11, { unread: 1 }))).toBe("Повідомлення: 11 непрочитаних");
    expect(inboxLabel(many(21, { unread: 1 }))).toBe("Повідомлення: 21 непрочитана");
  });

  it("прочитана розмова, де угода чекає моєї дії, не називається непрочитаною", () => {
    expect(inboxLabel(many(1, { needsMe: true }))).toBe("Повідомлення: 1 розмова чекає вашої дії");
    expect(inboxLabel(many(2, { needsMe: true }))).toBe("Повідомлення: 2 розмови чекають вашої дії");
    expect(inboxLabel(many(5, { needsMe: true }))).toBe("Повідомлення: 5 розмов чекають вашої дії");
  });

  it("обидва види разом, кожна розмова рахується один раз", () => {
    const list = [item({ unread: 2 }), item({ unreadDeal: true, needsMe: true }), item({ needsMe: true }), item({})];
    expect(inboxLabel(list)).toBe("Повідомлення: 2 непрочитані, 1 розмова чекає вашої дії");
    expect(attentionCount(list)).toBe(3);
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
