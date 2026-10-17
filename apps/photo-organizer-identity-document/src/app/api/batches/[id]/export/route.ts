import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { batches, folders, photos } from "@/db/schema";
import {
  buildZip,
  errorResponse,
  exportFileName,
  parseId,
  slugify,
  uniqueSlugs,
  zipResponse,
} from "@/lib/snapsort";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Exports every item folder in the batch as one ZIP, with one subfolder per item.
// Photos still in the tray are left out on purpose.
export async function GET(_request: Request, { params }: Context) {
  const batchId = parseId((await params).id);
  if (!batchId) return errorResponse("Batch not found.", 404);

  const [batch] = await db.select({ name: batches.name }).from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) return errorResponse("Batch not found.", 404);

  const rows = await db
    .select({
      folderId: folders.id,
      folderName: folders.name,
      storagePath: photos.storagePath,
      originalName: photos.originalName,
    })
    .from(photos)
    .innerJoin(folders, eq(folders.id, photos.folderId))
    .where(and(eq(photos.batchId, batchId), isNotNull(photos.folderId)))
    .orderBy(asc(folders.createdAt), asc(folders.id), asc(photos.folderedAt), asc(photos.id));

  if (rows.length === 0) {
    return errorResponse("No photos are in item folders yet. Drag photos onto a folder first.", 400);
  }

  // Group photos by folder, keeping folder order.
  const groups = new Map<number, { name: string; items: typeof rows }>();
  for (const row of rows) {
    const group = groups.get(row.folderId) ?? { name: row.folderName, items: [] };
    group.items.push(row);
    groups.set(row.folderId, group);
  }

  const groupList = [...groups.values()];
  const slugs = uniqueSlugs(groupList.map((g) => g.name));

  const entries = groupList.flatMap((group, groupIndex) =>
    group.items.map((item, i) => ({
      folder: slugs[groupIndex],
      name: exportFileName(slugs[groupIndex], i, group.items.length, item.originalName),
      storagePath: item.storagePath,
    })),
  );

  const zip = await buildZip(entries);
  return zipResponse(zip, `${slugify(batch.name)}-all.zip`);
}
