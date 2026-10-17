import { notFound } from "next/navigation";
import { getBatchDetail } from "@/lib/batch-data";
import { parseId } from "@/lib/snapsort";
import Workspace from "./Workspace";

export const dynamic = "force-dynamic";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const batchId = parseId((await params).id);
  if (!batchId) notFound();

  const detail = await getBatchDetail(batchId);
  if (!detail) notFound();

  return <Workspace initial={detail} />;
}
