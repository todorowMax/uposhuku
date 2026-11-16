import { describe, expect, it } from "vitest";
import { encodeCursor, parseCursor } from "@/lib/chat/cursor";

describe("курсор «показати раніше»", () => {
  it("кодує час у мілісекундах і id, а розбір повертає те саме", () => {
    const cursor = encodeCursor({ id: "msg_ab12", at: "2026-11-16T10:00:00.123Z" });
    expect(cursor).toBe(`${Date.parse("2026-11-16T10:00:00.123Z")}:msg_ab12`);
    expect(parseCursor(cursor)).toEqual({ at: Date.parse("2026-11-16T10:00:00.123Z"), id: "msg_ab12" });
  });

  it("усе, що не схоже на <мс>:<id>, дає null", () => {
    for (const bad of [null, "", "abc", "123", "x:y", ":id", "12:", "12:a b", "-5:id", "1.5:id", `1:${"a".repeat(65)}`]) expect(parseCursor(bad)).toBeNull();
  });
});
