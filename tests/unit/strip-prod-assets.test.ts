import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stripDemoFaces } from "../../scripts/strip-prod-assets.mjs";

// Вирізання демо-облич перед прод-деплоєм: каталог `map/faces` зникає, решта ассетів лишається.
describe("вирізання демо-облич з ассетів збірки", () => {
  let assets: string;

  beforeEach(async () => {
    assets = await mkdtemp(join(tmpdir(), "strip-assets-"));
  });

  afterEach(async () => {
    await rm(assets, { recursive: true, force: true });
  });

  it("видаляє map/faces разом з файлами", async () => {
    await mkdir(join(assets, "map", "faces"), { recursive: true });
    await writeFile(join(assets, "map", "faces", "face-00.jpg"), "x");

    await stripDemoFaces(assets);

    await expect(stat(join(assets, "map", "faces"))).rejects.toThrow();
  });

  it("не чіпає інші файли в map і на верхньому рівні", async () => {
    await mkdir(join(assets, "map", "faces"), { recursive: true });
    await writeFile(join(assets, "map", "faces", "face-00.jpg"), "x");
    await writeFile(join(assets, "map", "mock-avatars.webp"), "keep");
    await writeFile(join(assets, "index.html"), "keep");

    await stripDemoFaces(assets);

    expect(await readFile(join(assets, "map", "mock-avatars.webp"), "utf8")).toBe("keep");
    expect(await readFile(join(assets, "index.html"), "utf8")).toBe("keep");
  });

  it("відсутній каталог не помилка", async () => {
    await expect(stripDemoFaces(assets)).resolves.toBeTypeOf("string");
  });
});
