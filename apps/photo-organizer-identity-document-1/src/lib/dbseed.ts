import { db } from "@/db";
import { identitySections, categories, decisions, batches, photos } from "@/db/schema";
import { SEED_SECTIONS, SEED_DECISIONS } from "@/lib/seed";
import { DEFAULT_CATEGORIES, SAMPLE_BOSE, classifyBatch, THUMB_POOL } from "@/lib/classifier";
import { count, eq } from "drizzle-orm";

export async function ensureSeed() {
  const [s] = await db.select({ c: count() }).from(identitySections);
  if (Number(s.c) === 0) await db.insert(identitySections).values(SEED_SECTIONS);
  const [c] = await db.select({ c: count() }).from(categories);
  if (Number(c.c) === 0) await db.insert(categories).values(DEFAULT_CATEGORIES.map(d => ({ name: d.name, groupLabel: d.group, isDefault: true, isActive: true })));
  const [d] = await db.select({ c: count() }).from(decisions);
  if (Number(d.c) === 0) await db.insert(decisions).values(SEED_DECISIONS);
  const [b] = await db.select({ c: count() }).from(batches);
  if (Number(b.c) === 0) {
    const cats = DEFAULT_CATEGORIES.map(x => x.name);
    const classified = classifyBatch(SAMPLE_BOSE, cats, 0.7);
    const folders = new Set(classified.map(x => x.folderName)).size;
    const [batch] = await db.insert(batches).values({ name: "Founding batch — Bose earbuds & friends", sourceLabel: "~/Pictures/To Sort (phone dump)", destLabel: "~/Pictures/Listings — Bose", threshold: 0.7, total: classified.length, folders, status: "sorted" }).returning();
    await db.insert(photos).values(classified.map((p, i) => ({ batchId: batch.id, originalName: p.originalName, category: p.category, brand: p.brand, folderName: p.folderName, newName: p.newName, confidence: p.confidence, method: p.method, thumb: THUMB_POOL[i % THUMB_POOL.length] })));
  }
}
export { eq };
