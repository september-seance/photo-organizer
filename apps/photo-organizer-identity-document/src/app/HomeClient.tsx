"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { BatchSummary } from "@/lib/batch-data";

type Props = { initialBatches: BatchSummary[] };

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? fallback;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function HomeClient({ initialBatches }: Props) {
  const router = useRouter();
  const [batches, setBatches] = useState<BatchSummary[]>(initialBatches);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createBatch(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError("Type a name for the batch first, for example \"Earbuds pile, May 2026\".");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not create the batch."));
      const data = (await res.json()) as { batch: { id: number } };
      router.push(`/batches/${data.batch.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the batch.");
      setCreating(false);
    }
  }

  async function saveRename() {
    if (!editing) return;
    const { id, value } = editing;
    const name = value.trim();
    const current = batches.find((b) => b.id === id);
    setEditing(null);
    if (!name || !current || name === current.name) return;
    const res = await fetch(`/api/batches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError(await readError(res, "Could not rename the batch."));
      return;
    }
    setBatches((list) => list.map((b) => (b.id === id ? { ...b, name } : b)));
  }

  async function deleteBatch(batch: BatchSummary) {
    const ok = window.confirm(
      `Delete the batch "${batch.name}"?\n\nSnapSort's copies of its ${batch.photoCount} photo(s) will be removed. Your original files are not affected.`,
    );
    if (!ok) return;
    const res = await fetch(`/api/batches/${batch.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readError(res, "Could not delete the batch."));
      return;
    }
    setBatches((list) => list.filter((b) => b.id !== batch.id));
  }

  function onRenameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setEditing(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-2xl text-white shadow-sm" aria-hidden>
          📷
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">SnapSort</h1>
          <p className="text-sm text-slate-600">Sort product photos into item folders, ready to upload.</p>
        </div>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Start a new batch</h2>
        <p className="mt-1 text-sm text-slate-600">
          A batch is one pile of photos, such as everything from one garage cleanout.
        </p>
        <form onSubmit={createBatch} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Earbuds pile, May 2026"
            aria-label="New batch name"
            maxLength={120}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-base focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {creating ? "Creating…" : "New Batch"}
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      <section aria-label="Your batches" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Your batches</h2>

        {batches.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-8 text-center">
            <p className="font-medium text-slate-800">No batches yet.</p>
            <p className="mt-1 text-sm text-slate-600">
              Type a name above, then drag your photos into the window. That is all it takes to begin.
            </p>
          </div>
        )}

        <ol className="grid gap-3">
          {batches.map((batch) => {
            const percent = batch.photoCount === 0 ? 0 : Math.round((batch.sortedCount / batch.photoCount) * 100);
            const isEditing = editing?.id === batch.id;
            return (
              <li key={batch.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        autoFocus
                        aria-label="Rename batch"
                        value={editing.value}
                        maxLength={120}
                        onChange={(e) => setEditing({ id: batch.id, value: e.target.value })}
                        onBlur={saveRename}
                        onKeyDown={onRenameKey}
                        className="w-full rounded-md border border-emerald-500 px-2 py-1 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                    ) : (
                      <Link
                        href={`/batches/${batch.id}`}
                        className="block truncate text-lg font-semibold text-slate-900 hover:text-emerald-700"
                        title="Open this batch"
                      >
                        {batch.name}
                      </Link>
                    )}
                    <p className="mt-0.5 text-sm text-slate-500">
                      Created {formatDate(batch.createdAt)} · {batch.photoCount} photo(s) · {batch.folderCount} item folder(s)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/batches/${batch.id}`}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: batch.id, value: batch.name })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBatch(batch)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{batch.sortedCount} of {batch.photoCount} sorted</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-2xl bg-slate-900 p-6 text-slate-100">
        <h2 className="text-base font-semibold">How it works</h2>
        <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
          <li><span className="font-semibold text-emerald-400">1.</span> Create a batch</li>
          <li><span className="font-semibold text-emerald-400">2.</span> Drag in your photos</li>
          <li><span className="font-semibold text-emerald-400">3.</span> Make item folders and drop photos on them</li>
          <li><span className="font-semibold text-emerald-400">4.</span> Export a ZIP, already renamed</li>
        </ol>
      </section>
    </main>
  );
}
