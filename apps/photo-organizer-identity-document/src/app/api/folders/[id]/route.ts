import { eq } from "drizzle-orm";
import { db } from "@/db";
import { folders, photos } from "@/db/schema";
import { cleanName, errorResponse, parseId } from "@/lib/snapsort";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const folderId = parseId((await params).id);
  if (!folderId) return errorResponse("Folder not found.", 404);

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = cleanName(body?.name);
  if (!name) return errorResponse("Give the folder a name.", 400);

  const [folder] = await db
    .update(folders)
    .set({ name })
    .where(eq(folders.id, folderId))
    .returning({ id: folders.id, name: folders.name });
  if (!folder) return errorResponse("Folder not found.", 404);
  return Response.json({ folder });
}

// Deleting an item folder sends its photos back to the tray. No photo is deleted.
export async function DELETE(_request: Request, { params }: Context) {
  const folderId = parseId((await params).id);
  if (!folderId) return errorResponse("Folder not found.", 404);

  await db
    .update(photos)
    .set({ folderId: null, folderedAt: null })
    .where(eq(photos.folderId, folderId));

  const deleted = await db.delete(folders).where(eq(folders.id, folderId)).returning({ id: folders.id });
  if (deleted.length === 0) return errorResponse("Folder not found.", 404);
  return Response.json({ ok: true });
}
