import { NextResponse } from "next/server";
import { db } from "@/db";
import { decisions } from "@/db/schema";
import { eq } from "drizzle-orm";
export async function POST(req: Request) {
  const b = await req.json(); if (!b.title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });
  const [row] = await db.insert(decisions).values({ title: b.title.trim(), context: b.context || "", decision: b.decision || "", status: b.status || "open" }).returning();
  return NextResponse.json(row);
}
export async function PATCH(req: Request) {
  const { id, status, decision } = await req.json();
  const [row] = await db.update(decisions).set({ status, decision }).where(eq(decisions.id, Number(id))).returning();
  return NextResponse.json(row);
}
