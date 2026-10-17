# SnapSort: Project Identity

> This document is the north star for the project. Read it before adding a feature.
> If a proposed change conflicts with this document, change the document first, on purpose, and note why.

---

## 1. One-line identity

**SnapSort is a point-and-click desktop-style app for Linux Mint that turns a pile of product photos into named, renamed, ready-to-upload folders for resale listings, with no terminal, no commands, and no setup knowledge required.**

---

## 2. The problem

- A reseller may have 50 to 500 photos of 10 to 40 different items (for example, a dozen pairs of Bose earbuds) dumped into one folder from a phone.
- Before each item can be listed on eBay, OfferUp, Facebook Marketplace, or Craigslist, the photos need to be grouped by item, given consistent names, and exported.
- Doing this by hand in a file manager is slow and error-prone. Renaming 300 files one at a time is miserable.
- The earlier Python prototype (`organize_photos.py` plus a PySimpleGUI front end) tried to automate this with AI and a Windows-style GUI. It was hard to install, depended on a 500 MB model download, and got product models wrong. It was also built around command-line thinking.
- The user is switching from Windows to Linux Mint. Terminal-first tools feel tedious and foreign. The user needs a tool that feels like the Windows apps they already know.

**The core need:** sort and rename a large batch of photos into item folders quickly, using clicks and drags the user already understands, and end with a folder that is ready to upload.

---

## 3. Who it is for

### Primary persona: "Dana, the weekend reseller"
- Sells used electronics and collectibles part-time, mostly on eBay and OfferUp.
- Recently moved from Windows 10 to Linux Mint (Cinnamon) and is still learning where things are.
- Comfortable with Windows File Explorer, drag and drop, right-click menus, and Ctrl+C / Ctrl+V.
- Uncomfortable with terminals, `sudo`, `pip`, file paths typed by hand, and error messages that mention Python tracebacks.
- Has a phone full of photos and a laptop with no GPU. Patience is limited. Time spent on the tool must feel like time spent on the listing.

### Secondary persona: "Sam, the occasional seller"
- Clears out a garage once a year. Maybe 40 photos. Wants a result in under 15 minutes without reading a manual.

### Not the persona (for now)
- Developers who want to script bulk operations. The tool may be scriptable later, but the interface is for people who do not script.

---

## 4. Core promise

1. **You stay in charge.** The app never silently decides what something is. It helps, and you confirm.
2. **You can see everything.** Every photo is visible. Every folder shows its contents. Nothing is hidden in a database or a log file.
3. **It behaves like a Windows app you already know.** Familiar shortcuts, familiar menus, familiar dialogs.
4. **It ends in a folder you can upload from.** The output is a plain folder of renamed images on your disk.
5. **Your photos stay on your machine.** No upload to a cloud service, no account, no tracking.

---

## 5. Guiding principles

| # | Principle | What it means in practice |
|---|-----------|---------------------------|
| P1 | **No terminal, ever** | Every task is possible with a mouse or keyboard inside the app. Setup instructions may mention a terminal once, but daily use never does. |
| P2 | **Windows-familiar, Mint-native** | Use Windows-expected shortcuts (Ctrl+A, Ctrl+Click, Delete, F2 to rename, Enter to open). Use Mint's conventions (Cinnamon-style window chrome, `~/Pictures` and `~/Downloads` as default locations). |
| P3 | **Visible state beats hidden state** | Show counts, show what is unsorted, show what will be exported. The user should never wonder "did that work?" |
| P4 | **Forgiving by default** | Ask before deleting. Make moves reversible. Never overwrite an existing export without asking. |
| P5 | **Human in the loop** | Automation proposes, the human disposes. Suggestions (later, AI-assisted) are always one click to accept or ignore. |
| P6 | **Plain language** | "Item folder", "Photo tray", "Export to folder". Not "batch ID", "CLIP embedding", or "classification confidence". |
| P7 | **Fast for big piles** | 300 photos must feel usable. Thumbnails load lazily. Multi-select works on the whole grid. |
| P8 | **Local-first** | Runs on the user's machine. Photos and database live on disk under the user's home folder. |
| P9 | **Small surface area** | Do fewer things, do them well. Resist adding settings, modes, and toggles. |

---

## 6. Scope

### 6.1 In scope for the current build (MVP)

- **Batches.** Create a named batch (for example, "Earbuds pile, May 2026"). List, open, rename, and delete batches.
- **Import photos.** Drag photos or whole folders from the file manager into the window, or click "Add Photos" / "Add Folder". Supports JPG, JPEG, PNG, WEBP, and GIF. BMP is excluded because browsers cannot display it reliably.
- **Photo tray.** A thumbnail grid of photos not yet placed in a folder.
- **Item folders.** Create an item folder with a plain name ("Bose QC45 Black"). Rename it. Delete it (its photos return to the tray).
- **Sorting.** Drag one or more photos onto a folder card. Or select photos, then click "Move to folder" and pick a folder.
- **Selection.** Click to select one, Ctrl+Click to add or remove, Shift+Click to select a range, Ctrl+A to select all in the tray, Esc to clear.
- **Preview.** Double-click a photo to view it full size. Left and right arrows move between photos.
- **Renaming on export.** Exported photos are named from the folder, for example `bose-qc45-black-01.jpg`, `bose-qc45-black-02.jpg`.
- **Export.** Download one folder as a ZIP, or export all folders as a ZIP with one subfolder per item. Each ZIP contains only renamed copies. Originals are never modified.
- **Delete photo.** Remove a photo from the batch after confirmation. The original file on disk is not touched because the app stores its own copy.

### 6.2 Explicitly out of scope for the MVP

- AI or automatic recognition of items (see Roadmap, Phase 2).
- Creating listings, writing titles, pricing, or posting to marketplaces.
- Accounts, logins, multi-user sync, or cloud storage.
- Image editing (cropping, background removal, brightness).
- Mobile layouts. The target is a laptop or desktop window.
- Installers for other operating systems. Linux Mint is the reference platform. Other systems may work but are not tested.

---

## 7. Key user journeys

### Journey A: First sort (the happy path, target under 20 minutes for 300 photos)
1. Open SnapSort from the desktop icon. The browser opens to the home screen.
2. Click **New Batch**. Type "Earbuds pile, May 2026". Press Enter.
3. Drag the whole photo folder from Nemo (Mint's file manager) into the window. Thumbnails appear in the tray.
4. Click **New Item Folder**, type "Bose QC45 Black", press Enter.
5. Ctrl+Click the six photos of that item in the tray, then drag them onto the "Bose QC45 Black" card.
6. Repeat for each item. Use **Select All** and Ctrl+Click as needed.
7. When the tray is empty (or the leftover photos are deliberately discarded), click **Export All**. Choose where to save. Done.

### Journey B: Fix a mistake
1. A photo landed in the wrong folder.
2. Drag it to the correct folder, or select it and press **Ctrl+X** then select the target folder and **Ctrl+V**. (Cut and paste is a Windows habit and is supported.)
3. Folder counts update immediately.

### Journey C: Come back later
1. Reopen SnapSort. The home screen lists batches with a progress bar ("142 of 300 sorted").
2. Click a batch. Everything is exactly where it was left.

### Journey D: Export a single item
1. Right-click an item folder card, choose **Export as ZIP**.
2. Save the ZIP to `~/Downloads` (the browser default).

---

## 8. Interaction conventions (the Windows-to-Mint bridge)

| Action | Expected shortcut or gesture | Notes |
|--------|------------------------------|-------|
| Select one | Click | |
| Add or remove from selection | Ctrl+Click | |
| Select a range | Shift+Click | |
| Select all in tray | Ctrl+A | Only when focus is in the workspace |
| Clear selection | Esc | |
| Move selected to folder | Drag onto folder card, or Ctrl+X then Ctrl+V on folder | Cut and paste is the Windows habit |
| Open preview | Double-click, or Enter when a photo is focused | |
| Next or previous photo in preview | Right and Left arrow keys | |
| Close preview | Esc | |
| Rename folder | F2 or double-click the name | Matches Windows and Nemo |
| Delete selected photos | Delete key | Always asks for confirmation |
| New item folder | Ctrl+N | Chrome and Firefox reserve some shortcuts; the toolbar button always works |
| Import photos | Ctrl+O, or drag files into the window | |
| Export all | Ctrl+E | |
| Right-click | Context menu on photos and folders | Menu items use plain verbs |

Visual conventions:
- Selected photos have a clear blue outline, like Windows Explorer.
- Drop targets light up when a drag is over them.
- Destructive buttons are red and always confirm first.
- Every list shows a count.
- Empty states explain what to do next in one sentence.

---

## 9. Linux Mint specifics

- **Reference desktop:** Linux Mint with the Cinnamon desktop. Default file manager is Nemo. Default browser is Firefox.
- **Launch:** The app opens in the default browser at a local address. A desktop launcher (`.desktop` file) is provided so the user can click an icon. The user never types an address.
- **Default folders:** Imports default to the last-used folder (remembered). Exports default to `~/Downloads` or `~/Pictures/SnapSort`.
- **No root or `sudo` in daily use.** Anything that needs installation is done once, through the setup script, and documented in one place.
- **Dialogs:** Use the system file picker (GTK on Mint) for import and export. Do not invent a custom folder browser.
- **Look:** Light theme, neutral colors, system font. Should not look out of place next to Nemo.

---

## 10. Naming and output conventions

These rules determine what the user uploads, so they must be predictable.

- **Folder names** are exactly what the user typed, trimmed. Used as-is for display.
- **Export folder slug** is lowercase, words separated by hyphens, with punctuation removed. Example: "Bose QC45 (Black)!" becomes `bose-qc45-black`.
- **Photo filenames on export:** `<slug>-<NN><ext>`, where `NN` is zero-padded to the number of photos in that folder (minimum 2 digits). Example: `bose-qc45-black-01.jpg`.
- **Original extension is kept.** Extensions are lowercased.
- **Order inside a folder** is the order the photos were added to the folder. Ties go to the file's original import order.
- **Export ZIP name:** `<batch-slug>-<item-slug>.zip` for one item, `<batch-slug>-all.zip` for everything.
- **Original files are never renamed or deleted.** SnapSort keeps its own copies inside its data folder.

---

## 11. Technical identity

| Layer | Choice | Why |
|-------|--------|-----|
| Application | Next.js (App Router) with TypeScript | One codebase for UI and API. Familiar to web developers. Runs locally. |
| Database | PostgreSQL via Drizzle ORM | Reliable, inspectable with standard tools, and the template already provides it. |
| Image storage | Files on local disk, referenced by path in the database | Keeps the database small and lets the user see the files if they look. |
| Export | Server-side ZIP generation (JSZip) | Single download for the user, no temporary folders to manage. |
| Styling | Tailwind CSS | Already wired in the template. |
| Interaction | Native HTML drag and drop and keyboard handlers | No heavy UI library. Predictable behavior. |

Constraints:
- No external API calls in the MVP. Nothing leaves the machine.
- No login. The app assumes a single local user.
- Must work with a laptop CPU and no GPU.
- Thumbnails (400 px) are generated on the server at import time, so 300 large phone photos do not freeze the window.

---

## 12. Success criteria

The MVP is successful when all of the following are true:

1. A first-time user, with no instructions, can create a batch, import 100 photos, make 5 item folders, sort all photos, and export, without opening a terminal or reading documentation.
2. Sorting 300 photos into about 30 items takes under 30 minutes for a non-technical user.
3. Every action is reachable in 3 clicks or fewer from the workspace, or by a single keyboard shortcut.
4. The exported folders can be uploaded directly to eBay, OfferUp, or Facebook Marketplace without renaming anything.
5. Closing the browser and reopening the app loses no work.
6. Deleting anything asks first. Exporting never overwrites a previous export silently.
7. The app opens from a desktop icon on Linux Mint Cinnamon.

---

## 13. Lessons carried forward from the Python prototype

| What happened | What we learned | What we do now |
|---------------|-----------------|----------------|
| CLIP zero-shot classification could not reliably tell a Bose QC45 from a Sony WH-1000XM4. | Generic image classifiers are good at "earbuds" and poor at specific models. | The human names and groups items. Recognition is optional and comes later as a suggestion. |
| Brand and model were guessed from filenames with regular expressions. | Filenames from phones are usually meaningless (`IMG_4382.jpg`). | Filenames are never used to guess product identity. |
| The GUI was PySimpleGUI, a Windows-leaning toolkit with a licensing history. Code included `os.startfile`. | Cross-platform and Linux-first matter. | Web technology runs on Mint without Python packaging issues. |
| The first run downloaded a 500 MB model. | Heavy setup kills adoption. | No model download in the MVP. Install is a small set of standard packages. |
| The user said command-line tools feel tedious. | The primary interface must be visual from the first screen. | No CLI for daily use. |
| Output was copied, not moved, with a folder per guess. | Users want a clean result they can trust, not a folder explosion. | Explicit folders created by the user. Export is clear and previewable. |

---

## 14. Non-goals (things we will refuse to do, even if asked)

- We will not require a terminal for regular use.
- We will not upload photos to a third-party service in the MVP.
- We will not modify or delete the user's original files.
- We will not add accounts or sync.
- We will not auto-create folders without the user seeing and confirming them.

---

## 15. Roadmap

**Phase 1: Sort and export (this build).** Everything in section 6.1.

**Phase 2: Helpful suggestions.** Optional. Suggest which folder a photo belongs to, based on similarity to photos the user has already placed. Uses a small local model if the user opts in. Every suggestion is accept or ignore. Never automatic.

**Phase 3: Listing helpers.** Optional. Export a CSV with folder name, photo count, and a blank title and description column. Draft titles from the folder name. No posting.

**Phase 4: Easy install.** Package as a single installer for Linux Mint (for example, a `.deb` or AppImage) that bundles the database and starts the app from the desktop menu.

Each phase must keep the principles in section 5 intact. If a phase breaks P1 (no terminal), it does not ship.

---

## 16. Decision log

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| D1 | Web app (Next.js) instead of a Python desktop GUI | Easier to make look and behave like modern software. Drag and drop and keyboard handling are well understood. Avoids Python packaging on Mint. | Current |
| D2 | Human-first sorting, AI deferred | Reliability and trust matter more than automation for resale listings. | Current |
| D3 | Store copies of images in app data, not in-place | Protects originals and avoids surprise changes. | Current |
| D4 | Export as ZIP plus renamed copies | Matches how sellers upload and how the user moves files on Mint. | Current |
| D5 | Single local user, no login | Reduces friction. The data never leaves the machine. | Current |

---

## 17. Glossary

| Term | Meaning |
|------|---------|
| **Batch** | One photo session or pile. Contains many photos and many item folders. |
| **Photo tray** | The area that shows photos not yet placed in an item folder. |
| **Item folder** | A named group of photos for one thing you are selling. |
| **Import** | Bringing photos into a batch. The app stores its own copy. |
| **Export** | Producing renamed copies of photos as a ZIP download. |
| **Slug** | A lowercase, hyphenated version of a name, safe for filenames. |
| **Move** | Putting a photo into an item folder (or back to the tray). Only changes SnapSort's record, not the original file. |

---

## 18. Open questions and default answers

These were decided to avoid blocking progress. Change them here if the user disagrees.

| Question | Default chosen |
|----------|----------------|
| Should deleting an item folder delete its photos? | No. Its photos return to the tray. |
| Can one photo belong to two item folders? | No. One photo, one folder. Keeps exports unambiguous. |
| Maximum photos per batch? | No hard limit. Thumbnails are loaded lazily to keep the window responsive. |
| Is there an undo? | Moves can be undone with Ctrl+Z within the session. Deletes always confirm and are not undoable. |
| Where are photos stored? | In the app's data folder under the user's home directory. |
| Should the app run on startup? | No. The user opens it from the desktop icon. |

---

## 19. How to use this document

- **Before building a feature:** check it against sections 4, 5, and 14. If it fails any, rethink it.
- **Before naming something:** check section 17 and use the plain-language terms.
- **Before choosing a technology:** check section 11 and the decision log.
- **Before shipping:** check section 12. Every item must be true.
- **When the user changes their mind:** update this document first, then the code.
