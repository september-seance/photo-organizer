import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { absolutePath, parseId } from "@/lib/snapsort";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// GET /api/photos/:id/file            -> full-size original
// GET /api/photos/:id/file?size=thumb -> small thumbnail (falls back to the original)
export async function GET(request: Request, { params }: Context) {
  const photoId = parseId((await params).id);
  if (!photoId) return new Response("Not found", { status: 404 });

  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
  if (!photo) return new Response("Not found", { status: 404 });

  const wantThumb = new URL(request.url).searchParams.get("size") === "thumb";
  const useThumb = wantThumb && Boolean(photo.thumbPath);
  const relativePath = useThumb ? (photo.thumbPath as string) : photo.storagePath;
  const mimeType = useThumb ? "image/jpeg" : photo.mimeType;

  try {
    const data = await readFile(absolutePath(relativePath));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response("File missing on disk", { status: 404 });
  }
}
