import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";

// Image types SnapSort accepts. Browsers can display all of these.
export const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const MAX_BULK = 5000;

/** Where SnapSort keeps its own copies of photos. Defaults to ./data inside the project. */
export function dataDir(): string {
  return process.env.SNAPSORT_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
}

export function absolutePath(relativePath: string): string {
  return path.join(dataDir(), relativePath);
}

export function fileExtension(name: string): string {
  return path.extname(name).toLowerCase();
}

export function isSupportedImage(name: string): boolean {
  return fileExtension(name) in IMAGE_TYPES;
}

/** Parses a route segment such as "42". Returns null for anything that is not a positive integer. */
export function parseId(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Parses a list of ids from request JSON, dropping anything invalid and duplicates. */
export function parseIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<number>();
  for (const item of value) {
    const id = typeof item === "number" ? item : Number(item);
    if (Number.isInteger(id) && id > 0) ids.add(id);
    if (ids.size >= MAX_BULK) break;
  }
  return [...ids];
}

/** Trims, collapses whitespace, and limits length. Returns "" when the value is unusable. */
export function cleanName(value: unknown, max = 120): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** "Bose QC45 (Black)!" -> "bose-qc45-black" */
export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "item";
}

/** Makes slugs unique when two names produce the same slug ("Bose" and "bose!" -> "bose", "bose-2"). */
export function uniqueSlugs(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const base = slugify(name);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

/** "bose-qc45-black", index 0, total 12 -> "bose-qc45-black-01.jpg" */
export function exportFileName(slug: string, index: number, total: number, originalName: string): string {
  const width = Math.max(2, String(total).length);
  return `${slug}-${String(index + 1).padStart(width, "0")}${fileExtension(originalName)}`;
}

/**
 * Saves the original image and a small thumbnail under the data folder.
 * If the thumbnail cannot be made (for example an unusual BMP), thumbPath is null
 * and the original is shown instead.
 */
export async function storeImage(batchId: number, file: File) {
  const ext = fileExtension(file.name);
  const id = randomUUID();
  const relDir = path.join("batches", String(batchId));
  await mkdir(absolutePath(relDir), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = path.join(relDir, `${id}${ext}`);
  await writeFile(absolutePath(storagePath), buffer);

  let thumbPath: string | null = null;
  try {
    const thumb = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    thumbPath = path.join(relDir, `${id}-thumb.jpg`);
    await writeFile(absolutePath(thumbPath), thumb);
  } catch {
    thumbPath = null;
  }

  return {
    storagePath,
    thumbPath,
    mimeType: IMAGE_TYPES[ext] ?? "application/octet-stream",
    sizeBytes: buffer.length,
  };
}

export async function removeStoredFiles(paths: Array<string | null | undefined>): Promise<void> {
  await Promise.all(
    paths
      .filter((p): p is string => Boolean(p))
      .map((p) => unlink(absolutePath(p)).catch(() => undefined)),
  );
}

export async function buildZip(
  entries: Array<{ folder?: string; name: string; storagePath: string }>,
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const entry of entries) {
    const data = await readFile(absolutePath(entry.storagePath));
    const fullName = entry.folder ? `${entry.folder}/${entry.name}` : entry.name;
    zip.file(fullName, data);
  }
  // Photos are already compressed, so STORE is faster with almost no size cost.
  return zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
}

export function zipResponse(data: ArrayBuffer, filename: string): Response {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  return new Response(data, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
