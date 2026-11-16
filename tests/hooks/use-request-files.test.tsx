import { act, renderHook, waitFor } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ upload: vi.fn(), discard: vi.fn() }));
vi.mock("@/lib/requests/files-client", () => ({ uploadRequestFile: api.upload, discardRequestFile: api.discard }));

import { useRequestFiles } from "@/components/composer/use-request-files";
import { REQUEST_FILES_MAX } from "@/lib/requests/file-types";
import type { RequestFile } from "@/lib/requests/types";

const saved = (id: number, name = `f${id}.pdf`): RequestFile => ({ id, name, size: 10, type: "application/pdf", stored: true });
const file = (name: string) => new File(["x"], name);
const picked = (...files: File[]) => ({ target: { files, value: "x" } }) as unknown as ChangeEvent<HTMLInputElement>;

describe("файли запиту у формі", () => {
  beforeEach(() => {
    api.upload.mockReset();
    api.discard.mockReset();
  });

  it("вантажиться → готовий; id готових файлів доступні для чернетки, поки вантажиться, busy", async () => {
    let finish: (value: RequestFile) => void = () => undefined;
    api.upload.mockReturnValue(new Promise<RequestFile>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useRequestFiles());
    act(() => result.current.pick(picked(file("a.pdf"))));
    await waitFor(() => expect(result.current.busy).toBe(true));
    expect(result.current.items[0]).toMatchObject({ name: "a.pdf", state: "uploading" });
    expect(result.current.files).toEqual([]);
    await act(async () => finish(saved(5, "a.pdf")));
    expect(result.current.busy).toBe(false);
    expect(result.current.files.map((item) => item.id)).toEqual([5]);
  });

  it("помилка сервера лишає рядок зі станом error і текстом, у чернетку він не йде; прибрати можна", async () => {
    api.upload.mockRejectedValue(new Error("Такий файл не приймаємо."));
    const { result } = renderHook(() => useRequestFiles());
    await act(async () => result.current.pick(picked(file("evil.exe"))));
    expect(result.current.items[0]).toMatchObject({ state: "error", error: "Такий файл не приймаємо." });
    expect(result.current.files).toEqual([]);
    act(() => result.current.remove(result.current.items[0].key));
    expect(result.current.items).toEqual([]);
    expect(api.discard).not.toHaveBeenCalled();
  });

  it("прибрати щойно завантажений файл стирає його на сервері, а збережений у запиті лишається для правки", async () => {
    api.upload.mockResolvedValue(saved(9, "new.pdf"));
    const { result } = renderHook(() => useRequestFiles([saved(1)]));
    await act(async () => result.current.pick(picked(file("new.pdf"))));
    expect(result.current.files.map((item) => item.id)).toEqual([1, 9]);
    act(() => result.current.remove(result.current.items[1].key));
    expect(api.discard).toHaveBeenCalledWith(9);
    act(() => result.current.remove(result.current.items[0].key));
    expect(api.discard).toHaveBeenCalledTimes(1);
    expect(result.current.files).toEqual([]);
  });

  it("не більше REQUEST_FILES_MAX файлів, зайві не вантажаться, є пояснення", async () => {
    api.upload.mockImplementation(async (item: File) => saved(Number(item.name), item.name));
    const { result } = renderHook(() => useRequestFiles());
    const many = Array.from({ length: REQUEST_FILES_MAX + 3 }, (_, index) => file(String(index + 1)));
    await act(async () => result.current.pick(picked(...many)));
    expect(api.upload).toHaveBeenCalledTimes(REQUEST_FILES_MAX);
    expect(result.current.notice).toMatch(/До 10 файлів/);
  });

  it("форму покинуто без збереження: стираються лише щойно завантажені", async () => {
    api.upload.mockResolvedValue(saved(9, "new.pdf"));
    const { result } = renderHook(() => useRequestFiles([saved(1)]));
    await act(async () => result.current.pick(picked(file("new.pdf"))));
    act(() => result.current.discardFresh());
    expect(api.discard.mock.calls).toEqual([[9]]);
  });
});
