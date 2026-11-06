# PROJECT PLAYBOOK — Smart Bill Auditor & Expense Suite

> **FOR THE AI TOOL: READ THIS WHOLE FILE FIRST, THEN FOLLOW SECTION 1 EXACTLY.**
> You are not allowed to skip, merge or reorder phases. You are not allowed to start a new phase without the user's written approval.
> Talk to the user in **Urdu** (explanations, questions, reports). Code, comments, file names and UI strings stay in **English**.

---

## 0. HOW THE USER USES THIS FILE (for the human)

1. Put this file in the project folder (rename to `CLAUDE.md` for Claude Code, `AGENTS.md` for Codex/others, or keep it and say "read PROJECT_PLAYBOOK.md").
2. Tell the AI tool: **"Read PROJECT_PLAYBOOK.md and start."**
3. The AI shows a plan -> you reply `APPROVED PLAN` -> it builds -> it reports -> you test -> you reply `APPROVED 1A` (etc.) -> it prepares the next phase plan.
4. If you use a plain chat tool that cannot read/write files: paste this file once, and paste the `PROGRESS.md` text back at the start of every new chat.

---

## 1. WORKFLOW PROTOCOL (MANDATORY)

### 1.1 Session start
1. Read this file completely.
2. Look for `PROGRESS.md` in the project root. If it does not exist, create it from the template in Section 2. If it exists, read it and **resume from the recorded state** (do not restart finished phases).
3. Tell the user (in Urdu): current phase, its status, and what happens next. Then continue per the state machine below.

### 1.2 Phase state machine
Every phase moves through these states, in order. Record the current state in `PROGRESS.md` after every transition.

| State | What you do | You may continue when |
|---|---|---|
| `PLAN` | Write the phase plan (file tree, key decisions, risks, anything you recommend changing, questions). **No code.** | User writes `APPROVED PLAN` |
| `BUILD` | Write complete code for this phase only, file by file. Stop at a file boundary if output is long and say "continue?" | All deliverables written |
| `VERIFY` | Run the tests you can run, go through every Acceptance Criterion, mark each: Implemented / Not implemented / Unsure. List known limitations and manual tests for the user. | Report delivered |
| `REVIEW` | Wait. The user tests. If the user reports bugs, fix them inside this same phase and return to `VERIFY`. | User writes `APPROVED <phase id>` (e.g. `APPROVED 1A`) |
| `DONE` | Update `PROGRESS.md` (state, files, public APIs, decisions, limitations). Suggest a git commit/tag or zip named `phase-<id>-done`. Then immediately start the **next** phase at `PLAN` and show its plan. | — |

### 1.3 Hard rules
- **Never** begin `BUILD` without `APPROVED PLAN`, and **never** begin the next phase without `APPROVED <phase id>`. Silence, "ok", "continue" or "looks good" are NOT approval for a phase; ask the user to type the exact approval phrase.
- **Never** write code from a later phase "to save time". Out-of-scope means out.
- **No placeholders, TODOs, pseudo-code** or "implement later" in delivered code.
- Before writing any code, ask: is this necessary, can existing code be reused, can it be simpler? Reuse existing modules; do not duplicate.
- When modifying a file from an earlier phase, change the minimum, explain why, and re-run that phase's tests so nothing regresses.
- If a requirement here is wrong, risky or impossible (browser limits, API/CORS limits, etc.), **say so in the PLAN and propose an alternative**; do not silently deviate and do not silently ship something broken.
- If you are unsure about something, list it under "Unsure" in `VERIFY`. Never claim a criterion is met without checking it.
- Never invent library versions, model names or prices. Pin the versions you actually vendor; tell the user to verify provider model names/pricing on the provider's site.
- Keep `PROGRESS.md` accurate; it is the project's memory across sessions.

### 1.4 Approval phrases (tell the user these exact words)
- `APPROVED PLAN`
- `APPROVED 1A`, `APPROVED 1B`, `APPROVED 2`, `APPROVED 3`, `APPROVED 4`, `APPROVED 5`, `APPROVED 6`
- `FIX: <description>` -> fix inside the current phase
- `CHANGE: <description>` -> discuss impact first, then update this playbook's plan if the user agrees

---

## 2. PROGRESS.md TEMPLATE

```
# PROGRESS
Current phase: 1A
State: PLAN            (PLAN | BUILD | VERIFY | REVIEW | DONE)
Last updated: <date>

## Completed phases
(none yet)

## Project memory
- File tree: ...
- Public APIs (module -> exported functions + signatures): ...
- Data stores and fields (changes vs. data-model.md): ...
- Decisions made (and why): ...
- Known limitations / open issues: ...
- User preferences discovered: ...

## Phase log
<date> 1A PLAN written, waiting for APPROVED PLAN
```

---

## 3. PRODUCT SUMMARY

A standalone, offline-first web app (static folder served over HTTPS, PWA-capable) that scans bills (camera, upload, multi-page), audits them for errors, and tracks expenses, income, vendors, customers, inventory and reports. Sold as a digital product to households, professionals (doctors, lawyers, freelancers) and small shops, mainly South Asia and the Gulf but globally. It must feel premium, calm and trustworthy.

Deployment model: **one device per client copy, multiple local users** (Admin / Staff / Viewer) with shifts. No backend today; the data model must stay backend-ready.

---

## 4. MASTER RULES (apply to every phase)

### 4.1 Tech constraints
- HTML5, CSS3, vanilla JavaScript (ES2022) with native ES modules. No framework, no bundler, no build step needed to run.
- Libraries (Chart.js, pdf.js, optionally jsPDF) **vendored locally** in `/vendor` with pinned versions. No runtime CDN dependency.
- Fonts: Plus Jakarta Sans (UI) and Noto Nastaliq Urdu (Urdu bill text) as local woff2 subsets, always with a system fallback stack.
- Styling: hand-written CSS with design tokens (CSS variables). **No Tailwind CDN.**
- Works on current Chrome, Edge, Firefox, Safari (incl. iOS). Mobile-first. Desktop: left sidebar. Mobile: sticky bottom nav with prominent centre **Scan** button. Tap targets >= 44px.
- Camera and service worker need HTTPS/localhost. On `file://` degrade gracefully (`<input type="file" accept="image/*" capture="environment">`, no service worker, small notice).

### 4.2 Design rules (Editorial Flat Luxury)
- **No** box-shadow, text-shadow, gradients or background-image gradients anywhere (including Chart.js). Global: `* { box-shadow: none !important; text-shadow: none !important; }`.
- Hierarchy only via solid fills, `1px solid #E4DFD7` borders, whitespace, typography.
- Tokens: canvas `#FAF8F5`; card `#FFFFFF`; panel `#F3EFEA`; primary `#2F5D50` (hover `#23473C`); secondary `#D97762`; text `#1E201E`; muted `#686D68`.
- Status pills (solid fill + 1px border same hue): success `#E6F2EC`/`#2E7D5B`; warning `#FDF3E3`/`#B86B14` (verify WCAG AA 4.5:1; darken text if it fails and report the final value); error `#FCEAEA`/`#C93B3B`.
- Keyboard focus stays visible: `:focus-visible { outline: 2px solid #2F5D50; outline-offset: 2px; }`.
- UI language English, all strings in `/i18n/en.js` via `t('key')` (i18n-ready, RTL-ready with CSS logical properties).
- Every screen has designed empty, loading and error states.

### 4.3 Money rules (CRITICAL — one wrong rupee is unacceptable)
- All money = **integer minor units** (Rs. 150.75 = 15075). **Never floats** for money. Quantities = integer milli-units (2.5 kg = 2500). Rates = basis points (15% = 1500).
- ALL money arithmetic only in `/js/core/money.js`. No other file multiplies, divides, applies percentages or rounds money.
- One rounding rule app-wide: round half up, implemented once and documented.
- Totals (balances, stock, dashboard numbers) are **derived** from source records, never stored as editable numbers.
- Calculation order (line discount -> line tax -> invoice discount -> freight -> grand total; inclusive vs exclusive tax) is defined once in `money.js`.
- AI-extracted numbers are untrusted: validate and convert in one normalizer; never save as confirmed without user review.

### 4.4 Data rules
- IndexedDB is the **only** source of truth. UI re-reads from it after every write. No duplicate copies of business data in localStorage/globals.
- Every record has: `id` (UUID v4), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `shiftId`, `isDemo`, `schemaVersion`.
- Multi-record changes (delete + stock + balance) run in **one** IndexedDB transaction.
- Ordered schema migrations; never break existing data on upgrade.
- Scan/draft state is transient: cleared on cancel, on success, and at the start of every new scan.
- Role visibility enforced in ONE central data-access layer (Staff see only records they created; Admin sees all). UI never filters by role itself.
- UI copy must be honest: role control is an administrative control on one device, not bank-grade security.

### 4.5 Security & privacy
- PINs: PBKDF2 (WebCrypto) with per-user salt; lockout after 5 wrong attempts.
- AI API keys: entered by the user (BYOK), stored locally, never hard-coded, never logged, excluded from backups by default.
- Tell the user which provider receives bill images before any AI call.
- Visible disclaimer: record-keeping tool, not legal/tax/accounting advice.
- Escape all user/AI text on render; never inject raw data with innerHTML.

### 4.6 Coding standards
- Small single-responsibility modules, DRY, descriptive names, async/await with explicit error handling and friendly messages (no silent failures).
- Concise modern ES where it helps; **readability beats brevity**.
- English comments: file header (purpose), doc comment per exported function (what/inputs/outputs), "why" comments for non-obvious decisions and magic numbers. No dead code.
- Unit tests for all pure logic, runnable by opening a tests HTML page in a browser (no installs).
- Performance: lazy-load heavy libs; paginate/virtualise long lists (300+ lines must stay smooth); downscale images.

### 4.7 Folder structure (grow consistently)
```
/index.html  /manifest.json  /sw.js  /config.js (BUILD_MODE, APP_VERSION)
/css/ (tokens.css, base.css, components.css, layout.css)
/js/core/ (money.js, db.js, store.js, router.js, modules.js, auth.js, audit-log.js, utils.js, i18n.js)
/js/features/ (one folder per module)
/js/ui/ (modal, toast, table, form fields, charts)
/i18n/en.js
/vendor/   /tests/   /docs/
PROGRESS.md
```

---

## 5. PHASE MAP

| Phase | Name | Depends on |
|---|---|---|
| 1A | Foundation | — |
| 1B | Access & Safety | 1A |
| 2 | Scan Pipeline | 1A, 1B |
| 3 | Audit Engine | 2 |
| 4 | Business Module | 3 |
| 5 | Extras & Analytics | 4 |
| 6 | Demo Pack & Release | 5 |

---

## PHASE 1A — FOUNDATION

**Goal:** the invisible foundation everything depends on. No scanning, no business screens.

**Deliverables**
1. **Data model** in `/docs/data-model.md` AND implemented in `db.js`, designed for the whole product now. Stores: `meta`, `settings`, `users` (role admin|staff|viewer, pinHash, pinSalt, active), `shifts` (userId, openedAt, closedAt, openingCash, closingCash, expectedCash, status), `accounts`, `categories`, `parties` (vendor|customer|both, name, nameUrdu, contact, taxId, normalizedName, archived), `items` (canonicalName, nameUrdu, aliases[], sku, barcode, baseUnit, unitConversions[], minStock, reorderQty, sellingPriceMinor), `transactions` (type purchase|sale|expense|income|transfer|return|payment; source scan|manual; partyId, accountId, billNumber, billDate, dueDate, paymentMode, subtotalMinor, discountMinor, taxMinor, freightMinor, grandTotalMinor, printedGrandTotalMinor, status draft|confirmed, documentIds[], notes, tags[]), `transactionLines` (qtyBilledMilli, qtyReceivedMilli, unit, unitPriceMinor, printedLineTotalMinor, lineTotalMinor, taxRateBp, taxable, confidence, pageIndex, nameRaw, nameUrdu, itemId), `documents` (blobs, thumbnail, sha256, perceptualHash, pageIndex, groupId), `stockMovements`, `payments`, `recurringRules`, `budgets`, `apiUsage`, `auditLog` (append-only). Add indexes for every expected lookup (date, partyId, sha256, billNumber, normalizedName+billNumber+billDate, createdBy+shiftId).
2. **`money.js` + tests.** Pure functions, BigInt internally, throw on unsafe integers. API: `parseMoney`, `formatMoney` (USD, GBP, EUR, PKR, INR, AED, SAR, CAD, AUD with decimals/symbols), `add/sub/sum/negate`, `lineTotal(qtyMilli, unitPriceMinor)`, `percentOf`, `taxFromExclusive`, `taxFromInclusive`, `applyDiscount`, `invoiceTotals`, `allocate`, `splitEvenly` (parts always sum exactly), `compareWithTolerance`, `amountInWords(minor, currency, {system:'western'|'indian'})` (lakh/crore, million/billion, currency names). Tests in `/tests/money.test.html` (plain browser runner), **60+ cases**: 0.1+0.2, 1/3 splits across 3 and 7, 15% tax on odd amounts, inclusive/exclusive round trip, discount-then-tax, negatives, huge amounts, 0-decimal currency, qty 2.375 x price, 1,000 random invoices (parts sum = total), words edge cases (0, 100000, 10000000, paisa part).
3. **`db.js`**: promise wrapper; the only file touching `indexedDB`. `open()` with ordered migrations, `tx(stores, mode, fn)` for atomic multi-store work, CRUD + index queries + count, auto-stamping of common fields, `navigator.storage.persist()` on first run, readable quota/blocked errors, `deleteDatabase()` for later hard reset.
4. **Service worker + cache control.** `APP_VERSION` in `config.js`; cache name `app-<APP_VERSION>`; delete old caches on activate; network-first for HTML/JS/CSS, cache-first for fonts/vendor; "New version available — Reload" banner with `skipWaiting` only after the user taps; `clearAppCacheAndReload()` clears ONLY app caches (never IndexedDB); register only on HTTPS/localhost.
5. **`store.js`**: tiny UI-state store (never business data) with `resetTransientState()` called when entering any "new entry" screen.
6. **`modules.js` registry**: each module has `id, nameKey, icon, group, route, core, dependsOn[], defaultEnabled`. Register all planned modules now (mark unbuilt ones "coming soon"). `enable/disable` with dependency handling and user messages, persisted in settings. Navigation, routes and dashboard cards are generated ONLY from the registry. Disabling hides but never deletes data.
7. **UI shell**: hash router, responsive layout, tokens CSS, components (button, card, status pill, modal, toast, form fields, data table, empty/loading/error states), and a temporary **System Check** page (app version, schema version, persistence status, SW status, module toggles, link to tests).

**Out of scope:** login, shifts, settings page, delete flow, backup, scanning, AI, charts, demo data.

**Acceptance criteria**
1. `/tests/money.test.html` passes 60+ tests.
2. No floating-point or `toFixed/parseFloat/Math.round` money math outside `money.js` (grep check).
3. CRUD works on every store; a forced failure in a multi-store transaction leaves no partial data.
4. Bumping `APP_VERSION` shows the update banner and old caches disappear.
5. `clearAppCacheAndReload()` leaves IndexedDB intact.
6. Disabling a module removes nav, route and dashboard card; re-enabling restores them with data; dependency prompts work.
7. Layout OK at 360/768/1440px; no shadows/gradients (computed styles); focus outline visible.
8. Opens on `file://` without crashing (degraded notice).
9. Every file has a header comment; every exported function has a doc comment.

---

## PHASE 1B — USERS, SHIFTS, AUDIT, SETTINGS, SAFETY

**Prerequisite:** 1A files exist. Reuse them.

**Deliverables**
1. **Users, PIN login, roles** (`auth.js`): first-run creates Admin. Admin = everything; Staff = only own records, own shift report, **cannot delete**; Viewer = read-only. PBKDF2 hashing, 5-attempt lockout with countdown, idle auto-lock (configurable), Admin manages users. Central scoped-query access layer.
2. **Shifts:** Staff must open a shift (opening cash) before entering records; every record stamped with userId + shiftId. Close shift -> printable Shift Closing Report (counts, totals by payment mode, expected vs counted cash, difference). A newly logged-in user sees only their own records. Admin can filter by shift/user/date; every record permanently shows Entered by / Shift / Time.
3. **Audit log** (`audit-log.js`): append-only; logs logins, failed PINs, shift open/close, create/edit/delete, delete requests/decisions, module toggles, backups, restores, resets, settings changes. Entry = time, user, shift, action, entity, short summary (e.g. "Deleted Bill #1234 — Al-Noor Traders — Rs. 15,400"), outcome. **Never store the content of deleted records.** Admin-only viewer with filters + CSV export; no edit/delete of entries.
4. **Delete flow:** Admin deletes are **permanent** (one transaction incl. dependents). Confirmation dialog -> dependency check (e.g. vendor with 14 bills: delete them too, or archive the vendor and keep bills) -> delete -> 5-second Undo toast (commit after the window) -> audit entry. Setting "Ask for confirmation before delete" (default ON). Staff can only **request deletion** with a reason; Admin inbox approves/rejects; all audit-logged. After any delete/edit all dependent figures refresh from the DB immediately.
5. **Settings** (tabs): General (business/family name, logo, currency, western/indian number system, date format, tax rates, persona Business vs Personal/Professional terminology); Features (registry toggles + presets Household/Student, Professional, Shop/Business, Custom, with confirmation showing what changes); Security (users, idle lock, delete-confirmation toggle); Data (backup, restore, last-backup indicator + warning after 7 days, reminder, persistence status, "Clear App Cache & Reload", Reconciliation check stub); About (version, disclaimer, AI/privacy note); visible **Factory Reset** (checkbox + type `RESET`, offers backup first).
6. **Backup/Restore:** JSON with schemaVersion + checksum, images included (choose and justify format in PLAN), API keys excluded by default. Restore = Replace or Merge (UUID + updatedAt, newer wins; conflicting records open a Conflict screen: keep mine / keep imported / keep both). Validate before touching data; one transaction.
7. **Build Isolation & Hard Reset:** `BUILD_MODE: 'demo' | 'customer'` in `config.js`. In customer mode demo code paths and settings tabs are completely excluded and unreachable. In demo mode a shortcut (**Alt+Shift+D** / topbar badge) opens the Demo & Presenter Tools panel directly without secret backdoor PINs: Load Demo Data, Remove Demo Data (only `isDemo`), **HARD RESET**, Audit Log. Hard Reset wipes all IndexedDB, localStorage, sessionStorage, Cache Storage, unregisters the SW, reloads into onboarding; requires typing `RESET`, offers backup first.
8. **Onboarding wizard (~60 s):** welcome + disclaimer -> preset/persona -> currency + business name -> Admin PIN -> optional AI key later -> done. Simple Mode default for Household preset.

**Out of scope:** scanning, AI calls, charts, demo content, inventory/vendor screens beyond what delete/access need.

**Acceptance criteria**
1. Staff A creates 3 records in shift 1; Staff B sees none; Admin sees all with user/shift/time.
2. Staff cannot delete; request reaches Admin; approval removes permanently and figures update at once.
3. Deleting a vendor with bills triggers the dependency choice; no orphan rows remain.
4. Audit log covers all listed actions without deleted content; entries immutable in UI; CSV export works.
5. Five wrong PINs lock; PINs not visible in plain text in IndexedDB.
6. Backup -> Hard Reset -> Restore gives identical data; Merge conflict shows Conflict screen.
7. Hard Reset leaves IndexedDB, localStorage, Cache Storage and SW empty; onboarding appears.
8. Customer BUILD_MODE: shortcut does nothing, no Seller Panel reachable. Demo mode: shortcut opens PIN prompt.
9. Feature toggles/presets correctly show/hide nav, routes, dashboard cards.
10. Shift report totals match records to the last paisa.

---

## PHASE 2 — SCAN PIPELINE

**Prerequisite:** 1A, 1B. Module id `scan`.

**Goal:** photos/PDFs of a bill (one or many pages) -> cost-saving gates -> AI extraction into a DRAFT -> split-screen review. (Audit rules are Phase 3.)

**Deliverables**
1. **Capture UI:** two paths every time: live camera (`getUserMedia`, `facingMode: 'environment'`, frame guide, torch if supported; fallback `<input capture>`) and upload (gallery, drag-and-drop `.jpg/.png/.webp`, multi-page `.pdf` via lazy-loaded pdf.js). **Multi-Page Bill mode:** 1–10 pages (config), thumbnail tray, drag to reorder, delete, retake. All state transient and reset on start/cancel/success.
2. **Image prep:** downscale (default max side 2000px, configurable JPEG quality); optional auto-enhance with before/after preview (never silently applied to stored original); thumbnails.
3. **Quality Gate (before any AI call, local, free):** per page — blur (Laplacian variance), brightness/histogram clipping, minimum resolution, skew (best effort), content touching edges. Thresholds in Settings > Scan Quality with "Reset to defaults". On failure: plain-language message + buttons **Retake / Auto-enhance and re-check / Scan anyway** (warn, never hard-block).
4. **Pre-scan duplicate check (before any AI call):** Layer 1 SHA-256; Layer 2 dHash 9x8 with Hamming distance (default <= 10) using an in-memory index. On hit: modal with existing bill (thumbnail, date, vendor, total, reference) vs new page; buttons View existing / Not a duplicate — scan anyway / Cancel. Multi-page: check every page, show which matched. (Layer 3 is Phase 3.)
5. **AI Provider Layer:** one interface `extractBill({images, hints, languageHints})` returning normalized JSON + usage; `providers/gemini.js` is the only implementation now, but adding another provider must mean adding one file. Settings > AI: provider, masked API key, editable model name (tell the user to check provider docs; do not hard-code a model claim), Test connection, privacy notice, monthly usage counter, optional monthly limit. Request hygiene: downscaled images, structured JSON mode, timeout, max 2 retries with backoff on 429/5xx, **cache by image SHA-256**. Include a **CORS diagnostic**; if direct browser calls fail, say so and propose the smallest proxy; never fall back silently. No key / offline / failure = open the manual editor with page images.
6. **Extraction contract & multi-page merge:** header (vendor, contact, taxId, customer, billNumber, date, time, paymentMode, taxes[], discount, freight, printedGrandTotal, currencyHint, languages); lines[] (nameRaw, nameEnglish, nameUrdu, category, qtyBilled, unit, unitPrice, printedLineTotal, taxable, confidence 0–100, pageIndex, optional bbox). AI prompt rules (show the real prompt in PLAN): read English, Urdu script, Roman Urdu, handwritten bills; keep Urdu as-is plus English name; **copy printed numbers exactly, never calculate or correct**; unreadable = null + low confidence; flag Carried/Brought Forward rows; report page-overlap items. Multi-page: 3–4 pages per request, chunk with context for more; header from first page that has it, grand total from last page that has it, de-duplicate junction lines and tell the user what was merged, keep `pageIndex` per line. Result = ONE draft transaction. All AI numbers pass ONE normalizer using `money.js`; reject/flag nonsense.
7. **Split-screen editor:** desktop left = zoom/pan viewer with page tabs, right = header + line table; mobile = stacked with toggle. Clicking a line opens its page; confidence < 80 (configurable) shown in warning style. Add/remove/reorder lines, edit any cell, live totals via `money.js`, vendor autocomplete, Billed vs Received columns, per-line taxable toggle, payment mode, due date. Smooth with 300+ lines. **Save Draft** and **Confirm** (one transaction: transaction + lines + documents, stamped, audit-logged). Unsaved-changes guard.
8. **Receipt Vault (basic):** list with thumbnails, filters (date/vendor/status), original image viewer, role scoping.

**Out of scope:** math/tax audit, price-hike, Layer-3 duplicates, item matching, inventory effects, charts.

**Acceptance criteria**
1. Blurry, dark and tiny test images trigger the right gate message with **zero network requests**; "Scan anyway" proceeds.
2. Same file twice -> Layer 1 warning, zero AI calls; a new photo of the same bill is usually flagged by Layer 2; user can override.
3. A shuffled 4-page bill can be reordered, scanned, and becomes ONE draft (header page 1, total last page, junction duplicates merged and reported).
4. A page-3 line opens page 3 in the viewer.
5. No key or offline -> manual editor works and a bill can be confirmed.
6. Same image scanned twice (after override) makes one API request (cache).
7. 300-line bill scrolls and edits smoothly on a mid-range phone.
8. After Confirm/Cancel a new scan starts empty (nothing from previous bill or other user).
9. All amounts are integers in minor units; no float math outside `money.js`.
10. API key never appears in logs, default backups or audit log.

---

## PHASE 3 — AUDIT ENGINE

**Prerequisite:** 1A, 1B, 2. All logic in `/js/features/audit/` as **pure functions** (input: transaction + history; output: findings), reusable for manual entry later.

**Deliverables**
1. **Finding model:** `{id, severity: error|warning|info, code, lineId|null, message, expected, actual, diff, suggestedFixes[]}`; recomputed live while editing; stored with confirmed transactions; users may mark "Reviewed/accepted" with a note (audit-logged, still visible in history).
2. **Row math audit:** qtyBilled x unitPrice vs printedLineTotal with tolerance (default 1 minor unit). Coral row: "Printed: X | Calculated: Y | Diff: Z". Three one-click fixes: Fix total / Fix quantity (only if clean) / Fix unit price (only if clean); audit-logged, reversible until Confirm.
3. **Invoice audit:** sum(lines) +/- tax, discount, freight vs printed grand total, inclusive/exclusive, per-line taxable; plain-language explanation; ignore carried-forward rows; multi-page consistency check.
4. **Missing/confusion detector (amber):** missing qty/price/name/unit, unreadable line, confidence below threshold, zero/negative values, price outliers, future date, missing vendor/bill number, due date before bill date.
5. **Layer 3 duplicate:** fingerprint = normalizedVendor + billNumber + date + grandTotal; normalization (lowercase, strip punctuation/suffixes like traders/store/enterprises/ltd, Urdu/English variants); compact fuzzy vendor matching; looser "Possible duplicate" rule (same vendor + total + date within ±1 day + similar line count); same side-by-side modal.
6. **Item Master & matching:** Items list (canonical name, Urdu name, aliases, units, conversions kg<->g, dozen<->piece, category). Matching: exact alias -> normalized -> fuzzy (top 3) -> create new; each user choice adds an alias. Unit conversion before price comparison.
7. **Price-hike detector:** compare converted unit price with the vendor's previous purchase and recent average; "+X% higher than last purchase (Rs. A on DATE)"; threshold default 5%, configurable; per-vendor price-history view with a small flat Chart.js line chart (lazy loaded).
8. **Audit panel UI:** summary bar (N errors / N warnings / "Looks good"), per-row pills, "show only problems" filter, Confirm dialog listing unresolved errors (fix or knowingly accept). Extend the Reconciliation tool to re-run audits on saved bills.

**Tests:** `/tests/audit.test.html`, 40+ cases (exact match, 1-paisa difference, wrong printed total, wrong qty, inclusive vs exclusive tax, tax-exempt line, discount+freight, carried-forward rows, vendor name variants, Urdu/English alias, kg vs g compare, hike exactly at threshold).

**Out of scope:** inventory stock effects, POs, other charts.

**Acceptance criteria**
1. Qty 3 x 120 printed as 350 -> coral row "Printed 350 | Calculated 360 | Diff 10" + three fixes with live recalculation.
2. Wrong printed grand total flagged with plain explanation.
3. Low-confidence/missing fields amber; Confirm lists them.
4. Vendor spelling variants + same invoice/date/total detected as duplicate; a genuinely different bill is not.
5. "Sugar 50kg" and its Urdu alias resolve to one item; kg/g compare works.
6. A 12% increase shows the hike badge with correct figures.
7. All 40+ tests pass; audit functions have no DOM access.
8. Findings recompute correctly after edit/delete of historical bills.

---

## PHASE 4 — BUSINESS MODULE

**Prerequisite:** 1A–3. Everything toggleable via the registry (`vendors, customers, inventory, purchaseOrders, sales, ledger, taxReports`). Stock, balances and profit are ALWAYS derived.

**Deliverables**
1. **Vendors & Customers:** profiles, list + search, archived flag, 360° view with date range (This month / Last month / Custom): totals, payments, closing balance, **#1 most purchased/sold item badge** (by qty and value), itemised history with average price and % share, links to original bill images. Persona terminology via i18n.
2. **Payments & Ledger:** partial/advance payments, running ledger, receivables/payables aging (0–30, 31–60, 61–90, 90+), printable statements, copy-ready WhatsApp reminder text, due-date reminder bar on the dashboard.
3. **Inventory:** stock = sum of `stockMovements`; purchase confirmation adds ONLY received qty; sales reduce stock; adjustments (loss/damage/theft/correction) with reason; stock-take; reorder levels; low-stock list; unit conversions; optional batch/expiry toggle with expiring-soon list; configurable negative-stock policy (block/warn/allow).
4. **Billed vs Received & Debit Notes:** shortage value via `money.js`, printable numbered Vendor Shortage Claim / Debit Note, vendor balance effect, open-claims list (open/resolved/written off). Purchase and sales returns as credit/debit notes adjusting stock and balances.
5. **Purchase Order & Pay Order:** choose a vendor -> auto-fill items where stock <= reorder level (+ unfulfilled shortages) with suggested qty and last purchase price, zero typing, all editable; branded printable PO. Pay Order/Payment Voucher with figures and words (`amountInWords`, western/indian), payee, reference bills, signature block. Gap-free configurable document numbering inside a DB transaction.
6. **Sales & margin:** sales invoices (with or without scanning), quotation -> invoice, discount, tax, payment status, branded print; margin per item and invoice using **weighted average cost** (document it), COGS derived.
7. **Tax & financial reports:** multiple rates, inclusive/exclusive, withholding toggle, tax summary (collected vs paid) with CSV export, Profit & Loss, simple Cashflow, Balance-sheet-style summary. State the basis (accrual/cash) and the disclaimer on each report. Extend Reconciliation: recompute stock, balances and report totals and flag any mismatch to the last paisa.

**Out of scope:** budgets, recurring, khata, barcode, voice, split expenses, 5-chart dashboard, demo data.

**Tests:** `/tests/business.test.html`, 40+ cases (partial payments/aging, shortage claim with tax, stock after short delivery, negative-stock policies, weighted average cost, margin on discounted sale, gap-free numbering, words on vouchers, deleting a bill restores stock and balances exactly).

**Acceptance criteria**
1. Receiving 90 of 100 billed adds 90 to stock, creates a debit note for exactly the shortage value, lowers the vendor payable accordingly.
2. Vendor selection pre-fills below-reorder items with no typing; print is branded and numbered.
3. Pay order for Rs. 1,25,000.50 prints correct Indian-system words, and correct western words when switched.
4. Deleting a purchase bill (Admin) removes stock movements and payments in one transaction; balances, stock and reports update instantly; Reconciliation shows zero differences.
5. Aging buckets match a hand-calculated example exactly.
6. P&L and tax summary match source transactions to the last paisa on a 200-record dataset.
7. Staff see only parties/bills they created unless Admin widens it in Settings (enforced in the access layer).

---

## PHASE 5 — EXTRAS & ANALYTICS

**Prerequisite:** 1A–4. Each item is a separate toggleable module. Build one module at a time and report a checkpoint after each (plan -> code -> acceptance), but still wait for the phase-level approval at the end.

**Deliverables**
1. **Manual entry & Quick Add:** Quick Add (amount, category, account, date, note, optional photo; under 5 seconds; big keypad; remembers last category/account); full manual entry reusing editor components; income tracking; transfers between accounts; tags, notes, custom categories; search + advanced filters; learning auto-categorisation; accounts/wallets (Cash, Bank, Card, Easypaisa/JazzCash/UPI-style) with derived balances.
2. **Budgets & Recurring:** monthly category budgets with progress bars and alerts at 80%/100% (once, not repeatedly); recurring rules with correct month-end handling (31st -> last day) and catch-up after long absence (user confirms); "Bills due" bar.
3. **Family & South-Asia:** Khata/Udhaar ledger (balances, instalments, due dates, WhatsApp text); Committee/BC tracker; split expenses with `allocate` (parts sum exactly) and minimal settlement list; client-billable expenses + reimbursement invoice for professionals; savings goals, debt payoff, net worth; warranty/return tracker; optional Zakat calculator (an aid, not a religious ruling).
4. **Barcode & Voice:** `BarcodeDetector` where available (graceful fallback message); Web Speech API voice entry producing a DRAFT the user must confirm, parser separate from UI for future Urdu/Hindi.
5. **Dashboard & 360 analytics** (flat solid Chart.js, lazy loaded): income vs expense; spending by category doughnut; vendor supply share; customer sales share; top bought vs top sold board. Global date-range selector; all numbers computed from source at render time; widgets generated from the registry; colour-blind-safe solid palette; data-table toggle for each chart.
6. **Reports & exports:** printable monthly report (print CSS; jsPDF only if justified), CSV exports (transactions, parties, tax), shareable summary text; role-scoped.
7. **Bank statement CSV import:** column mapping, preview, duplicate detection, category suggestions, nothing saved before confirmation.
8. **Notifications, security, PWA polish:** in-app notification centre (due bills, low stock, budget, backup reminder); optional WebAuthn app lock; optional AES-GCM encrypted backups (warn that a lost passphrase is unrecoverable); manifest, icons, install prompt, offline fallback; Dark mode as a second solid flat palette (AA contrast, no shadows/gradients); i18n completeness check (no hard-coded strings).

**Out of scope:** demo pack, release packaging.

**Acceptance criteria**
1. Quick Add saves in <= 5 seconds of interaction; dashboard updates immediately.
2. Budget alerts fire once; Jan 31 recurring -> Feb 28/29 correct.
3. Splitting Rs. 1,000 among 3 sums to exactly 100000 minor units; settlements minimal.
4. Disabling Khata/Split/Barcode/Voice/Budgets removes nav, routes, widgets, notifications; re-enabling restores data.
5. All five charts match hand-calculated totals; the table toggle shows identical numbers.
6. A 500-row CSV import works with mapping, flags duplicates, saves nothing before confirmation.
7. PWA installs over HTTPS; offline launch works.
8. Light and dark palettes pass contrast checks, no shadows/gradients.
9. Reconciliation shows zero differences after a scripted run of 300 mixed operations.

---

## PHASE 6 — DEMO PACK, GUIDED TOUR, QA, RELEASE

**Prerequisite:** 1A–5 complete.

**Deliverables**
1. **Demo data engine** (`/js/demo/`): 100% synthetic (invented names, shops, phones, tax ids; no real brands); every record `isDemo = true`; dates **relative to today**; deterministic (seeded random); goes through normal db transactions and audit log. "Remove Demo Data" deletes ONLY `isDemo` records and what derives from them; loading over real data is refused or clearly warned. Supporting data: ~8 vendors, ~6 customers, 40–60 items (Urdu + English), stock/reorder levels, 3–4 months history, 3 accounts, budgets, Admin + two staff on different shifts.
   **The 50 demo records:** 12 clean bills · 5 math-error bills · 4 missing-field/low-confidence · 3 duplicates (same file / new photo / same metadata) · 4 price-hike (one vendor, rising prices) · 3 short-delivery with debit notes · 2 multi-page long bills (3 pages, 100+ lines) · 4 mixed Urdu/English · 6 sales invoices with visible margins · 3 PO/Pay Order examples · 4 recurring/utility bills with upcoming due dates.
2. **Synthetic bill image generator:** render fake bills on canvas (thermal receipt, A4 GST-style invoice, handwritten-style Urdu/English parchi using the bundled Nastaliq font, and a slightly rotated/blurred variant for Quality Gate demos). Feeds Receipt Vault and editor. Generate on demand; do not ship dozens of image files.
3. **Guided Demo Tour:** optional overlay: scan -> quality check -> duplicate warning -> audit findings + Fix Math -> vendor 360 -> inventory + auto PO -> dashboard charts -> staff vs admin views -> reports. Also write `/docs/tour-script.md` with the same steps and suggested voice-over lines for video ads.
4. **Two editions:** documented script/checklist producing (a) Demo Build (`BUILD_MODE 'demo'`: Seller Panel, demo loader) and (b) Customer Build (`'customer'`: no Seller Panel code reachable, no demo loader, visible Factory Reset only, empty DB, onboarding on first run). Include per-client unique link/subdomain advice, `APP_VERSION` bump procedure, cache-busting verification.
5. **Final QA:** `/docs/qa-checklist.md` covering every phase's criteria on iPhone Safari, Android Chrome, desktop Chrome/Edge/Firefox; security review (PIN storage, API key handling, role-bypass attempts via URL hash, XSS review of every place that renders user/AI text, CSP meta recommendation, import validation); performance review (5,000 transactions, 300-line bills, startup, memory with 10 page images); data-safety review (backup/restore round trip, persistence, iOS storage eviction note); accessibility review; dead-code/duplication sweep; honest list of remaining limitations.
6. **Customer package** (markdown, ready for PDF): Quick-Start guide; free hosting guide (Netlify/GitHub Pages/any static host, HTTPS, custom domain, 5 steps); privacy & AI note (what is sent to the provider, BYOK, cost-control tips); backup & device-sync guide; FAQ/troubleshooting (camera permission, cache/update, storage eviction); licence note + disclaimer (record-keeping tool; single-device role control explained honestly).

**Acceptance criteria**
1. "Load Demo Data" produces exactly the 50 categorised records + supporting data in under 10 seconds; charts, aging, low-stock and due-date bars all show meaningful values.
2. "Remove Demo Data" leaves real records untouched; Reconciliation shows zero differences.
3. Synthetic bill rendering and vault preview work fully offline.
4. After changing the system date by +30 days the demo still looks current.
5. Customer Build has no Seller Panel code path, no demo records, starts at onboarding.
6. Every item in `qa-checklist.md` is ticked on at least one iOS and one Android device.
7. A test string like `<img src=x onerror=alert(1)>` in a vendor name, item name and note is rendered harmlessly everywhere.

---

## 6. FIRST ACTION (AI tool: do this now)

1. Read `PROGRESS.md` (create it if missing).
2. Greet the user in Urdu, state the current phase and state.
3. If state is `PLAN` for Phase 1A: produce the Phase 1A plan (file tree, decisions, risks, recommendations, questions) and ask the user to reply **`APPROVED PLAN`**. Write no code yet.
