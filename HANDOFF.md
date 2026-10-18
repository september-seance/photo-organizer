# SnapSort session handoff

**Updated:** 2026-10-17
**Repository:** `september-seance/photo-organizer`
**Required working branch:** `arena/c1f21515-photo-organizer` (do not switch branches)
**Active app:** `apps/snapsort-identity-prototype/`

## User goal and preferences

The user is organizing photos of boxed products for personal use and wants practical, step-by-step help combining OCR and CLIP without taking close-ups of many packages. Photos should stay local in the browser. Explain that OCR/CLIP model resources may download on first use. Keep OCR and CLIP advisory: **every actual selected photo must remain in Needs Review until the user explicitly accepts OCR or chooses a category**. Never silently sort by model output. When OCR and CLIP disagree, show the OCR suggestion, keep the photo in Needs Review, and require an explicit user decision. The user prefers proceeding one step at a time and pausing when a manual action is required.

The user is currently on a phone and cannot engage with the app preview. **Do not ask them to test or interact with the preview right now.** The next meaningful manual test can happen when they are back at a computer.

## What is implemented

The previous iteration only changed a one-photo diagnostic summary. The current refactor implements a real batch analysis path:

- Select multiple actual image files in the prototype, then click **Analyze selected photos**.
- `analyzeSelectedPhotos()` runs OCR and CLIP sequentially for every selected image and tracks progress.
- OCR checks the original and 180-degree orientations. CLIP shows broad-group and specific-item suggestions on the corresponding photo card.
- Per-photo cards show OCR category/quality, CLIP suggestions, a fusion explanation, and optionally the extracted OCR text.
- Each actual image defaults to **Needs Review**, even if its filename looks classifiable. It leaves review only after explicit OCR acceptance or manual category selection.
- The batch POST path explicitly passes `Uncategorized` for each unaccepted actual photo so the server-side filename classifier cannot silently sort those photos either. A selected OCR/manual override wins. API history marks forced `Uncategorized` entries as `needs review` with confidence 0 rather than as user-fixed.
- When PostgreSQL data is unavailable, the local UI falls back to the built-in category list so the user can still accept/change categories and analyze photos. Saving persistent batch history still requires PostgreSQL.
- Actual image bytes stay in the browser. ZIP export is client-side; it makes organized copies and leaves originals unchanged. CLIP remains an experimental relative prompt comparison, not calibrated confidence and not automatic sorting.

## Validation / current status

Latest checks passed in `apps/snapsort-identity-prototype/`:

```text
npm run lint
npm run typecheck
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/snapsort_identity npm run build
git diff --check
```

The database is not available in this sandbox (`127.0.0.1:5432` refuses connections). The app root responds HTTP 200, but database-backed endpoints such as `/api/data` and `/api/health` return 500. Local OCR/CLIP analysis and local ZIP creation do not depend on the database.

The preview server was restarted after the final production build and is currently on port **3001** (process ID recorded by the tools as `snapsort-batch-review-preview-9f97a58b`). It may not persist into the next session; check the process/port before starting another server. If restarting, use the active app directory and bind to `0.0.0.0`; avoid starting multiple servers on the same port.

No end-to-end batch analysis has yet been tested by the user with actual selected photos. Do not claim that OCR/CLIP accuracy or the user-facing batch experience has been verified. The next user test should be just 2–3 actual photos of boxed products (no close-ups needed), at a computer: open Try the Prototype, select files, click **Analyze selected photos**, then verify cards/results and that unaccepted photos stay in Needs Review. First-use model download/inference may take time.

## Important files

- `apps/snapsort-identity-prototype/src/app/SnapSortApp.tsx` — main UI, batch analysis state/function, per-photo review controls, actual-photo Needs Review behavior, effective overrides, ZIP export.
- `apps/snapsort-identity-prototype/src/lib/browser-ocr.ts` — local browser OCR, original/180-degree pass.
- `apps/snapsort-identity-prototype/src/lib/clip-image-test.ts` — local Transformers.js CLIP pipeline and prompt comparisons.
- `apps/snapsort-identity-prototype/src/lib/classifier.ts` — filename/text keyword rules and built-in categories. Filename sorter remains a demo, separate from advisory CLIP.
- `apps/snapsort-identity-prototype/src/app/api/batches/route.ts` — applies explicit overrides and preserves Needs Review status for forced Uncategorized entries.
- `apps/snapsort-identity-prototype/README.md` and root `README.md` — updated scope and limitations.

## Git/workspace notes

All work must remain on `arena/c1f21515-photo-organizer`. No commit or push was requested or made. At last check, the root README was modified and `apps/snapsort-identity-prototype/` was untracked as a newly created active app; this reflects the workspace history, so inspect `git status` before deciding what to stage. `.next/`, `node_modules/`, and TypeScript build info are ignored; do not add generated artifacts or model caches. `HANDOFF.md` itself is newly added for continuity.

Do not switch branches, reintroduce the retired standalone Batch Photo Organizer, enable automatic CLIP sorting, or ask the user to take product close-ups. The app's product sorter is still filename-based for filename-only/sample input; be clear that OCR/CLIP analysis of actual selected images is a separate advisory review stage.
