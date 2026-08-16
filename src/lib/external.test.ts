import { describe, expect, it, vi } from "vitest";
import { isSafeExternalUrl, openExternalSource } from "./external";

describe("external source links", () => {
  it("accepts only credential-free HTTP(S) URLs", () => {
    expect(isSafeExternalUrl("https://fallout.bethesda.net/en-US/news/example")).toBe(true);
    expect(isSafeExternalUrl("http://example.org/reference")).toBe(true);
    expect(isSafeExternalUrl("file:///C:/Windows/System32/calc.exe")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("https://user:password@example.org/reference")).toBe(false);
  });

  it("uses a new browser context outside Tauri", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await openExternalSource("https://example.org/source");
    expect(open).toHaveBeenCalledWith("https://example.org/source", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
});
