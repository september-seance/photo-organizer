import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { errorResponse, parseIdList, removeStoredFiles } from "@/lib/snapsort";

export const dynamic = "force-dynamic";

// Removes photos from SnapSort. The user's original files on disk are never touched.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = parseIdList(body?.ids);
  if (ids.length === 0) return errorResponse("No photos selected.", 400);

  const rows = await db
    .select({ id: photos.id, storagePath: photos.storagePath, thumbPath: photos.thumbPath })
    .from(photos)
    .where(inArray(photos.id, ids));

  if (rows.length > 0) {
    await db.delete(photos).where(inArray(photos.id, rows.map((r) => r.id)));
    await removeStoredFiles(rows.flatMap((r) => [r.storagePath, r.thumbPath]));
  }

  return Response.json({ deleted: rows.length });
}
