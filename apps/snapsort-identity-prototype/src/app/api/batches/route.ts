import { NextResponse } from "next/server";
import { db } from "@/db";
import { batches, photos, categories } from "@/db/schema";
import { classifyBatch, THUMB_POOL } from "@/lib/classifier";
import { ensureSeed } from "@/lib/dbseed";
export async function POST(req: Request) {
  await ensureSeed();
  const { name, sourceLabel, destLabel, threshold, filenames, overrides } = await req.json();
  const cats = await db.select().from(categories);
  const active = cats.filter(c => c.isActive).map(c => c.name);
  let classified = classifyBatch(filenames as string[], active, Number(threshold) || 0.7);
  // user corrections from the Preview step win over the model — principle: human override
  if (overrides && typeof overrides === "object") {
    const counters: Record<string, number> = {};
    classified = classified.map(p => {
      const o = overrides[p.originalName];
      const folder = o ? o : p.folderName;
      const ext = (p.originalName.match(/\.[^.]+$/)?.[0] || ".jpg").toLowerCase();
      counters[folder] = (counters[folder] || 0) + 1; const n = counters[folder];
      const base = folder.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
      const needsReview = o === "Uncategorized";
      return { ...p, folderName: folder, category: o ? needsReview ? "uncategorized" : folder.toLowerCase() : p.category, method: o ? needsReview ? "needs review" : "you fixed it" : p.method, confidence: o ? needsReview ? 0 : 1 : p.confidence, newName: n > 1 ? `${base}_${n}${ext}` : `${base}${ext}` };
    });
  }
  const folders = new Set(classified.map(x => x.folderName)).size;
  const [batch] = await db.insert(batches).values({ name: name || "Untitled batch", sourceLabel: sourceLabel || "~/Pictures/To Sort", destLabel: destLabel || "~/Pictures/Listings", threshold: Number(threshold) || 0.7, total: classified.length, folders, status: "sorted" }).returning();
  if (classified.length) await db.insert(photos).values(classified.map((p, i) => ({ batchId: batch.id, originalName: p.originalName, category: p.category, brand: p.brand, folderName: p.folderName, newName: p.newName, confidence: p.confidence, method: p.method, thumb: THUMB_POOL[i % THUMB_POOL.length] })));
  return NextResponse.json({ batch, photos: classified });
}
