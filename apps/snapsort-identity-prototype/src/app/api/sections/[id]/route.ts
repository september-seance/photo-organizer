import { NextResponse } from "next/server";
import { db } from "@/db";
import { identitySections } from "@/db/schema";
import { eq } from "drizzle-orm";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const body = await req.json();
  const [row] = await db.update(identitySections).set({ body: body.body ?? undefined, bullets: body.bullets ?? undefined, status: body.status ?? undefined, title: body.title ?? undefined, updatedAt: new Date() }).where(eq(identitySections.id, Number(id))).returning();
  return NextResponse.json(row);
}
