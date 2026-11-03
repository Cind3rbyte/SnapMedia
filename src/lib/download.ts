export interface DownloadItem {
  blob: Blob;
  name: string;
}

type SaveAs = (data: Blob, filename?: string) => void;

/**
 * file-saver is a CommonJS module whose export *is* the function. Depending on the bundler interop the
 * dynamic import exposes it as `saveAs`, as `default` or as `default.saveAs` – accept all of them.
 */
async function loadSaveAs(): Promise<SaveAs> {
  const mod = (await import("file-saver")) as unknown as { saveAs?: unknown; default?: unknown };
  const fallback = mod.default as { saveAs?: unknown } | SaveAs | undefined;
  const candidate =
    typeof mod.saveAs === "function"
      ? mod.saveAs
      : typeof fallback === "function"
        ? fallback
        : (fallback as { saveAs?: unknown } | undefined)?.saveAs;
  if (typeof candidate !== "function") throw new Error("Download-Modul konnte nicht geladen werden.");
  return candidate as SaveAs;
}

/** Saves a single file with file-saver (handles Safari/iOS quirks of the download attribute). */
export async function downloadFile(item: DownloadItem) {
  const saveAs = await loadSaveAs();
  saveAs(item.blob, item.name);
}

/** Ensures unique names inside an archive: "bild.jpg", "bild (2).jpg", … */
export function uniqueNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = used.get(key) ?? 0;
    used.set(key, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = `${base} (${count + 1})${ext}`;
    while (used.has(candidate.toLowerCase())) candidate = `${base} (${count + 1}-${Math.random().toString(36).slice(2, 5)})${ext}`;
    used.set(candidate.toLowerCase(), 1);
    return candidate;
  });
}

/**
 * Bundles all results into one ZIP (created locally with JSZip) and saves it.
 * Media files are already compressed, so they are stored without extra compression – much faster.
 */
export async function downloadZip(items: DownloadItem[], onProgress?: (ratio: number) => void, archiveName?: string) {
  if (items.length === 0) return;
  const [{ default: JSZip }, saveAs] = await Promise.all([import("jszip"), loadSaveAs()]);
  const zip = new JSZip();
  const names = uniqueNames(items.map((item) => item.name));
  items.forEach((item, index) => zip.file(names[index], item.blob, { binary: true }));
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true }, (meta) =>
    onProgress?.(meta.percent / 100),
  );
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  saveAs(blob, archiveName ?? `snapmedia-${stamp}.zip`);
}
