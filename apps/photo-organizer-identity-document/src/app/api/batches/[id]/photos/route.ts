import { eq } from "drizzle-orm";
import { db } from "@/db";
import { batches, photos } from "@/db/schema";
import { errorResponse, isSupportedImage, parseId, storeImage } from "@/lib/snapsort";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Receives a small group of files (the client sends about 20 at a time) and stores copies in the photo tray.
export async function POST(request: Request, { params }: Context) {
  const batchId = parseId((await params).id);
  if (!batchId) return errorResponse("Batch not found.", 404);

  const [batch] = await db.select({ id: batches.id }).from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) return errorResponse("Batch not found.", 404);

  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);

  let imported = 0;
  const skipped: string[] = [];

  for (const file of files) {
    if (!isSupportedImage(file.name)) {
      skipped.push(file.name);
      continue;
    }
    const stored = await storeImage(batchId, file);
    await db.insert(photos).values({
      batchId,
      originalName: file.name.slice(0, 255),
      storagePath: stored.storagePath,
      thumbPath: stored.thumbPath,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    });
    imported += 1;
  }

  return Response.json({ imported, skipped });
}
