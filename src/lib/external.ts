import { invoke } from "@tauri-apps/api/core";

export function isSafeExternalUrl(value: string): boolean {
  if (!value || value.length > 2048 || /\s|[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function openExternalSource(url: string): Promise<void> {
  if (!isSafeExternalUrl(url)) throw new Error("Only valid HTTP and HTTPS source links can be opened.");
  if ("__TAURI_INTERNALS__" in window) {
    await invoke("open_external_source", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
