import { eq } from "drizzle-orm";
import { db } from "@/db";
import { batches, folders } from "@/db/schema";
import { cleanName, errorResponse, parseId } from "@/lib/snapsort";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const batchId = parseId((await params).id);
  if (!batchId) return errorResponse("Batch not found.", 404);

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = cleanName(body?.name) || "New item folder";

  const [batch] = await db.select({ id: batches.id }).from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) return errorResponse("Batch not found.", 404);

  const [folder] = await db.insert(folders).values({ batchId, name }).returning();
  return Response.json({ folder }, { status: 201 });
}
