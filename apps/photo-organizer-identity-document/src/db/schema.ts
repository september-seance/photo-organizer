import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// A "batch" is one photo pile or session (for example "Earbuds pile, May 2026").
export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// An "item folder" is a named group of photos for one thing being sold.
export const folders = pgTable(
  "folders",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("folders_batch_idx").on(table.batchId)],
);

// A "photo" is SnapSort's own copy of an imported image. Originals are never touched.
// folderId = null means the photo is still in the photo tray.
export const photos = pgTable(
  "photos",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    folderId: integer("folder_id").references(() => folders.id, { onDelete: "set null" }),
    originalName: text("original_name").notNull(),
    storagePath: text("storage_path").notNull(),
    thumbPath: text("thumb_path"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
    // Set every time a photo is placed into a folder. Controls order inside a folder.
    folderedAt: timestamp("foldered_at", { withTimezone: true }),
  },
  (table) => [
    index("photos_batch_idx").on(table.batchId),
    index("photos_folder_idx").on(table.folderId),
  ],
);
