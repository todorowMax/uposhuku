import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHOTO_MAX_BYTES, deleteByUrl, getBucket, keyFromUrl, putPhoto, putPhotoFromDataUrl, sniffImage } from "@/lib/server/uploads";
import { useTestD1 } from "../helpers/d1";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

describe("тип файлу за байтами", () => {
  it("впізнає JPEG, PNG, WebP; SVG і сміття відхиляє", () => {
    expect(sniffImage(JPEG)?.mime).toBe("image/jpeg");
    expect(sniffImage(PNG)?.mime).toBe("image/png");
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.mime).toBe("image/webp");
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("фото в R2", () => {
  it("кладе, віддає з потрібним типом і видаляє; ключ під користувачем", async () => {
    const stored = await putPhoto("u-1", JPEG);
    expect(stored).toMatchObject({ url: expect.stringMatching(/^\/api\/uploads\/photos\/u-1\/[\w-]+\.jpg$/) });
    const url = (stored as { url: string }).url;
    const key = keyFromUrl(url, "u-1");
    expect(key).not.toBeNull();
    const object = await getBucket().get(key as string);
    expect(object?.httpMetadata?.contentType).toBe("image/jpeg");
    expect(keyFromUrl(url, "u-2")).toBeNull();
    await deleteByUrl(url, "u-2");
    expect(await getBucket().get(key as string)).not.toBeNull();
    await deleteByUrl(url, "u-1");
    expect(await getBucket().get(key as string)).toBeNull();
  });

  it("не приймає порожнє, завелике, SVG", async () => {
    expect(await putPhoto("u-1", new Uint8Array())).toMatch(/Порожній/);
    expect(await putPhoto("u-1", new Uint8Array(PHOTO_MAX_BYTES + 1).fill(0xff))).toMatch(/завелике/);
    expect(await putPhoto("u-1", SVG)).toMatch(/JPEG, PNG або WebP/);
  });

  it("data URL зі старого профілю переїжджає в R2", async () => {
    const base64 = btoa(String.fromCharCode(...JPEG));
    const result = await putPhotoFromDataUrl("u-3", `data:image/jpeg;base64,${base64}`);
    expect(result).toMatchObject({ url: expect.stringContaining("/photos/u-3/") });
    expect(await putPhotoFromDataUrl("u-3", "data:image/svg+xml;base64,AAAA")).toMatch(/JPEG/);
  });

  it("чужі й підроблені адреси не дають ключа", () => {
    expect(keyFromUrl("https://evil.example/x.jpg")).toBeNull();
    expect(keyFromUrl("/api/uploads/photos/../secrets")).toBeNull();
    expect(keyFromUrl("/api/uploads/private/u-1/x.jpg")).toBeNull();
  });
});
