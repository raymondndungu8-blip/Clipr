"use client";

/**
 * Save a rendered clip to the user's device, working across desktop and mobile:
 * - Mobile: the native share sheet (Save Video / Save to Files / Photos).
 * - Desktop: a normal file download.
 * - Fallback: open the file so the user can long-press / right-click to save.
 * Must be called from a user gesture (e.g. a click handler).
 */
export async function saveVideo(url: string, filename: string): Promise<void> {
  let blob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    blob = await res.blob();
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const file = new File([blob], filename, { type: blob.type || "video/mp4" });

  // Mobile: offer the OS share/save sheet when it can handle the file.
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.canShare?.({ files: [file] }) && typeof nav.share === "function") {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (err) {
      // User cancelled the share sheet — don't fall through to a download.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  // Desktop / browsers without file share: trigger a download.
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
