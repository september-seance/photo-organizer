import { listBatches } from "@/lib/batch-data";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const batches = await listBatches();
  return <HomeClient initialBatches={batches} />;
}
