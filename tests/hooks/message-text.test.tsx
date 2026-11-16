import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MessageText } from "@/components/chat/inbox/parts/message-text";

afterEach(cleanup);

describe("MessageText", () => {
  it("посилання стає <a> з новою вкладкою й rel без opener, пунктуація лишається текстом", () => {
    const { container } = render(<MessageText text="Дивіться https://example.com/a, дякую." />);
    const link = screen.getByRole("link", { name: "https://example.com/a" });
    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")?.split(" ").sort()).toEqual(["nofollow", "noopener", "noreferrer"]);
    expect(container.textContent).toBe("Дивіться https://example.com/a, дякую.");
  });

  it("javascript: і розмітка лишаються текстом: жодного посилання й жодного вставленого елемента", () => {
    const { container } = render(<MessageText text={"javascript:alert(1) <img src=x onerror=alert(1)> <script>alert(2)</script>"} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("img, script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(2)</script>");
  });
});
