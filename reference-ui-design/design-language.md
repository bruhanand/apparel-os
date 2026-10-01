# RetailsOps design language

Status: **Approved for build: Step 2, revision 2, 24 Sep 2026.** Replaces the previous `docs/product/design-language.md` (G-01).
Source of truth: `Step 2 - Design System v2.dc.html`. If this document and the design file disagree, raise it; do not guess.

Decisions this language implements: G-01 (minimal, subtle glass on chrome only), G-02 (empty logo slot), G-03 (English (India), ₹, Indian grouping, DD MMM YYYY), G-04 (state colours), G-05 (comfortable density, light and dark), G-07 (multi-scope), G-08 (Restricted fields), G-12 / G-14 (PT grid), G-23 (trust chip), G-25 (in-app notifications only), G-28 (till lease).

---

## 1. Principles

1. **Solid where people read and type, glass only on chrome.** Glass is used for the top bar, drawers, popovers, toasts and dialogs. Tables, forms, the PT grid and the till are always solid.
2. **Navy means action, never state.** The accent is used only for primary actions, links, selection and focus. States have their own colour families (§7).
3. **Colour is never the only signal.** Every state carries a word and a glyph, errors carry text, and changed cells carry a corner marker.
4. **Numbers are exact and aligned.** Tabular figures, right-aligned, Indian grouping. Blank means unknown and 0 means known zero (§8).
5. **Show the limit next to the button.** Approvals show the policy band, and maker ≠ checker, right beside Approve.
6. **Nothing hides focus.** Sticky bars, drawers and toasts never cover the focused element (§9).

---

## 2. Colour tokens

Palette: **Sand & Navy** (option 2b). All pairs are checked against WCAG 2.2 AA in both themes: text 4.5:1 (1.4.3), control boundaries and focus 3:1 (1.4.11).

| Token | Use | Light | Dark | Contrast L / D |
|---|---|---|---|---|
| `--bg` | Page background | `#f7f5f0` | `#111214` | decorative / surface |
| `--surface` | Cards, tables, fields, till panels | `#fffefb` | `#191a1d` | decorative / surface |
| `--sunken` | Table header/footer, derived PT cells, skeletons, disabled fields | `#f0ede6` | `#15161a` | decorative / surface |
| `--raised` | Solid menus, date picker | `#ffffff` | `#212226` | decorative / surface |
| `--border` | Dividers and card edges (decorative only) | `#ddd8cc` | `#33343a` | decorative / surface |
| `--control` | Borders of inputs, checkboxes, secondary buttons | `#8a8478` | `#76716a` | 3.68 / 3.60 vs `--surface` (min 3) |
| `--text` | Primary text | `#1a1a1c` | `#eceae6` | 17.23 / 14.48 vs `--surface` (min 4.5) |
| `--text-2` | Secondary text, labels, table headers | `#4d4a44` | `#b3aea5` | 8.75 / 7.88 vs `--surface` (min 4.5) |
| `--text-3` | Help text, placeholders, captions | `#66625a` | `#959087` | 5.57 / 5.91 vs `--bg` (min 4.5) |
| `--accent` | Primary action, links, selection, focus ring | `#1f3a68` | `#9db8e8` | 11.17 / 8.66 vs `--surface` (min 4.5) |
| `--accent-hover` | Primary hover / pressed | `#172d52` | `#b6cbf0` | 13.58 / 10.60 vs `--surface` (min 4.5) |
| `--on-accent` | Text/icons on accent | `#ffffff` | `#111214` | 11.27 / 9.33 vs `--accent` (min 4.5) |
| `--tint` | Selected row, scope chip, bulk bar, active nav | `#e4e9f2` | `#1f2b42` | decorative / surface |
| `--on-tint` | Text on tint | `#1a3160` | `#c8d8f5` | 10.43 / 9.85 vs `--tint` (min 4.5) |
| `--hover` | Row hover | `#f5f2ec` | `#1f2024` | decorative / surface |
| `--danger` | Destructive button fill | `#b3261e` | `#ff8a80` | 6.48 / 7.62 vs `--surface` (min 3) |
| `--on-danger` | Text on destructive | `#ffffff` | `#111214` | 6.54 / 8.21 vs `--danger` (min 4.5) |

### Glass, scrim, shadow

| Token | Light | Dark |
|---|---|---|
| `--glass` | `rgba(255,254,251,.70)` | `rgba(25,26,29,.66)` |
| `--glass-border` | `rgba(26,26,28,.10)` | `rgba(236,234,230,.10)` |
| `--scrim` | `rgba(26,26,28,.32)` | `rgba(0,0,0,.55)` |
| `--sh1` | `0 1px 2px rgba(40,34,20,.06), 0 1px 1px rgba(40,34,20,.04)` | `0 1px 2px rgba(0,0,0,.4)` |
| `--sh2` | `0 4px 12px rgba(40,34,20,.08), 0 1px 3px rgba(40,34,20,.06)` | `0 4px 14px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.35)` |
| `--sh3` | `0 18px 44px rgba(40,34,20,.16), 0 2px 8px rgba(40,34,20,.08)` | `0 20px 48px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.4)` |

Glass surfaces use `backdrop-filter: blur(16px) saturate(1.2)` (drawers: `blur(18px)`) with a 1 px `--glass-border` hairline. Text on glass always uses the normal text tokens.

### Theme

- The default is **Match device** (`prefers-color-scheme`). It updates live when the OS setting changes.
- The user can override it in **My profile › Theme**: Match device · Light · Dark. The choice is stored on the user, not the browser.
- The till and the shared store tablet follow the device unless the store setting overrides it.
- Apply the theme before first paint, so it never flashes the wrong one. Switch without a reload.

---

## 3. Typography

- UI: **Source Sans 3** (400, 500, 600, 700).
- Mono: **Source Code Pro** (400, 500), used for codes only: SKU, barcode, doc no., bill no., error reference, key caps.
- Every number in a table, total, band or KPI uses `font-variant-numeric: tabular-nums`.
- The minimum size is **12 px**, for labels and captions only.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| display | 32 / 38 | 600 | Record title on large screens |
| title | 28 / 34 | 600 | Page title |
| h1 | 24 / 30 | 600 | Section heading |
| h2 | 18 / 24 | 600 | Panel heading, drawer title |
| h3 | 16 / 22 | 600 | Card heading |
| body | 14 / 20 | 400 | Default text, table cells |
| body-sm | 13 / 18 | 400 | Secondary lines, meta |
| label | 12 / 16 | 600 | Field and group labels |
| caption | 12 / 16 | 400 | Help text, trust chip |
| mono | 13 / 18 | 400 | Codes (Source Code Pro) |
| kpi | 22 / 28 | 600 | Values in panels and tiles |
| till-total | 40 / 44 | 700 | Till “To pay” |

Till and portal body text is 15 / 22.

---

## 4. Spacing, sizes, radius

### Spacing (4 px base)

| Token | px | Typical use |
|---|---|---|
| space-1 | 4 | Icon gap |
| space-2 | 8 | Chip gap, inline gap |
| space-3 | 12 | Cell padding, field gap |
| space-4 | 16 | Card padding |
| space-5 | 20 | Panel padding |
| space-6 | 24 | Section gap |
| space-8 | 32 | Page gutter |
| space-10 | 40 | Block gap |
| space-12 | 48 | Touch target |
| space-16 | 64 | Major section |

Lay out sibling groups with flex or grid plus `gap`, not margins.

### Sizes (comfortable density, G-05)

| Element | Size |
|---|---|
| Table row | 40 px (PT grid row 36 px) |
| Input, default button | 36 px |
| Small button, pager | 28 px |
| Top bar: back office / portal / mobile | 56 / 64 / 56 px (+ safe area) |
| Sidebar open / collapsed | 232 / 64 px |
| Till and portal touch targets | ≥ 48 px; till Pay 64 px |
| Mobile rows and controls | ≥ 44 px |
| Drawer width | 420 px (640 px for a PT preview); full screen on mobile |
| Minimum target (2.5.8) | 24 × 24 px; 16 px checkboxes sit in ≥ 40 px hit areas |

### Radius

4 (checkbox, keycap, restricted chip) · 6 (inputs, buttons, table frame) · 8 (cards, menus, till tiles) · 12 (drawers, dialogs, popovers, toasts, portal cards) · 999 (badges, chips, counters).

---

## 5. Elevation and glass rules

| Level | Surface | Shadow | Radius | Used for |
|---|---|---|---|---|
| e0 · Flat | `--surface` + `--border` | none | 6 | Tables, forms, PT grid, till, reconciliation |
| e1 · Card | `--surface` + `--border` | `--sh1` | 8 | Panels, KPI tiles, approval panel |
| e2 · Menu | `--raised` + `--border` | `--sh2` | 8 | Dropdowns, date picker, solid popovers |
| e3 · Glass | `--glass` + `--glass-border` + blur | `--sh3` | 12 (top bar 0) | Top bar, drawers, scope popover, column-fill popover, toasts, dialogs, mobile nav drawer |

Rules:

- **Glass only at e3.** Never use glass on tables, forms, the PT grid, the till (including its top bar) or any data-entry surface.
- Content inside a glass drawer or popover sits on **solid cards** (`--surface`). The glass is the frame, never the reading surface.
- A modal drawer or dialog puts `--scrim` over the page. A non-modal drawer has no scrim, and the page gets right padding equal to the drawer width.
- The back-office sidebar is **solid** (`--surface`).
- Browsers without `backdrop-filter` fall back to `--surface` at 100% opacity.

---

## 6. Layout: shells

### A · Back office (desktop-first, responsive)

- **Top bar:** 56 px of glass, sticky, and content scrolls under it. Order: logo slot (200 × 32, empty until supplied, G-02) · scope chip · search/scan field (“Search or scan: SKU, barcode, doc no., bill”, Ctrl K) · My work counter · Alerts · theme switch · avatar.
- **Sidebar:** solid, 232 px, collapsible to 64 px. It lists only the role’s sections (RBAC v1). The active item uses `--tint` / `--on-tint` at weight 600. Open-item counts are right-aligned in `--text-2`.
- **Page header:** breadcrumb (body-sm) · title (28/34) · status badge · scope chip · context line · **one** primary action plus secondary actions.
- **Body:** stepper or tabs, then workspace (table, grid or form). The right drawer holds preview, exception, approval or history.
- **Below 1024 px:** the sidebar becomes a glass drawer from the left and the header actions go into a “More” menu.

### B · Till

- **All solid, no sidebar**, keyboard and scanner first. Design size 1366 × 768.
- **Status bar:** 52 px. Logo slot · store and till · connection pill (Online ✓ Done · Offline · n queued ! Attention · Lease expired ✕ Stopped) · lease text · date and time · cashier + Sign out.
- **Lease expired (G-28):** a red banner under the status bar says new bills are blocked and viewing and upload still work. Pay is replaced by a disabled “Pay blocked · lease expired” button.
- **Left:** the scan field (56 px), which always has focus, a bill-level salesperson picker, and the lines table (60 px rows; salesperson per line).
- **Right (420 px):** Add customer (F2) · subtotal, offers, GST included · To pay (till-total) · tenders (52 px tiles) · Pay (64 px, F12).
- **Function bar:** 52 px. F2 Customer · F3 Salesperson · F4 Park · F5 Recall · F6 Return · F7 Manager PIN · F9 X-report · Esc Void line.
- After any action, focus returns to the scan field.

### C · Portal

- Glass top bar (64 px) with **top tabs**, no sidebar, 48 px targets.
- **Self-service:** Check-in · My attendance · My targets · My payslips · Profile.
- **Partner / EBO:** Dashboard · Uploads · Statements · Ledger. The scope chip is locked to the partner’s sites.
- On the shared store tablet, check-in signs the user out automatically.
- On phones the tabs become a bottom bar.

### D · Mobile

- Same routes as desktop. Glass top bar with menu (44 px), logo slot and My work.
- The sidebar becomes a glass drawer from the left: 300 px wide, scope chip at the top, 44 px rows, profile at the bottom.
- **Scan to receive:**
  - Camera viewfinder, which also accepts a Bluetooth or handheld scanner into the same field.
  - Condition segmented control: Good · Damaged · Wrong (48 px). It stays selected until changed.
  - A last-scanned card with a running count against the invoice, and a progress bar (“1,186 of 1,252 counted”) with a split by condition.
  - A recent-scans list.
  - A solid bottom bar: Undo last · Finish count.
  - Each scan confirms with a sound, a vibration and the card.

---

## 7. State colours (G-04)

### Families

| Family | Glyph | Tokens | Light bg / fg (ratio) | Dark bg / fg (ratio) | Meaning |
|---|---|---|---|---|---|
| Neutral | ○ | `--n-bg` / `--n-fg` | `#ece9e2` / `#4a463f` (7.74:1) | `#2a2a2e` / `#c9c5bd` (8.31:1) | Not started, or finished and closed with nothing left to do |
| Pending | ◔ | `--i-bg` / `--i-fg` | `#e3ebfb` / `#1e4aa8` (6.75:1) | `#1c2b4d` / `#a9c2ff` (7.89:1) | Waiting for someone else: approval, sync, reply |
| Moving | ▸ | `--p-bg` / `--p-fg` | `#d9eff0` / `#0c5f66` (6.17:1) | `#133a3d` / `#8fd9df` (7.74:1) | Physically on the way or being worked through |
| Done | ✓ | `--s-bg` / `--s-fg` | `#dcf1e4` / `#1b6b3a` (5.53:1) | `#173726` / `#8fdcac` (8.07:1) | Final and in force; can be relied on |
| Attention | ! | `--w-bg` / `--w-fg` | `#fbeccf` / `#7d4a00` (6.31:1) | `#3d2c0e` / `#f2c475` (8.26:1) | Blocked or needs a decision; not an error yet |
| Stopped | ✕ | `--d-bg` / `--d-fg` | `#fbe3e1` / `#a1261d` (6.11:1) | `#43191a` / `#ffaaa3` (8.28:1) | Undone, rejected or failed; history always kept |
| Quarantine | ◆ | `--q-bg` / `--q-fg` | `#f1e3f6` / `#7a2690` (6.80:1) | `#36193f` / `#e3b0f2` (8.60:1) | Unsellable goods kept apart: damage, unknown identity |

### All 30 states

| # | State | Family | Glyph | Where it appears |
|---|---|---|---|---|
| 1 | Draft | Neutral | ○ | Booking, PT, adjustment, offer, count, return notice |
| 2 | Cancelled | Neutral | ○ | Transfer before dispatch, booking, bill |
| 3 | Closed | Neutral | ○ | Booking, count, RTV, exception |
| 4 | Ended | Neutral | ○ | Offer, EOSS period |
| 5 | Submitted | Pending | ◔ | PT, adjustment, offer, damage report |
| 6 | Awaiting approval | Pending | ◔ | Any record in maker/checker |
| 7 | Queued | Pending | ◔ | Till sync queue, export |
| 8 | Partly received | Pending | ◔ | Booking, transfer |
| 9 | In transit | Moving | ▸ | Transfer dispatch, RTV shipment |
| 10 | In progress | Moving | ▸ | Stock count, delivery steps |
| 11 | Dispatched | Moving | ▸ | Transfer, RTV |
| 12 | Official | Done | ✓ | PT, GRN, bill, adjustment |
| 13 | Approved | Done | ✓ | Transfer request, offer, RTV |
| 14 | Live | Done | ✓ | Offer, till lease |
| 15 | Accepted | Done | ✓ | Delivery (put away), excess |
| 16 | Resolved | Done | ✓ | Exception |
| 17 | Held | Attention | ! | Receiving hold, excess on hold |
| 18 | Short | Attention | ! | Delivery, transfer dispatch |
| 19 | Excess | Attention | ! | Delivery |
| 20 | Offline | Attention | ! | Till connection |
| 21 | Stale | Attention | ! | Trust chip, sync |
| 22 | Reversed | Stopped | ✕ | PT, bill, adjustment |
| 23 | Rejected | Stopped | ✕ | PT, damage report, transfer |
| 24 | Failed | Stopped | ✕ | Sync, export, delivery |
| 25 | Conflict | Stopped | ✕ | Till sync |
| 26 | Lease expired | Stopped | ✕ | Till |
| 27 | Quarantine | Quarantine | ◆ | Stock bucket, quarantine transfer |
| 28 | Damaged | Quarantine | ◆ | Damage report, GRN line |
| 29 | Unidentified | Quarantine | ◆ | GRN line, count |
| 30 | Write-off pending | Quarantine | ◆ | Write-off and dispose |

Rules:

- Badge: 22 px high, radius 999, padding 0 9 px, 12 px / 600, glyph (11 px) + word. Never show the glyph without the word.
- A record shows **one** status badge: its lifecycle state. Line-level conditions (short, damaged…) appear as chips in the line’s Disposition cell.
- New states must join an existing family. Adding a family needs a design review.

---

## 8. India formatting (G-03)

| Kind | Format | Example | Notes |
|---|---|---|---|
| Money · record, total, till | ₹ + Indian grouping + 2 decimals | ₹1,23,456.00 | |
| Money · crore | full grouping | ₹3,41,26,000.00 | Never millions or billions |
| Money · compact | L / Cr, 2 decimals | ₹12.65 L · ₹3.41 Cr | Dashboard tiles only; the exact value shows on hover or focus |
| Money · in tables | no ₹ in cells; “Value (₹)” in the header | 3,41,26,000.00 | So the decimals line up |
| Negative | true minus sign U+2212 | −₹4,200.00 · −12 | No brackets, never red alone |
| Quantity | Indian grouping, whole numbers | 1,08,420 pcs | |
| Zero | 0 / 0.00 | 0 | Known zero (counted, nothing there) |
| Unknown | **blank cell** | | Screen readers say “unknown”. Never a dash for numbers. Totals exclude blanks and a trust chip says so. |
| Date | DD MMM YYYY | 23 Sep 2026 | Input also accepts 23/9, 23-09-26 |
| Date and time | DD MMM YYYY, HH:mm (24-hour) | 23 Sep 2026, 10:42 | |
| Range | shared parts not repeated | 1–25 Sep 2026 | en dash |
| Percent | integer or 1 decimal | 96% · 50.0% | Changes are shown in pp: −2.4 pp |
| Bill no. | mono | BILL/BLR01/2627/004381 | Financial year 2627 = FY 2026–27 |

Alignment:

- All numbers are right-aligned with tabular figures.
- Money always shows 2 decimals, so the decimal points line up.
- Quantity columns carry the unit in the header: “Qty (pcs)”.
- Totals rows have a 2 px `--control` top border, a `--sunken` background and weight 700.

---

## 9. Accessibility (WCAG 2.2 AA)

- **Contrast:** see §2 and §7. All text is ≥ 4.5:1, and control borders and the focus ring are ≥ 3:1, in both themes.
- **Focus visible (2.4.7):**

  | Element | Focus treatment |
  |---|---|
  | Buttons, chips, links | 2 px `--accent` ring with a 2 px gap (`box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent)`, or outline 2 px + offset 2 px) |
  | Table rows and grid cells | 2 px inset outline |
  | Till | 3 px ring |

  The ring shows for keyboard focus only, never for mouse clicks.
- **Focus not obscured (2.4.11):**
  - `scroll-padding-top` equals the top bar (56) plus any sticky header (for example 40).
  - An open non-modal drawer adds `scroll-padding-right` equal to its width.
  - Toasts never take focus and never cover the focused element.
- **Dialogs and drawers:**
  - Focus moves in and is trapped.
  - Esc closes, and focus returns to the control that opened it.
- **Skip link:** “Skip to content” is the first tab stop on every page.
- **Keyboard:**

  | Area | Keys |
  |---|---|
  | Tables | ↑↓ move · Space select · Enter open |
  | PT grid | arrows move one cell · Enter edit · Esc cancel · Ctrl D fill down · F8 next error |
  | Till | every action has a function key |
- **Target size (2.5.8):** at least 24 × 24 px everywhere; 48 px on the till and portal.
- **Motion:** skeleton pulses and transitions turn off under `prefers-reduced-motion`.
- **Announcements:** toasts use a polite live region. Blocking errors use `role="alert"`.

---

## 10. Components

Each entry covers anatomy, states and usage rules.

### 10.1 Button

- **Anatomy:** label (14 / 500–600), optional key hint (mono 12, 1 px border, radius 4).
- **Variants:**

  | Variant | Style | When |
  |---|---|---|
  | Primary | `--accent` fill, `--on-accent` text | The one main action |
  | Secondary | `--surface`, 1 px `--control` border | Other actions |
  | Ghost | transparent, `--accent` text, hover `--tint` | Low-emphasis actions |
  | Destructive | `--danger` fill, `--on-danger` text | Reverse, write off, reject |
- **Sizes:** 28 (small) · 36 (default) · 48 (touch) · 64 (till Pay).
- **States:**
  - Hover: primary → `--accent-hover`; secondary and ghost → `--hover` / `--tint`.
  - Focus ring: see §9.
  - Disabled: dashed `--control` border, `--sunken` fill, `--text-2` or `--text-3` label. Set the native `disabled` attribute, and give a tooltip or inline reason.
- **Rules:**
  - At most **one primary** per view (header, drawer footer, dialog).
  - Destructive actions always ask for a reason.
  - Button text is a verb phrase (“Approve PT”, “Record shortage”).

### 10.2 Status badge

- See §7.
- Use in lists, record headers and drawers.
- Never make a badge clickable. Filters use filter chips (10.9).

### 10.3 Scope chip (G-07)

- **Anatomy:** pill 30–32 px, `--tint` / `--on-tint`, 13 / 600, label + ▾.
- **Label:**
  - One site: its code (“BLR01”); several: “3 sites”.
  - Brands follow the same rule: one brand’s name, otherwise “2 brands”.
  - Everything allowed: “All sites · All brands” (neutral outline).
- **Popover (e3 glass, 340 px):**
  - Two checkbox lists, Sites and Brands, showing only what the user can access.
  - A footer with that note and **Apply**.
  - Changes don’t apply until Apply.
- **Rules:** every page shows its active scope. On records, the chip shows the record’s own site and brand, read-only. Partner users get it locked.

### 10.4 Trust chip, “as of · complete %” (G-23)

- **Anatomy:** 24 px pill, `--sunken` + `--border`, 12 px `--text-2`, with a state marker:

  | State | Marker | Example |
  |---|---|---|
  | Complete | ● `--s-fg` | “as of 23 Sep 2026, 10:42 · 100%” |
  | Partial | ◆ `--w-fg` | “… · **96% complete**” (bold amber) |
  | Stale | ! `--d-fg` | “as of 22 Sep 2026, 18:00 · **stale**” |
  | Refreshing | | “Refreshing…” |
- **Tooltip / focus:** names what is missing (“3 of 72 store days not synced”).
- **Rules:** on every metric, KPI, dashboard tile and reconciliation. It sits next to the heading, right-aligned.

### 10.5 My work counter

- **Anatomy:** “My work” (13 / 500) + a 20 px pill.
- **States:**

  | State | Pill |
  |---|---|
  | Count | `--accent` / `--on-accent` |
  | Overdue | `--danger` / `--on-danger`, “n overdue” |
  | 100 or more | “99+” |
  | Zero | plain “0” in `--text-3`, no pill |
- **Count:** approvals waiting for the user plus exceptions they own that are not yet Resolved. Seen, Acknowledged and Resolved are tracked separately inside My work.

### 10.6 Restricted field and cell (G-08)

- **Field:** 36 px, `--sunken`, 1 px `--border` (not `--control`, so it doesn’t look editable), with a lock glyph and “Restricted” in `--text-2` / 500. Help: “You don’t have permission to see this value.”
- **Table cell:** a right-aligned chip, 24 px, radius 4, `--sunken`, lock + “Restricted” 12 / 600. `aria-label="<column>: restricted"`.
- **Rules:**
  - The value is **never sent to the browser**.
  - Restricted columns can’t be sorted, filtered or totalled.
  - Exports leave the column out.
  - Never show a masked value like “₹•••”.

### 10.7 Form fields

- **Anatomy:** label above (13 / 600; required = red * plus the word “Required” for screen readers) · control (36 px, radius 6, 1 px `--control`) · help or error below (12 / 16).
- **States:**

  | State | Treatment |
  |---|---|
  | Default | as above |
  | Hover | 1 px `--control` border |
  | Focus | 1 px `--accent` border + 2 px `--accent` outline, 1 px offset |
  | Error | 1.5 px `--d-fg` border + “! message” in `--d-fg` 600 |
  | Disabled | dashed `--control`, `--sunken`, `--text-2` |
  | Read-only | `--sunken`, no border change |
  | Restricted | see 10.6 |
- **Types:**
  - Text; mono text for codes.
  - Currency: ₹ prefix in `--text-3`, right-aligned, formats to 1,23,456.00 on blur.
  - Quantity: right-aligned integer.
  - Date: DD MMM YYYY with a picker.
  - Select, Textarea (with a counter).
  - Checkbox (16 px, radius 4), Radio (16 px), Toggle (34 × 20).
- **Rules:**
  - Errors show on blur and on submit, below the field, never only as a tooltip.
  - Reasons come from Setup › Reason codes.

### 10.8 Stepper (delivery record)

- **Anatomy:** 8 steps (Arrival · Count · GRN · Problems · PT · Approval · Labels · Accept), each a 24–28 px circle, a connector line, a label and a sub-label.
- **States:**

  | State | Circle | Label / connector |
  |---|---|---|
  | Done | `--accent` fill, ✓ | connector `--accent` |
  | Current | `--accent` ring | label weight 700 |
  | Blocked | `--w-bg` fill, `--w-fg` ring, “!” | sub-label with count (“3 open”) |
  | Upcoming | `--control` ring, number | label `--text-2` |
- **Rules:**
  - Done steps can always be opened. Later steps unlock only when the previous step passes.
  - For a transfer receipt, the PT step is read-only (auto-created).
  - For a quarantine transfer there is no PT step.

### 10.9 Data table

- **Anatomy:**
  - Toolbar: search, filter chips with counts, Columns, Export.
  - Bulk bar: shown when a selection exists.
  - Header row: 40 px, `--sunken`, 13 / 600 `--text-2`.
  - Rows: 40 px.
  - Footer: range, rows per page, pager.
- **Sorting:** click a header to toggle asc/desc. The active header shows ▲ or ▼, turns `--text` and sets `aria-sort`.
- **Filter chips:**
  - Off: `--surface` with `--control` border.
  - On: `--accent` fill with `aria-pressed`.
  - Each shows its count.
- **Selection:**
  - A checkbox column (44 px); the header checkbox selects the page.
  - Selected rows use `--tint`.
  - The bulk bar (`--tint` / `--on-tint`) shows “n selected · across pages”, actions, and Clear.
  - The selection persists across pages and filters.
- **Pagination:** “1–25 of 12,480”, rows per page, Prev / numbers / Next. Over 1,000 rows, pages load as the user goes.
- **Cells:**
  - Doc numbers are mono links in `--accent`, underlined.
  - Numbers are right-aligned and tabular.
  - Status is a badge.
  - Restricted cells: see 10.6.
- **States:** row hover `--hover`, row focus (§9), empty / loading / error (10.13).
- **Sticky:** the header row and the first column stay fixed when scrolling.

### 10.10 PT grid (G-12, G-14)

- **Columns:** 22.
  - 15 typed: Season · Brand · Style no. · Colour · Gender · Sub category · Type · Item · Fit · Size · Barcode · Qty · MRP · Tax slab · Basic.
  - 7 derived: P RATE · INPUT TAX · OUTPUT TAX · NAG · MARGIN · SUGGESTED SUB CATEGORY · SUGGESTED TYPE.
  - Plus a sticky row-number column.
- **Row:** 36 px. The header is 40 px with a 2 px `--control` bottom border, and is sticky.
- **Cell states:**

  | State | Visual | Behaviour |
  |---|---|---|
  | Typed | `--surface`, `--text` | Editable |
  | Derived | `--sunken`, `--text-2`, header “ƒ” | Read-only, **no override**: can’t be typed, pasted or filled; still takes focus so it can be read |
  | Error | `--d-bg`, `--d-fg`, 1.5 px inset `--d-fg`, trailing “!” | `aria-invalid`; message in the status bar below the grid |
  | Changed since last version | `--i-bg`, `--i-fg`, 7 px corner triangle `--i-fg` | Tooltip shows the old value |
  | Suggestion awaiting acceptance | Value in italic `--text-2` inside a 1 px dashed `--accent` box + ✓ | Enter accepts, Delete rejects; a person must accept (no automatic apply) |
  | Focused | 2 px inset `--accent` | |
- **Toolbar:**
  - PT no. and version.
  - Count chips: errors (Stopped), suggestions (Pending), changed (Neutral).
  - Next error (F8).
  - Fill column….
  - Mark page reviewed (toggles to “✓ Page n reviewed”, Done colours).
- **Whole-column fill:**
  - A glass popover anchored to the column header; the header is highlighted with `--tint` and a 2 px `--accent` underline.
  - Fields: Value; Apply to: All rows · Only blank cells · This page, each with its row count.
  - A consequence line, such as “Overwrites 48,796 values and fills 1,204 blank cells”.
  - The CTA states the count: “Fill 50,000 rows”.
  - Recorded in PT history as **one** change, which can be undone.
  - Derived columns never appear in the fill list.
- **Paged loading (50,000 lines, 20 MB intake):**
  - Pages of 100 rows; only visible rows are drawn.
  - Footer: “Rows 201–300 of 50,000 · page 3 of 500”, a loading bar (“Loading rows 301–400…”), Go to row, Prev / Next 100.
  - Rows still loading show as skeleton rows.
- **Status bar:** the selected cell’s row, column and message, plus key hints.

### 10.11 Reconciliation table (R-INV-012, G-13)

- **Columns:** Style · size · Invoice · GRN · Existing (earlier PTs) · Proposed (this PT) · Held · Returned / disposed · Disposition.
- **Conservation rule, per line:** `GRN = Existing + Proposed + Held + Returned/disposed`.
- **Invoice vs GRN:** the difference shows under the GRN value in `--w-fg` 12 / 600: “−12 short”, “+6 excess”, or “not on invoice” (invoice 0).
- **Disposition:** one chip per outcome, in the family colour, for example:
  - Short n · record shortage / counter-GRN
  - Excess n · accept (supplemental PT) / return to vendor / keep on hold
  - Damaged n · keep in quarantine / value damage / return to vendor / dispose
  - Wrong n · return to vendor / accept (G-37) / keep on hold
  - Unidentified n · resolve identity / return to vendor / keep on hold
  - “n already on PT-xxxx”

  “Matches” in `--text-3` when nothing applies.
- **Line error:**
  - A line that doesn’t conserve gets a `--d-bg` background, a 3 px left `--d-fg` bar and `aria-invalid`.
  - Below it, an alert row: “✕ Doesn’t add up: GRN 182 ≠ Existing 0 + Proposed 179 + Held 0 + Returned 0 = 179. 3 pcs are not accounted for.” plus a fix action.
- **Totals row:**
  - Style: see §8.
  - Totals for every column.
  - The Disposition cell shows the short / excess / unknown summary and the check: “✓ All lines add up” or “✕ n pcs not accounted for on n lines”.
- **Approval drawer:**
  - Its disposition counts come from the **same data** as the table and must match exactly.
  - “Not accounted for” is listed in red while it is non-zero.
- **Blocking:** while any line doesn’t conserve, **Approve is disabled** (native `disabled`) with an inline alert that names the lines.

### 10.12 Alerts and toasts

- **Banner:**
  - Grid: 20 px glyph circle · title (600) + text (13 / 18) · optional action link.
  - Family tint background with its `-fg` text.
  - Info (i), Success (✓), Warning (!), Danger (✕).
  - Placed at the top of the page or section it concerns. It stays until the condition clears. No left-border accent.
- **Toast:**
  - e3 glass, radius 12, bottom-right: glyph + message + one action (for example Withdraw or Undo).
  - Lasts 6 s, pauses on hover or focus, polite live region, never takes focus.
  - Moves above an open drawer’s footer.
- In-app only (G-25).

### 10.13 Empty, loading, error

| State | Content | Rules |
|---|---|---|
| Empty | 40 px neutral mark · title (“No deliveries waiting”) · one line explaining why, naming the scope · one secondary action | Always explain why the list is empty and what to do next |
| Loading | Skeleton rows at the real row height, using `--sunken` blocks | `aria-busy`; pulse off under reduced motion |
| Error | `--d-bg` glyph · “Couldn’t load …” · cause · mono reference (ERR-xxxxxx) · Retry (primary) | Keep the user’s filters and selection; `role="alert"` |
| Partial | Data shown + trust chip in the Partial state | See 10.4 |

### 10.14 Approval panel (policy-band limits)

- **Anatomy (e1 card):**
  - Header: record title + “Awaiting approval” badge; raised or prepared by, with date and time.
  - Body:
    - Value label + value (kpi).
    - **Band bar:** 10 px track in `--sunken`, the approver’s band in `--tint` ending in a 2 px `--accent` edge, and a value marker (4 × 18 px): `--accent` inside the band, `--w-fg` outside.
    - Scale: “₹0 · Your band up to ₹X · Owner above”.
    - A message block in the family tint.
    - The policy reference and effective date.
  - Footer: `--sunken` background with Reject… and the approve action.
- **States:**

  | Case | Message | Action |
  |---|---|---|
  | Within band | Done: “Within your band. You didn’t raise this, so you can approve.” | **Approve** |
  | Above band | Attention: “Above your band by ₹n. Only the Owner can approve.” | **Send to Owner** |
  | Maker = checker | Stopped: “You raised this, so a different person must approve.” | Approve **disabled** |
  | Owner | “Owner: no upper limit” | |
- **Rules:**
  - Bands come from Setup › Approval policies and are checked as **permissions** (approve rung + band), never role names.
  - The limit is always shown next to the button.
  - Reject always asks for a reason.

### 10.15 Right drawer

- **Anatomy:**
  - e3 glass, full height under the top bar.
  - Header: mono ref, title (h2), status badge, close (36 px ×).
  - Tabs: Details · Evidence n · History.
  - Scrolling body of **solid** cards and fields.
  - Footer: secondary + one primary.
- **Widths:** 420 px (640 px for a PT preview); full screen on mobile.
- **Behaviour:**
  - Esc closes, and focus returns to the opener.
  - Opening never loses the list position.
  - Modal use adds `--scrim`. Non-modal use adds right scroll padding.
  - Content behind it reflows to the remaining width when it is open, and back to full width when it closes.

### 10.16 Theme setting (My profile › Theme)

- Three radio cards: Match device (default), Light, Dark. Each has a 64 px preview, a radio and a one-line description.
- Selected card: 2 px `--accent` border. The group uses `role="radiogroup"`.
- Changes apply instantly and are saved to the user.

---

## 11. Content style

- Plain, short English (India). Use sentence case for everything except codes and the PT grid’s canonical column names.
- Name the people and the rule (“Only the Owner can approve”), not the system (“Permission denied”).
- Every block or error says **why** and **what to do next**.
- Dates and numbers follow §8.

---

## 12. Open items affecting this language

- Real approval band amounts per policy (examples such as ₹50,000 are placeholders).
- Reason code list (Setup › Reason codes) and one real messy delivery for the reconciliation (G-13).
- PT derived-column formulas (P RATE, INPUT/OUTPUT TAX, NAG, MARGIN); sample values are illustrative.
- Logo artwork (G-02); receipt and label printer models (G-16).
- Finance screens (G-26): design deferred.
