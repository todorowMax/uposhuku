import { describe, expect, it } from "vitest";
import { splitLinks } from "@/lib/chat/links";

const links = (text: string) => splitLinks(text).filter((part) => part.type === "link");
const joined = (text: string) => splitLinks(text).map((part) => part.text).join("");

describe("splitLinks: що стає посиланням", () => {
  it("текст без посилань лишається одним шматком", () => {
    expect(splitLinks("Привіт, як справи?")).toEqual([{ type: "text", text: "Привіт, як справи?" }]);
    expect(splitLinks("")).toEqual([]);
  });

  it("http і https у середині тексту: шматки до, посилання, шматок після", () => {
    expect(splitLinks("Дивіться https://example.com/a?b=1#c ось тут")).toEqual([
      { type: "text", text: "Дивіться " },
      { type: "link", text: "https://example.com/a?b=1#c", href: "https://example.com/a?b=1#c" },
      { type: "text", text: " ось тут" },
    ]);
    expect(links("http://example.com")).toEqual([{ type: "link", text: "http://example.com", href: "http://example.com/" }]);
  });

  it("www. без схеми веде на https", () => {
    expect(links("пишіть на www.example.com/shop")).toEqual([{ type: "link", text: "www.example.com/shop", href: "https://www.example.com/shop" }]);
  });

  it("кілька посилань і текст між ними не губляться", () => {
    const text = "а https://a.example і https://b.example/x, готово";
    expect(links(text).map((part) => part.text)).toEqual(["https://a.example", "https://b.example/x"]);
    expect(joined(text)).toBe(text);
  });

  it("великі літери схеми", () => {
    expect(links("HTTPS://Example.com/Path")).toHaveLength(1);
  });
});

describe("splitLinks: безпека", () => {
  it("javascript:, data:, ftp:, mailto: не стають посиланнями", () => {
    for (const text of ["javascript:alert(1)", "data:text/html,<script>1</script>", "ftp://example.com/x", "mailto:a@b.com", "vbscript:x", "file:///etc/passwd", "//example.com"]) {
      expect(links(text)).toEqual([]);
    }
  });

  it("схема, схована в посиланні, не обходить перевірку: javascript у шляху лишається частиною https-адреси", () => {
    const [link] = links("https://example.com/?next=javascript:alert(1)");
    expect(link).toMatchObject({ type: "link" });
    expect(link.type === "link" && link.href.startsWith("https://example.com/")).toBe(true);
  });

  it("адреса з логіном і паролем (https://bank.com@evil.test) не клікається", () => {
    expect(links("https://bank.com@evil.test/login")).toEqual([]);
    expect(links("https://user:pass@example.com")).toEqual([]);
  });

  it("порожня адреса, слово перед схемою й дірки в хості не клікаються", () => {
    expect(links("https://")).toEqual([]);
    expect(links("xhttps://example.com")).toEqual([]);
    expect(links("https://example..com")).toEqual([]);
    expect(links("www..")).toEqual([]);
  });

  it("розмітка в тексті лишається текстом: <, > і лапка в кінці не потрапляють у посилання", () => {
    const parts = splitLinks('<a href="https://example.com">x</a> https://example.com/a<b');
    expect(parts.filter((part) => part.type === "link").map((part) => part.text)).toEqual(["https://example.com", "https://example.com/a"]);
    expect(joined('<a href="https://example.com">x</a> https://example.com/a<b')).toBe('<a href="https://example.com">x</a> https://example.com/a<b');
  });
});

describe("splitLinks: хвостова пунктуація", () => {
  it("крапка, кома, знаки питання й оклику, двокрапка, лапки не входять у посилання", () => {
    for (const tail of [".", ",", "!", "?", ";", ":", "…", ".)", '".', "»"]) {
      const [link] = links(`ось https://example.com/page${tail}`);
      expect(link).toMatchObject({ text: "https://example.com/page" });
    }
  });

  it("пунктуація після посилання лишається текстом, нічого не губиться", () => {
    expect(splitLinks("Глянь (https://example.com/x), дякую.")).toEqual([
      { type: "text", text: "Глянь (" },
      { type: "link", text: "https://example.com/x", href: "https://example.com/x" },
      { type: "text", text: "), дякую." },
    ]);
  });

  it("дужка з парою в адресі лишається, закривачка без пари відпадає", () => {
    expect(links("https://uk.wikipedia.org/wiki/Foo_(bar)")[0]).toMatchObject({ text: "https://uk.wikipedia.org/wiki/Foo_(bar)" });
    expect(links("(див. https://uk.wikipedia.org/wiki/Foo_(bar))")[0]).toMatchObject({ text: "https://uk.wikipedia.org/wiki/Foo_(bar)" });
  });

  it("розриви рядків відокремлюють посилання", () => {
    expect(links("https://a.example\nhttps://b.example").map((part) => part.text)).toEqual(["https://a.example", "https://b.example"]);
  });
});
