import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DealRow } from "@/components/chat/inbox/parts/deal-row";

afterEach(cleanup);

const props = { ready: true, deals: [], role: "customer" as const, response: undefined, panelOpen: false, onOpen: vi.fn(), openRef: null };

describe("DealRow: співрозмовник видалив акаунт", () => {
  it("замість «Оформити умови» текст без кнопки", () => {
    render(<DealRow {...props} gone />);
    expect(screen.queryByRole("button", { name: "Оформити умови" })).toBeNull();
    expect(screen.getByText(/співрозмовник видалив акаунт/)).toBeTruthy();
  });

  it("без видалення кнопка є й відкриває шар", () => {
    render(<DealRow {...props} />);
    expect(screen.getByRole("button", { name: "Оформити умови" })).toBeTruthy();
  });
});
