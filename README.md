# SnapSort

The active product in this repository is the **Identity Document & Prototype**, a guided photo-organizing prototype for Linux Mint.

**Active app:** [`apps/snapsort-identity-prototype`](apps/snapsort-identity-prototype/README.md)

It combines the product identity document with a Drop → Preview & fix → Sort flow. Useful batch-organizer functions have been incorporated where they fit the prototype: actual local photo previews, folder assignment corrections, batch history, renamed ZIP export with an old-name → new-name log, and a clear guarantee that the selected originals are not changed. An experimental batch OCR + CLIP analysis now runs locally in the browser and adds evidence to each photo's preview. OCR suggestions require explicit user acceptance; CLIP remains advisory. The selected image data stays in the browser; the app stores the filename-based sorting plan and history.

## Scope and limitations

- The draft sorter is still filename-based. The separate browser CLIP comparison is experimental and advisory; it never sorts automatically.
- ZIP export runs in the browser and uses photos selected during the current session. Re-select them after closing or reloading the page.
- Only the identity/prototype project is an active, maintained app. The standalone Batch Photo Organizer working copy has been retired.
- The original extracted folders (`apps/photo-organizer-identity-document*`) and ZIPs remain as historical source snapshots; they are not the supported app entry points.

See the active app's README for setup and database instructions.
