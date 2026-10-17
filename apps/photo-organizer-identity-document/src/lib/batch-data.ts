import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { batches, folders, photos } from "@/db/schema";

export type BatchSummary = {
  id: number;
  name: string;
  createdAt: string;
  photoCount: number;
  sortedCount: number;
  folderCount: number;
};

export type BatchDetail = {
  batch: { id: number; name: string };
  folders: { id: number; name: string }[];
  // Photos are ordered by the time they were placed in a folder, then by import order.
  // Tray photos (no folder time) come last, in import order. The client splits them by folderId.
  photos: { id: number; folderId: number | null; originalName: string; sizeBytes: number }[];
};

export async function listBatches(): Promise<BatchSummary[]> {
  const rows = await db
    .select({
      id: batches.id,
      name: batches.name,
      createdAt: batches.createdAt,
      photoCount: sql<number>`(select count(*)::int from ${photos} where ${photos.batchId} = ${batches.id})`,
      sortedCount: sql<number>`(select count(*)::int from ${photos} where ${photos.batchId} = ${batches.id} and ${photos.folderId} is not null)`,
      folderCount: sql<number>`(select count(*)::int from ${folders} where ${folders.batchId} = ${batches.id})`,
    })
    .from(batches)
    .orderBy(desc(batches.createdAt), desc(batches.id));

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getBatchDetail(batchId: number): Promise<BatchDetail | null> {
  const [batch] = await db
    .select({ id: batches.id, name: batches.name })
    .from(batches)
    .where(eq(batches.id, batchId))
    .limit(1);
  if (!batch) return null;

  const folderRows = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(eq(folders.batchId, batchId))
    .orderBy(asc(folders.createdAt), asc(folders.id));

  const photoRows = await db
    .select({
      id: photos.id,
      folderId: photos.folderId,
      originalName: photos.originalName,
      sizeBytes: photos.sizeBytes,
    })
    .from(photos)
    .where(eq(photos.batchId, batchId))
    .orderBy(asc(photos.folderedAt), asc(photos.importedAt), asc(photos.id));

  return { batch, folders: folderRows, photos: photoRows };
}
