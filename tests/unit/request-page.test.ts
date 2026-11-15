import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/server/auth", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")),
  getSessionUser: async () =>
    session.userId
      ? {
          id: session.userId,
          email: `${session.userId}@example.com`,
          name: null,
          via: "email",
        }
      : null,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import RequestPage, { generateMetadata } from "@/app/zapyt/[id]/page";
import { closeRequest, createRequest } from "@/lib/server/request-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const savedSiteUrl = process.env.SITE_URL;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const draft = (over: { channelOptIn?: boolean } = {}) => ({
  text: "Потрібен лендинг для курсів. Дзвоніть 0671234567, бюджет обговоримо.",
  tags: [],
  files: [],
  channelOptIn: over.channelOptIn,
});

beforeAll(async () => {
  process.env.SITE_URL = "https://findlyfy.test";
  ctx = await useTestD1();
  await makeUser(ctx.db, "pg-author");
});
afterAll(async () => {
  if (savedSiteUrl === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = savedSiteUrl;
  await ctx.close();
});
beforeEach(() => {
  session.userId = null;
});

describe("сторінка запиту /zapyt/<id>", () => {
  it("відкритий публічний запит: title, опис без контактів, canonical із SITE_URL, Open Graph; ключа robots немає", async () => {
    const created = await createRequest("pg-author", draft());
    const meta = await generateMetadata(params(created.id));
    expect(meta.title).toBe("Потрібен лендинг для курсів. · Findlyfy");
    expect(String(meta.description)).toContain("[контакт приховано]");
    expect(String(meta.description)).not.toContain("0671234567");
    expect(meta.alternates?.canonical).toBe(
      `https://findlyfy.test/zapyt/${created.id}`,
    );
    expect(meta.openGraph).toMatchObject({
      type: "article",
      url: `https://findlyfy.test/zapyt/${created.id}`,
    });
    // Без ключа robots діє загальний перемикач з кореневого layout; `undefined` тут стер би його.
    expect("robots" in meta).toBe(false);
  });

  it("закритий запит: noindex, сторінка все одно існує", async () => {
    const created = await createRequest("pg-author", draft());
    await closeRequest("pg-author", created.id);
    expect((await generateMetadata(params(created.id))).robots).toEqual({
      index: false,
      follow: false,
    });
    await expect(RequestPage(params(created.id))).resolves.toBeTruthy();
  });

  it("запит без дозволу автора: 404 для гостя, автор бачить його з noindex", async () => {
    const created = await createRequest(
      "pg-author",
      draft({ channelOptIn: false }),
    );
    await expect(RequestPage(params(created.id))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect((await generateMetadata(params(created.id))).robots).toEqual({
      index: false,
      follow: false,
    });
    session.userId = "pg-author";
    await expect(RequestPage(params(created.id))).resolves.toBeTruthy();
  });

  it("невідомий id: 404 і noindex у метаданих; зіпсований відсоток в адресі теж дає 404, а не збій", async () => {
    await expect(RequestPage(params("req_unknown"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect((await generateMetadata(params("req_unknown"))).robots).toEqual({
      index: false,
      follow: false,
    });
    await expect(RequestPage(params("%E0%A4%A"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
