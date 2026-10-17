import { db } from "@/db";
import { identitySections, categories, decisions } from "@/db/schema";
import { ensureSeed } from "@/lib/dbseed";
import { asc } from "drizzle-orm";
export const dynamic = "force-dynamic";
export async function GET() {
  await ensureSeed();
  const secs = await db.select().from(identitySections).orderBy(asc(identitySections.sortOrder));
  const cats = await db.select().from(categories).orderBy(asc(categories.name));
  const decs = await db.select().from(decisions);
  let md = `# SnapSort for Linux Mint — Identity Document\n\n*Photo Organizer, reimagined for people coming from Windows. No terminal, ever.*\n*Generated ${new Date().toISOString().slice(0,10)} from the living document. Source of truth for building the Mint app.*\n\n---\n\n`;
  for (const s of secs) {
    md += `## ${s.num} — ${s.title}\n*${s.kicker} · Status: ${s.status}*\n\n${s.body}\n\n`;
    if (s.bullets.trim()) md += s.bullets.split("\n").map(b => `- ${b}`).join("\n") + "\n\n";
  }
  md += `---\n\n## Appendix A — Active categories (${cats.filter(c=>c.isActive).length}/${cats.length})\n\n${cats.filter(c=>c.isActive).map(c=>c.name).join(", ")}\n\n## Appendix B — Decisions log\n\n`;
  for (const d of decs) md += `- **[${d.status}] ${d.title}** — ${d.decision || "(open)"}\n`;
  return new Response(md, { headers: { "Content-Type": "text/markdown", "Content-Disposition": "attachment; filename=SnapSort-Identity-Document.md" } });
}
