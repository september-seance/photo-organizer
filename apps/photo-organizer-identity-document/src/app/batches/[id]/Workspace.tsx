"use client";

import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type ButtonHTMLAttributes,
  type DragEvent,
  type MouseEvent,
} from "react";
import type { BatchDetail } from "@/lib/batch-data";

type PhotoInfo = BatchDetail["photos"][number];
type FolderInfo = BatchDetail["folders"][number];
type Move = { photoId: number; folderId: number | null };
type UndoEntry = { label: string; moves: Move[] };

const PHOTO_MIME = "application/x-snapsort-photos";
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const UPLOAD_CHUNK = 20;
// Lets the "Add Folder" button pick a whole folder of photos. React types do not include this attribute.
const FOLDER_PICKER_ATTRS = { webkitdirectory: "" } as Record<string, string>;

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Something went wrong (${res.status}).`);
  return data;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function hasType(dt: DataTransfer, type: string): boolean {
  return Array.from(dt.types).includes(type);
}

function readDraggedIds(dt: DataTransfer): number[] {
  try {
    const parsed: unknown = JSON.parse(dt.getData(PHOTO_MIME));
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

// Folder drops: walk dropped directories so dragging a whole folder from Nemo works.
type FsEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  file: (success: (file: File) => void, error: (err: unknown) => void) => void;
  createReader: () => {
    readEntries: (success: (entries: FsEntryLike[]) => void, error: (err: unknown) => void) => void;
  };
};

async function walkEntry(entry: FsEntryLike): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    return [file];
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const children: FsEntryLike[] = [];
    // readEntries returns at most about 100 entries per call, so keep reading until it is empty.
    for (;;) {
      const batch = await new Promise<FsEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      children.push(...batch);
    }
    const nested = await Promise.all(children.map(walkEntry));
    return nested.flat();
  }
  return [];
}

// Must be called synchronously inside the drop event. Browsers invalidate DataTransfer after the event ends.
function readDroppedFiles(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items).filter((item) => item.kind === "file");
  if (items.length === 0) return Promise.resolve(Array.from(dt.files));

  const captured = items.map((item) => ({
    entry: (item as unknown as { webkitGetAsEntry?: () => FsEntryLike | null }).webkitGetAsEntry?.() ?? null,
    file: item.getAsFile(),
  }));

  return (async () => {
    const files: File[] = [];
    for (const { entry, file } of captured) {
      if (entry) files.push(...(await walkEntry(entry)));
      else if (file) files.push(file);
    }
    return files;
  })();
}

type ToolVariant = "default" | "primary" | "danger";

function ToolButton({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ToolVariant }) {
  const tone =
    variant === "primary"
      ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
      : variant === "danger"
        ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
        : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100";
  return (
    <button
      type="button"
      {...props}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${tone} ${className}`}
    />
  );
}

function PhotoTile({
  photo,
  selected,
  size,
  onClick,
  onDoubleClick,
  onDragStart,
}: {
  photo: PhotoInfo;
  selected: boolean;
  size: number;
  onClick: (e: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="button"
      aria-pressed={selected}
      aria-label={photo.originalName}
      title={photo.originalName}
      draggable
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
      style={{ width: size, height: size }}
      className={`relative shrink-0 cursor-pointer select-none overflow-hidden rounded-md bg-slate-100 ${
        selected ? "ring-2 ring-inset ring-blue-500" : "hover:ring-2 hover:ring-inset hover:ring-slate-300"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/photos/${photo.id}/file?size=thumb`}
        alt=""
        loading="lazy"
        draggable={false}
        className="pointer-events-none h-full w-full object-cover"
      />
      {selected && (
        <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
          ✓
        </span>
      )}
    </div>
  );
}

export default function Workspace({ initial }: { initial: BatchDetail }) {
  const batchId = initial.batch.id;
  const [detail, setDetail] = useState<BatchDetail>(initial);
  const [batchName, setBatchName] = useState(initial.batch.name);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [clipboard, setClipboard] = useState<number[] | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [status, setStatus] = useState("Ready. Drag photos in, or click Add Photos.");
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<{ id: number; value: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; folderId: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const cancelRename = useRef(false);

  const trayPhotos = useMemo(() => detail.photos.filter((p) => p.folderId === null), [detail]);

  const photosByFolder = useMemo(() => {
    const map = new Map<number, PhotoInfo[]>();
    for (const folder of detail.folders) map.set(folder.id, []);
    for (const photo of detail.photos) {
      if (photo.folderId !== null) {
        map.get(photo.folderId)?.push(photo);
      }
    }
    return map;
  }, [detail]);

  const sortedCount = detail.photos.length - trayPhotos.length;
  const activeFolder = detail.folders.find((f) => f.id === activeFolderId);
  const previewIndex = previewId === null ? -1 : detail.photos.findIndex((p) => p.id === previewId);
  const previewPhoto = previewIndex >= 0 ? detail.photos[previewIndex] : null;
  const previewFolderName = previewPhoto
    ? detail.folders.find((f) => f.id === previewPhoto.folderId)?.name ?? "Photo tray"
    : "";
  const menuFolder = menu ? detail.folders.find((f) => f.id === menu.folderId) : undefined;

  async function refresh() {
    const fresh = await api<BatchDetail>(`/api/batches/${batchId}`);
    setDetail(fresh);
    const existing = new Set(fresh.photos.map((p) => p.id));
    setSelected((prev) => new Set([...prev].filter((id) => existing.has(id))));
  }

  // Runs a change, then reloads the batch. The task may return a message for the status bar.
  async function run(label: string, task: () => Promise<string | void>) {
    setBusy(true);
    setStatus(label);
    try {
      const message = await task();
      await refresh();
      setStatus(typeof message === "string" && message ? message : "Ready.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function importFiles(files: File[]) {
    const supported = files.filter((f) => SUPPORTED_EXTENSIONS.includes(extensionOf(f.name)));
    const skippedCount = files.length - supported.length;
    if (supported.length === 0) {
      setStatus("No supported photos found. Use JPG, PNG, WEBP, or GIF.");
      return;
    }
    void run(`Importing 0 of ${supported.length}…`, async () => {
      let imported = 0;
      for (let i = 0; i < supported.length; i += UPLOAD_CHUNK) {
        const form = new FormData();
        for (const file of supported.slice(i, i + UPLOAD_CHUNK)) form.append("files", file);
        const res = await api<{ imported: number }>(`/api/batches/${batchId}/photos`, {
          method: "POST",
          body: form,
        });
        imported += res.imported;
        setStatus(`Importing ${imported} of ${supported.length}…`);
      }
      const skippedNote = skippedCount > 0 ? ` Skipped ${skippedCount} file(s) that are not photos.` : "";
      return `Imported ${imported} photo(s) into the tray.${skippedNote}`;
    });
  }

  function moveToFolder(photoIds: number[], folderId: number | null) {
    if (photoIds.length === 0) return;
    const current = new Map<number, number | null>(detail.photos.map((p): [number, number | null] => [p.id, p.folderId]));
    const previous: Move[] = photoIds
      .filter((id) => current.has(id) && current.get(id) !== folderId)
      .map((photoId) => ({ photoId, folderId: current.get(photoId) ?? null }));
    if (previous.length === 0) {
      setStatus("Those photos are already there.");
      return;
    }
    const target =
      folderId === null ? "the photo tray" : `"${detail.folders.find((f) => f.id === folderId)?.name ?? "that folder"}"`;
    const moves: Move[] = previous.map((m) => ({ photoId: m.photoId, folderId }));

    void run(`Moving ${plural(moves.length, "photo")}…`, async () => {
      await api("/api/photos/move", jsonInit("POST", { moves }));
      setUndoStack((stack) => [...stack.slice(-49), { label: `move to ${target}`, moves: previous }]);
      setSelected(new Set());
      return `Moved ${plural(moves.length, "photo")} to ${target}. Press Ctrl+Z to undo.`;
    });
  }

  function undo() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) {
      setStatus("Nothing to undo.");
      return;
    }
    setUndoStack((stack) => stack.slice(0, -1));
    void run("Undoing…", async () => {
      await api("/api/photos/move", jsonInit("POST", { moves: entry.moves }));
      return `Undid: ${entry.label}.`;
    });
  }

  function createFolder() {
    void run("Creating folder…", async () => {
      const res = await api<{ folder: FolderInfo }>(
        `/api/batches/${batchId}/folders`,
        jsonInit("POST", { name: "New item folder" }),
      );
      setActiveFolderId(res.folder.id);
      setRenamingFolder({ id: res.folder.id, value: res.folder.name });
      return "Type the item name and press Enter.";
    });
  }

  function startRename(folder: FolderInfo) {
    setActiveFolderId(folder.id);
    setRenamingFolder({ id: folder.id, value: folder.name });
  }

  function commitRename() {
    const current = renamingFolder;
    setRenamingFolder(null);
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    if (!current) return;
    const name = current.value.trim();
    const folder = detail.folders.find((f) => f.id === current.id);
    if (!name || !folder || name === folder.name) return;
    void run("Renaming…", async () => {
      await api(`/api/folders/${current.id}`, jsonInit("PATCH", { name }));
      return `Renamed to "${name}".`;
    });
  }

  function deleteFolder(folder: FolderInfo) {
    const count = photosByFolder.get(folder.id)?.length ?? 0;
    const ok = window.confirm(
      `Delete the item folder "${folder.name}"?\n\n${plural(count, "photo")} will go back to the photo tray. No photo is deleted.`,
    );
    if (!ok) return;
    void run("Deleting folder…", async () => {
      await api(`/api/folders/${folder.id}`, { method: "DELETE" });
      if (activeFolderId === folder.id) setActiveFolderId(null);
      return `Deleted "${folder.name}".`;
    });
  }

  function deletePhotos(ids: number[]) {
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Remove ${plural(ids.length, "photo")} from this batch?\n\nYour original files on disk are not changed.`,
    );
    if (!ok) return;
    void run("Removing photos…", async () => {
      await api("/api/photos/delete", jsonInit("POST", { ids }));
      setSelected(new Set());
      return `Removed ${plural(ids.length, "photo")}.`;
    });
  }

  function exportFolder(folder: FolderInfo) {
    const count = photosByFolder.get(folder.id)?.length ?? 0;
    if (count === 0) {
      setStatus(`"${folder.name}" has no photos yet. Drag photos onto it first.`);
      return;
    }
    setStatus(`Preparing ZIP for "${folder.name}"…`);
    window.location.assign(`/api/folders/${folder.id}/export`);
  }

  function exportAll() {
    if (sortedCount === 0) {
      setStatus("Nothing to export yet. Put photos into item folders first.");
      return;
    }
    const leftover = trayPhotos.length > 0 ? ` ${plural(trayPhotos.length, "photo")} still in the tray will not be included.` : "";
    setStatus(`Preparing ZIP of all item folders.${leftover}`);
    window.location.assign(`/api/batches/${batchId}/export`);
  }

  function saveBatchName() {
    const name = batchName.trim();
    if (!name || name === detail.batch.name) {
      setBatchName(detail.batch.name);
      return;
    }
    void run("Saving name…", async () => {
      await api(`/api/batches/${batchId}`, jsonInit("PATCH", { name }));
      return "Batch renamed.";
    });
  }

  function cutSelected() {
    if (selected.size === 0) {
      setStatus("Select photos first, then press Ctrl+X.");
      return;
    }
    setClipboard([...selected]);
    setStatus(`Cut ${plural(selected.size, "photo")}. Click an item folder, then press Ctrl+V to paste.`);
  }

  function pasteToActiveFolder() {
    if (!clipboard) {
      setStatus("Nothing to paste. Select photos and press Ctrl+X first.");
      return;
    }
    if (activeFolderId === null) {
      setStatus("Click an item folder first, then press Ctrl+V.");
      return;
    }
    const ids = clipboard;
    setClipboard(null);
    moveToFolder(ids, activeFolderId);
  }

  function handlePhotoClick(e: MouseEvent<HTMLDivElement>, photo: PhotoInfo) {
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(photo.id)) next.delete(photo.id);
        else next.add(photo.id);
        return next;
      });
      setAnchorId(photo.id);
      return;
    }
    if (e.shiftKey && anchorId !== null) {
      const siblings = detail.photos.filter((p) => p.folderId === photo.folderId);
      const from = siblings.findIndex((p) => p.id === anchorId);
      const to = siblings.findIndex((p) => p.id === photo.id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        setSelected(new Set(siblings.slice(lo, hi + 1).map((p) => p.id)));
        return;
      }
    }
    setSelected(new Set([photo.id]));
    setAnchorId(photo.id);
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, photo: PhotoInfo) {
    let ids: number[];
    if (selected.has(photo.id)) {
      ids = [...selected];
    } else {
      ids = [photo.id];
      setSelected(new Set([photo.id]));
      setAnchorId(photo.id);
    }
    e.dataTransfer.setData(PHOTO_MIME, JSON.stringify(ids));
    // Firefox will not start a drag without some plain-text data.
    e.dataTransfer.setData("text/plain", ids.join(","));
    e.dataTransfer.effectAllowed = "move";
  }

  function stepPreview(direction: number) {
    if (previewIndex < 0 || detail.photos.length === 0) return;
    const next = (previewIndex + direction + detail.photos.length) % detail.photos.length;
    setPreviewId(detail.photos[next].id);
  }

  // Drop handling shared by the tray and folder cards.
  function dropProps(key: string, folderId: number | null) {
    return {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        const internal = hasType(e.dataTransfer, PHOTO_MIME);
        if (!internal && !hasType(e.dataTransfer, "Files")) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = internal ? "move" : "copy";
        if (dragOver !== key) setDragOver(key);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragOver((current) => (current === key ? null : current));
        }
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const internal = hasType(e.dataTransfer, PHOTO_MIME);
        if (!internal && !hasType(e.dataTransfer, "Files")) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(null);
        if (internal) {
          moveToFolder(readDraggedIds(e.dataTransfer), folderId);
          return;
        }
        void readDroppedFiles(e.dataTransfer).then(importFiles);
      },
    };
  }

  // Close the right-click menu on any click or resize.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  // Keyboard shortcuts. Re-attached on every render so handlers always see current state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      const key = e.key;

      if (previewPhoto) {
        if (key === "Escape") setPreviewId(null);
        else if (key === "ArrowRight") {
          e.preventDefault();
          stepPreview(1);
        } else if (key === "ArrowLeft") {
          e.preventDefault();
          stepPreview(-1);
        }
        return;
      }

      if (key === "Escape") setMenu(null);
      if (typing) return;

      const mod = e.ctrlKey || e.metaKey;
      const k = key.toLowerCase();

      if (mod) {
        if (k === "a") {
          e.preventDefault();
          setSelected(new Set(trayPhotos.map((p) => p.id)));
          setStatus(`Selected all ${plural(trayPhotos.length, "photo")} in the tray.`);
        } else if (k === "x") {
          e.preventDefault();
          cutSelected();
        } else if (k === "v") {
          e.preventDefault();
          pasteToActiveFolder();
        } else if (k === "z") {
          e.preventDefault();
          undo();
        } else if (k === "n") {
          e.preventDefault();
          createFolder();
        } else if (k === "o") {
          e.preventDefault();
          fileInputRef.current?.click();
        } else if (k === "e") {
          e.preventDefault();
          exportAll();
        }
        return;
      }

      if (key === "Delete") {
        if (selected.size > 0) {
          e.preventDefault();
          deletePhotos([...selected]);
        }
      } else if (key === "F2") {
        if (activeFolder) {
          e.preventDefault();
          startRename(activeFolder);
        }
      } else if (key === "Enter") {
        if (selected.size === 1) {
          e.preventDefault();
          setPreviewId([...selected][0]);
        }
      } else if (key === "Escape") {
        setSelected(new Set());
        setAnchorId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const trayOver = dragOver === "tray";

  return (
    <div
      className="flex min-h-screen flex-col"
      onDragOver={(e) => {
        if (hasType(e.dataTransfer, "Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!hasType(e.dataTransfer, "Files")) return;
        e.preventDefault();
        void readDroppedFiles(e.dataTransfer).then(importFiles);
      }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <Link href="/" className="text-sm font-medium text-slate-600 hover:text-emerald-700">
          ← All batches
        </Link>
        <input
          aria-label="Batch name"
          value={batchName}
          maxLength={120}
          onChange={(e) => setBatchName(e.target.value)}
          onBlur={saveBatchName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setBatchName(detail.batch.name);
              e.currentTarget.blur();
            }
          }}
          title="Click to rename this batch"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-slate-900 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:outline-none"
        />
        <span className="text-sm text-slate-500">
          {trayPhotos.length} in tray · {sortedCount} sorted · {detail.folders.length} item folder(s)
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2">
        <ToolButton title="Add photos (Ctrl+O)" onClick={() => fileInputRef.current?.click()}>
          Add Photos
        </ToolButton>
        <ToolButton title="Add every photo in a folder" onClick={() => folderInputRef.current?.click()}>
          Add Folder
        </ToolButton>
        <ToolButton title="Create an item folder (Ctrl+N)" onClick={createFolder}>
          New Item Folder
        </ToolButton>
        <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden />
        <ToolButton
          title="Cut selected photos (Ctrl+X), then click a folder and press Ctrl+V"
          disabled={selected.size === 0}
          onClick={cutSelected}
        >
          Cut
        </ToolButton>
        <ToolButton title="Undo the last move (Ctrl+Z)" disabled={undoStack.length === 0} onClick={undo}>
          Undo
        </ToolButton>
        <ToolButton
          variant="danger"
          title="Remove selected photos from the batch (Delete)"
          disabled={selected.size === 0}
          onClick={() => deletePhotos([...selected])}
        >
          Remove{selected.size > 0 ? ` ${selected.size}` : ""}
        </ToolButton>
        <div className="ml-auto" />
        <ToolButton
          variant="primary"
          title="Download every item folder as one ZIP (Ctrl+E)"
          disabled={sortedCount === 0}
          onClick={exportAll}
        >
          Export All (ZIP)
        </ToolButton>
      </div>

      <main className="grid flex-1 items-start gap-4 p-5 lg:grid-cols-[340px_1fr]">
        <section
          aria-label="Photo tray"
          {...dropProps("tray", null)}
          className={`flex flex-col rounded-xl border-2 bg-white p-3 lg:sticky lg:top-4 ${
            trayOver ? "border-emerald-500 bg-emerald-50" : "border-slate-200"
          }`}
        >
          <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>Photo tray</span>
            <span className="text-slate-500">{trayPhotos.length}</span>
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Photos not yet in an item folder. Drop photos here to take them out of a folder.
          </p>
          {trayPhotos.length === 0 ? (
            <div className="grid place-items-center rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              {detail.photos.length === 0
                ? "Drag photos from your file manager into this window, or click Add Photos."
                : "The tray is empty. Every photo is in an item folder."}
            </div>
          ) : (
            <div className="flex max-h-[70vh] flex-wrap gap-2 overflow-y-auto pr-1" role="group" aria-label="Unsorted photos">
              {trayPhotos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  selected={selected.has(photo.id)}
                  size={88}
                  onClick={(e) => handlePhotoClick(e, photo)}
                  onDoubleClick={() => setPreviewId(photo.id)}
                  onDragStart={(e) => handleDragStart(e, photo)}
                />
              ))}
            </div>
          )}
        </section>

        <section aria-label="Item folders" className="grid content-start gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {detail.folders.map((folder) => {
            const inFolder = photosByFolder.get(folder.id) ?? [];
            const isActive = activeFolderId === folder.id;
            const isOver = dragOver === `f${folder.id}`;
            const isRenaming = renamingFolder?.id === folder.id;
            return (
              <article
                key={folder.id}
                aria-label={`Item folder ${folder.name}`}
                {...dropProps(`f${folder.id}`, folder.id)}
                onClick={() => setActiveFolderId(folder.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActiveFolderId(folder.id);
                  setMenu({ x: e.clientX, y: e.clientY, folderId: folder.id });
                }}
                className={`flex min-h-[190px] flex-col rounded-xl border-2 bg-white p-3 transition ${
                  isOver
                    ? "border-emerald-500 bg-emerald-50"
                    : isActive
                      ? "border-blue-400 shadow-md"
                      : "border-slate-200 shadow-sm"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {isRenaming && renamingFolder ? (
                      <input
                        autoFocus
                        aria-label="Item folder name"
                        value={renamingFolder.value}
                        maxLength={120}
                        onChange={(e) => setRenamingFolder({ id: folder.id, value: e.target.value })}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            cancelRename.current = true;
                            e.currentTarget.blur();
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded border border-emerald-500 px-2 py-1 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                    ) : (
                      <h3
                        className="truncate font-semibold text-slate-900"
                        title="Double-click or press F2 to rename"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startRename(folder);
                        }}
                      >
                        {folder.name}
                      </h3>
                    )}
                    <p className="text-xs text-slate-500">{plural(inFolder.length, "photo")}</p>
                  </div>
                  <ToolButton
                    title="Export this item as a ZIP"
                    disabled={inFolder.length === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      exportFolder(folder);
                    }}
                  >
                    ZIP
                  </ToolButton>
                  <ToolButton
                    variant="danger"
                    title="Delete this folder. Its photos return to the tray."
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFolder(folder);
                    }}
                  >
                    Delete
                  </ToolButton>
                </div>

                <div className="mt-3 flex flex-1 flex-wrap content-start gap-1.5">
                  {inFolder.length === 0 ? (
                    <div className="grid w-full flex-1 place-items-center rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">
                      Drop photos here
                    </div>
                  ) : (
                    inFolder.map((photo) => (
                      <PhotoTile
                        key={photo.id}
                        photo={photo}
                        selected={selected.has(photo.id)}
                        size={72}
                        onClick={(e) => handlePhotoClick(e, photo)}
                        onDoubleClick={() => setPreviewId(photo.id)}
                        onDragStart={(e) => handleDragStart(e, photo)}
                      />
                    ))
                  )}
                </div>
              </article>
            );
          })}

          {detail.folders.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white/60 p-8 text-center sm:col-span-2">
              <p className="font-medium text-slate-800">No item folders yet.</p>
              <p className="mt-1 text-sm text-slate-600">
                Press <kbd className="rounded border border-slate-300 bg-white px-1">Ctrl+N</kbd> or click New Item Folder.
                Type what the item is, then drag its photos onto the folder.
              </p>
            </div>
          )}
        </section>
      </main>

      <footer className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-5 py-2 text-sm text-slate-700">
        <span aria-live="polite" className="flex items-center gap-2">
          {busy && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />}
          {status}
        </span>
        <span className="ml-auto hidden text-xs text-slate-400 xl:inline">
          Ctrl+click picks several · Shift+click picks a range · Drag onto a folder · F2 renames · Del removes · Double-click to view
        </span>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          importFiles(files);
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...FOLDER_PICKER_ATTRS}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          importFiles(files);
        }}
      />

      {previewPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
          className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 text-slate-100"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewId(null);
          }}
        >
          <div className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            <span className="truncate font-medium">{previewPhoto.originalName}</span>
            <span className="shrink-0 text-slate-400">
              {previewFolderName} · {previewIndex + 1} of {detail.photos.length} · ← → to move · Esc to close
            </span>
          </div>
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPreviewId(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={previewPhoto.id}
              src={`/api/photos/${previewPhoto.id}/file`}
              alt={previewPhoto.originalName}
              className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
            />
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => stepPreview(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl hover:bg-white/20"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => stepPreview(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl hover:bg-white/20"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {menu && menuFolder && (
        <div
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          className="fixed z-40 min-w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              setMenu(null);
              startRename(menuFolder);
            }}
          >
            Rename <kbd className="text-xs text-slate-400">F2</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100 disabled:text-slate-400"
            disabled={(photosByFolder.get(menuFolder.id)?.length ?? 0) === 0}
            onClick={() => {
              setMenu(null);
              exportFolder(menuFolder);
            }}
          >
            Export as ZIP
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-red-700 hover:bg-red-50"
            onClick={() => {
              setMenu(null);
              deleteFolder(menuFolder);
            }}
          >
            Delete folder
          </button>
        </div>
      )}
    </div>
  );
}
