import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { folders, photos } from "@/db/schema";
import { errorResponse } from "@/lib/snapsort";

export const dynamic = "force-dynamic";

type Move = { photoId: number; folderId: number | null };

function parseMoves(value: unknown): Move[] {
  if (!Array.isArray(value)) return [];
  const result: Move[] = [];
  for (const raw of value.slice(0, 5000)) {
    if (!raw || typeof raw !== "object") continue;
    const { photoId, folderId } = raw as { photoId?: unknown; folderId?: unknown };
    const pid = Number(photoId);
    if (!Number.isInteger(pid) || pid < 1) continue;
    if (folderId === null || folderId === undefined) {
      result.push({ photoId: pid, folderId: null });
      continue;
    }
    const fid = Number(folderId);
    if (Number.isInteger(fid) && fid > 0) result.push({ photoId: pid, folderId: fid });
  }
  return result;
}

// Body: { moves: [{ photoId, folderId | null }] }. folderId null sends the photo back to the tray.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { moves?: unknown } | null;
  const moves = parseMoves(body?.moves);
  if (moves.length === 0) return errorResponse("Nothing to move.", 400);

  let updated = 0;
  let skipped = 0;

  const toTray = moves.filter((m) => m.folderId === null).map((m) => m.photoId);
  if (toTray.length > 0) {
    const rows = await db
      .update(photos)
      .set({ folderId: null, folderedAt: null })
      .where(inArray(photos.id, toTray))
      .returning({ id: photos.id });
    updated += rows.length;
  }

  const byFolder = new Map<number, number[]>();
  for (const move of moves) {
    if (move.folderId === null) continue;
    const list = byFolder.get(move.folderId) ?? [];
    list.push(move.photoId);
    byFolder.set(move.folderId, list);
  }

  for (const [folderId, ids] of byFolder) {
    const [folder] = await db
      .select({ id: folders.id, batchId: folders.batchId })
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1);
    if (!folder) {
      // The folder was deleted after this move was recorded (for example during undo).
      skipped += ids.length;
      continue;
    }
    // Only move photos that belong to the same batch as the folder.
    const rows = await db
      .update(photos)
      .set({ folderId, folderedAt: new Date() })
      .where(and(inArray(photos.id, ids), eq(photos.batchId, folder.batchId)))
      .returning({ id: photos.id });
    updated += rows.length;
  }

  return Response.json({ updated, skipped });
}
