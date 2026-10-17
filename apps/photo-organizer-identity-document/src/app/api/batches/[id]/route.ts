import { eq } from "drizzle-orm";
import { db } from "@/db";
import { batches, photos } from "@/db/schema";
import { getBatchDetail } from "@/lib/batch-data";
import { absolutePath, cleanName, errorResponse, parseId, removeStoredFiles } from "@/lib/snapsort";
import { rm } from "node:fs/promises";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const batchId = parseId((await params).id);
  if (!batchId) return errorResponse("Batch not found.", 404);

  const detail = await getBatchDetail(batchId);
  if (!detail) return errorResponse("Batch not found.", 404);
  return Response.json(detail);
}

export async function PATCH(request: Request, { params }: Context) {
  const batchId = parseId((await params).id);
  if (!batchId) return errorResponse("Batch not found.", 404);

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = cleanName(body?.name);
  if (!name) return errorResponse("Give the batch a name.", 400);

  const [updated] = await db
    .update(batches)
    .set({ name })
    .where(eq(batches.id, batchId))
    .returning({ id: batches.id, name: batches.name });
  if (!updated) return errorResponse("Batch not found.", 404);
  return Response.json({ batch: updated });
}

export async function DELETE(_request: Request, { params }: Context) {
  const batchId = parseId((await params).id);
  if (!batchId) return errorResponse("Batch not found.", 404);

  const files = await db
    .select({ storagePath: photos.storagePath, thumbPath: photos.thumbPath })
    .from(photos)
    .where(eq(photos.batchId, batchId));

  // Folders and photos are removed by the database (ON DELETE CASCADE).
  const deleted = await db.delete(batches).where(eq(batches.id, batchId)).returning({ id: batches.id });
  if (deleted.length === 0) return errorResponse("Batch not found.", 404);

  await removeStoredFiles(files.flatMap((f) => [f.storagePath, f.thumbPath]));
  await rm(absolutePath(`batches/${batchId}`), { recursive: true, force: true });
  return Response.json({ ok: true });
}
