import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";

export const identitySections = pgTable("identity_sections", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  num: text("num").notNull(),
  title: text("title").notNull(),
  kicker: text("kicker").notNull().default(""),
  groupLabel: text("group_label").notNull().default("Core"),
  body: text("body").notNull().default(""),
  bullets: text("bullets").notNull().default(""),
  status: text("status").notNull().default("draft"), // locked | draft | decision
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  groupLabel: text("group_label").notNull().default("General"),
  isDefault: boolean("is_default").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sourceLabel: text("source_label").notNull().default("~/Pictures/To Sort"),
  destLabel: text("dest_label").notNull().default("~/Pictures/Listings"),
  threshold: real("threshold").notNull().default(0.7),
  total: integer("total").notNull().default(0),
  folders: integer("folders").notNull().default(0),
  status: text("status").notNull().default("sorted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull(),
  category: text("category").notNull().default("uncategorized"),
  brand: text("brand").notNull().default(""),
  folderName: text("folder_name").notNull().default("Uncategorized"),
  newName: text("new_name").notNull(),
  confidence: real("confidence").notNull().default(0),
  method: text("method").notNull().default("filename"),
  thumb: text("thumb").notNull().default(""),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  context: text("context").notNull().default(""),
  decision: text("decision").notNull().default(""),
  status: text("status").notNull().default("decided"), // decided | open | rejected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
