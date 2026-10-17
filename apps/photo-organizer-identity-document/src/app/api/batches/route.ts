import { NextResponse } from "next/server";
import { db } from "@/db";
import { batches } from "@/db/schema";
import { listBatches } from "@/lib/batch-data";
import { cleanName, errorResponse } from "@/lib/snapsort";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ batches: await listBatches() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = cleanName(body?.name);
  if (!name) return errorResponse("Give the batch a name.", 400);

  const [batch] = await db.insert(batches).values({ name }).returning();
  return NextResponse.json({ batch }, { status: 201 });
}
