import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/dbseed";
export async function POST(req: Request) {
  await ensureSeed(); const { name, groupLabel } = await req.json();
  const clean = String(name || "").trim().toLowerCase(); if (!clean) return NextResponse.json({ error: "Name required" }, { status: 400 });
  try { const [row] = await db.insert(categories).values({ name: clean, groupLabel: groupLabel || "My categories", isDefault: false, isActive: true }).returning(); return NextResponse.json(row); }
  catch { return NextResponse.json({ error: "That category already exists" }, { status: 409 }); }
}
export async function PATCH(req: Request) {
  const { id, isActive } = await req.json();
  const [row] = await db.update(categories).set({ isActive }).where(eq(categories.id, Number(id))).returning();
  return NextResponse.json(row);
}
export async function DELETE(req: Request) {
  const { id } = await req.json(); await db.delete(categories).where(eq(categories.id, Number(id))); return NextResponse.json({ ok: true });
}
