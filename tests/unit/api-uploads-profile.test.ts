import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/realtime", () => ({ pushGlobal: vi.fn(), pushUser: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { GET as PUBLIC_FILE } from "@/app/api/uploads/[...key]/route";
import { POST as UPLOAD } from "@/app/api/uploads/route";
import { DELETE, GET, PUT } from "@/app/api/profile/route";
import { getProfile } from "@/lib/server/profile-repo";
import { getBucket, PHOTO_MAX_BYTES } from "@/lib/server/uploads";
import { ctxOf, exhaust, jsonRequest, publishProfile } from "../helpers/route-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const as = (id: string | null) => {
  session.user = id ? { id, email: `${id}@example.com`, name: null } : null;
};
const body = async (response: Response) => (await response.json()) as Record<string, unknown>;
const JPEG: Uint8Array<ArrayBuffer> = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const raw = (bytes: Uint8Array<ArrayBuffer> | string) => new Request("https://findlyfy.test/api/uploads", { method: "POST", body: bytes });
const multipart = (file: File | null) => {
  const form = new FormData();
  if (file) form.set("file", file);
  else form.set("other", "x");
  return new Request("https://findlyfy.test/api/uploads", { method: "POST", body: form });
};
const DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const draft = (over: Record<string, unknown> = {}) => ({ name: "Олена", ...over });

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["up-a", "up-b", "up-c", "up-d"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => as("up-a"));

describe("POST /api/uploads", () => {
  it("без входу 401", async () => {
    as(null);
    expect((await UPLOAD(raw(JPEG))).status).toBe(401);
  });

  it("jpeg сирим тілом і через multipart приймається, файл лягає під префікс власника", async () => {
    const rawBody = await UPLOAD(raw(JPEG));
    expect(rawBody.status).toBe(201);
    const url = (await body(rawBody)).url as string;
    expect(url).toMatch(/^\/api\/uploads\/photos\/up-a\/[\w-]+\.jpg$/);
    expect(await getBucket().get(url.replace("/api/uploads/", ""))).not.toBeNull();
    const viaForm = await UPLOAD(multipart(new File([JPEG], "a.jpg", { type: "image/jpeg" })));
    expect(viaForm.status).toBe(201);
  });

  it("не картинка, SVG, порожнє тіло: 400; multipart без поля file: 400", async () => {
    expect((await UPLOAD(raw("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>"))).status).toBe(400);
    expect((await UPLOAD(raw(new Uint8Array(0)))).status).toBe(400);
    expect((await UPLOAD(multipart(null))).status).toBe(400);
  });

  it("завелике фото 413", async () => {
    expect((await UPLOAD(raw(new Uint8Array(PHOTO_MAX_BYTES * 2 + 10)))).status).toBe(413);
  });

  it("31-ше завантаження за 10 хвилин дає 429", async () => {
    as("up-d");
    await exhaust("upload", "up-d");
    expect((await UPLOAD(raw(JPEG))).status).toBe(429);
  });
});

describe("GET /api/uploads/…", () => {
  it("віддає лише photos/…, шляхи з .. і чужі префікси дають 404", async () => {
    const url = (await body(await UPLOAD(raw(JPEG)))).url as string;
    const key = url.replace("/api/uploads/", "").split("/");
    const ok = await PUBLIC_FILE(new Request("https://findlyfy.test/x"), ctxOf({ key } as never));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    for (const bad of [["chat", "c", "x.jpg"], ["photos", "..", "chat", "x.jpg"], ["other", "x"], []]) {
      expect((await PUBLIC_FILE(new Request("https://findlyfy.test/x"), ctxOf({ key: bad } as never))).status).toBe(404);
    }
  });
});

describe("/api/profile", () => {
  it("без входу 401 на всі методи", async () => {
    as(null);
    expect((await GET()).status).toBe(401);
    expect((await PUT(jsonRequest("PUT", draft()))).status).toBe(401);
    expect((await DELETE()).status).toBe(401);
  });

  it("GET віддає лише власний профіль, чужий не видно", async () => {
    await publishProfile("up-b", { name: "Борис" });
    as("up-a");
    expect((await body(await GET())).profile).toBeNull();
    as("up-b");
    expect(((await body(await GET())).profile as { name: string }).name).toBe("Борис");
  });

  it("зламане тіло, невідоме місто, точка поза Україною, чужа схема посилання і публікація без обов'язкового: 400", async () => {
    const cases: unknown[] = [
      "{bad",
      draft({ cityId: "atlantis" }),
      draft({ location: { lat: 10, lng: 10 } }),
      draft({ works: [{ title: "Робота", url: "javascript:alert(1)" }] }),
      draft({ photo: "https://evil.example/x.jpg" }),
      draft({ published: true }),
    ];
    for (const payload of cases) expect((await PUT(jsonRequest("PUT", payload))).status, JSON.stringify(payload)).toBe(400);
    expect(await getProfile("up-a")).toBeNull();
  });

  it("чужа адреса фото відхиляється 400, і профіль не змінюється", async () => {
    as("up-c");
    const saved = await PUT(jsonRequest("PUT", draft()));
    expect(saved.status).toBe(200);
    const foreign = await PUT(jsonRequest("PUT", draft({ name: "Підмінене", photo: "/api/uploads/photos/up-b/x.jpg" })));
    expect(foreign.status).toBe(400);
    expect((await getProfile("up-c"))?.name).toBe("Олена");
  });

  it("нове фото data URL кладеться в R2 під власний префікс, адреса зберігається в профілі", async () => {
    as("up-c");
    const response = await PUT(jsonRequest("PUT", draft({ photo: DATA_URL })));
    expect(response.status).toBe(200);
    const photo = ((await body(response)).profile as { photo: string }).photo;
    expect(photo).toMatch(/^\/api\/uploads\/photos\/up-c\/[\w-]+\.jpg$/);
    expect(await getBucket().get(photo.replace("/api/uploads/", ""))).not.toBeNull();
  });

  it("DELETE знімає лише власний профіль", async () => {
    await publishProfile("up-d", { name: "Дарина" });
    as("up-b");
    expect((await DELETE()).status).toBe(204);
    expect(await getProfile("up-b")).toBeNull();
    expect((await getProfile("up-d"))?.name).toBe("Дарина");
  });

  it("31-е збереження за годину дає 429 і профіль не змінює", async () => {
    as("up-a");
    await exhaust("profileSave", "up-a");
    expect((await PUT(jsonRequest("PUT", draft({ name: "Нове ім'я" })))).status).toBe(429);
    expect(await getProfile("up-a")).toBeNull();
  });
});
