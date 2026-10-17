import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { batches, folders, photos } from "@/db/schema";
import {
  buildZip,
  errorResponse,
  exportFileName,
  parseId,
  slugify,
  zipResponse,
} from "@/lib/snapsort";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Exports one item folder as a ZIP of renamed photos, for example bose-qc45-black-01.jpg.
export async function GET(_request: Request, { params }: Context) {
  const folderId = parseId((await params).id);
  if (!folderId) return errorResponse("Folder not found.", 404);

  const [folder] = await db
    .select({ id: folders.id, name: folders.name, batchName: batches.name })
    .from(folders)
    .innerJoin(batches, eq(batches.id, folders.batchId))
    .where(eq(folders.id, folderId))
    .limit(1);
  if (!folder) return errorResponse("Folder not found.", 404);

  const rows = await db
    .select({ storagePath: photos.storagePath, originalName: photos.originalName })
    .from(photos)
    .where(eq(photos.folderId, folderId))
    .orderBy(asc(photos.folderedAt), asc(photos.id));

  if (rows.length === 0) {
    return errorResponse("This item folder has no photos yet. Drag photos onto it first.", 400);
  }

  const itemSlug = slugify(folder.name);
  const entries = rows.map((row, i) => ({
    name: exportFileName(itemSlug, i, rows.length, row.originalName),
    storagePath: row.storagePath,
  }));

  const zip = await buildZip(entries);
  return zipResponse(zip, `${slugify(folder.batchName)}-${itemSlug}.zip`);
}
