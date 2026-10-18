# SnapSort — Identity Document & Prototype

The active SnapSort app: a standalone project containing the product identity document and the interactive prototype for a future Linux Mint desktop photo organizer. The separate Batch Photo Organizer app has been retired; practical batch workflow features are included here.

## What it does

- Read and edit the product identity document, categories, and product decisions.
- Try the guided **Drop → Preview & fix → Sort** flow.
- Use sample filenames or choose/drop actual photos. Actual selections are previewed locally in the browser; the image bytes are not uploaded to the app server.
- Review the suggested item folders, change a photo's folder, and tune the confidence threshold.
- For selected real photos, download a ZIP containing renamed copies arranged into folders and a `_snapsort_log.txt` mapping original names to new names. The originals are never moved or modified.
- Analyze selected photos with an experimental OCR + CLIP batch pass. OCR reads package text (including a 180° orientation check); CLIP suggests broad groups and specific items. Results appear on each photo, and OCR suggestions stay in Needs Review until you explicitly accept them. No files are moved automatically.
- Browse past batch plans, edit categories, and export the identity document as Markdown.
- Use batch-oriented organization and ZIP export without needing the retired app's server-side photo storage. This keeps the prototype's local-only image handling intact.

## Important prototype limitation

The draft sorter is still **filename-based** and is not a native Linux file manager. The separate browser CLIP comparison is experimental, uncalibrated, and advisory; it never sorts automatically. The web app stores batch names, filenames, and sorting decisions as history; original image files remain in the browser session. The ZIP download is created client-side from the currently selected files. If the page is closed or reloaded, select the files again to export them.

## Run independently

This is its own Next.js project. It requires Node.js, npm, and PostgreSQL.

1. Change into this folder and install this app's dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to this app's PostgreSQL database. The default is `snapsort_identity`; keep it separate from the Batch Photo Organizer database.
3. Create the database in PostgreSQL if needed, then run `npm run db:push` to create/update the schema.
4. Start the app with `npm run dev`.

The available scripts are `dev`, `build`, `start`, `lint`, `typecheck`, and `db:push`. This project intentionally has no root-level shared dependency setup.
