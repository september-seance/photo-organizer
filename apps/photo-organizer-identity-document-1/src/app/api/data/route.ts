import { NextResponse } from "next/server";
import { db } from "@/db";
import { identitySections, categories, decisions, batches, photos } from "@/db/schema";
import { ensureSeed } from "@/lib/dbseed";
import { asc, desc } from "drizzle-orm";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await ensureSeed();
    const [secs, cats, decs, runs] = await Promise.all([
      db.select().from(identitySections).orderBy(asc(identitySections.sortOrder)),
      db.select().from(categories).orderBy(asc(categories.name)),
      db.select().from(decisions).orderBy(desc(decisions.createdAt)),
      db.select().from(batches).orderBy(desc(batches.createdAt)),
    ]);
    const allPhotos = runs.length ? await db.select().from(photos) : [];
    const photosByBatch: Record<number, typeof allPhotos> = {};
    for (const p of allPhotos) { (photosByBatch[p.batchId] ||= []).push(p); }
    return NextResponse.json({ sections: secs, categories: cats, decisions: decs, batches: runs, photosByBatch });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
