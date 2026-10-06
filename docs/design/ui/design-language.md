# Apparel OS design language

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current.** Aligned to [prd.md](../../prd.md) and [kdps-policies.md](../../kdps-policies.md) on 3 Oct 2026, after reading DEC-027 to DEC-092 and DEC-105. DEC-027 to DEC-030 touch this file (the test-setup wording in 10.17, the Proposed states basis), and so do DEC-042, DEC-057, DEC-058, DEC-062, DEC-064, DEC-070 to DEC-072, DEC-092 and DEC-105 (the state names in 7, camera scanning in 6 D and the accessibility target in 12). A search found nothing here that the others contradict. If this document disagrees with them, they win; raise the clash, do not guess.

Implements these PRD sections: Operator experience; People, access and approvals; Merchandise and identifiers; Receiving and price tickets (delivery record, PT workbench); Transfers and physical movement; Damage, quarantine and disposal; Counter sales and payments; HRMS and payroll; Exceptions, reports and planning; Opening, closure, migration and export; Technical platform (Offline counter; AI, security and operational reliability); Required policy configuration. Policies: 2 (scope, approval limits), 3 (PT costing), 4 (piece IDs), 6 and 7 (returns, refunds, tenders), 10 (bill number), 16 (offline), 17 (held goods), 19 (offers and promotions).

Requirement IDs applied: `PRD-ACS-001`–`PRD-ACS-004`, `PRD-ACS-021`, `PRD-ORG-001`, `PRD-ORG-005`, `PRD-ACS-009`, `PRD-ACS-010`, `PRD-ACS-015`, `PRD-EXC-013`, `PRD-UXP-003`, `PRD-MER-015`, `PRD-MER-016`, `PRD-REC-006`, `PRD-REC-020` to `PRD-REC-022`, `PRD-PTW-011`, `PRD-PTW-013`, `PRD-POS-005`, `PRD-POS-007`, `PRD-POS-020`, `PRD-POS-022`, `PRD-MOD-015`, `PRD-MOD-016`, `PRD-OFF-001`, `PRD-OFF-003`, `PRD-OFF-004`, `PRD-OFF-015`, `PRD-OFF-016`, `PRD-OFF-017`, `PRD-OFF-019`, `PRD-TRF-011`, `PRD-TRF-013`, `PRD-DMG-011`, `PRD-HRM-004`, `PRD-HRM-006`, `PRD-HRM-007`, `PRD-SEC-008`, `PRD-FRN-007`, `PRD-TAX-004`, `PRD-LIF-014`, `PRD-LIF-026`. Policy IDs applied: `POL-02.07` to `POL-02.10`, `POL-03.07`, `POL-04.06`, `POL-07.09`, `POL-10.07`, `POL-10.11`, `POL-16.01` to `POL-16.03`, `POL-16.07`, `POL-17.05`.

People are described by the 14 PRD personas in [personas.md](../access/personas.md). Live visual version: [design-system.html](design-system.html).

Sample values in this document and in the design-system pages (names, dates, rates, limits, times, targets, counters and amounts shown in examples) are synthetic examples. None is a KDPS setting or a policy value; real values stay OPEN until the policy that owns them is signed (AGENTS.md, "Never invent a value"). Values quoted from the PRD or the policies as rules, and design dimensions such as popover width and target size, are not examples; they stand as stated.

---

## 1. Principles

1. **Solid where people read and type, glass only on chrome.** Glass is used for the top bar, drawers, popovers, toasts and dialogs. Tables, forms, the PT grid and the till are always solid.
2. **Navy means action, never state.** The accent is used only for primary actions, links, selection and focus. States have their own colour families (§7).
3. **Colour is never the only signal.** Every state carries a word and a glyph, errors carry text, and changed cells carry a corner marker.
4. **Numbers are exact and aligned.** Tabular figures, right-aligned, Indian grouping. Blank means unknown and 0 means known zero (§8). One input shorthand differs: an empty Cash received field on the till means exact cash (§8, `PRD-POS-007`, `PRD-MOD-016`).
5. **Show the limit next to the button.** Approvals show the approver's limit, and that the approver is not the preparer, right beside Approve.
6. **Nothing hides focus.** Sticky bars, drawers and toasts never cover the focused element (§9).
7. **Nothing live without its policy.** An action whose KDPS policy is not signed and configured says so and why (10.17).

---

## 2. Colour tokens

Palette: **Sand & Navy** (option 2b). Colour pairs target WCAG 2.2 AA in both themes (a design target; no PRD requirement sets it yet): text 4.5:1 (1.4.3), control boundaries and focus 3:1 (1.4.11).

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
- Mono: **Source Code Pro** (400, 500), used for codes only: SKU, barcode, piece ID, doc no., bill no., persona ID, error reference, key caps.
- Every number in a table, total, limit bar or KPI uses `font-variant-numeric: tabular-nums`.
- The minimum size is **12 px**, for labels and captions only.
- Hindi (stages 1–5 screens in stage 5; stage 6 screens in stage 6): **Noto Sans Devanagari** (400, 500, 600, 700) is the next font in the stack, so Devanagari text renders with the same sizes. Labels, buttons and menus must allow about 30% longer text without clipping (design default; validate against `PRD-PRF-001`); never fix a width to the English text.

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

### Sizes (comfortable density)

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
| Minimum target (2.5.8) | 24 × 24 px hit area for every control, including 16 px checkboxes and radios, 34 × 20 toggles and the 20 px My work pill; 16 px checkboxes sit in ≥ 40 px hit areas |

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

- **Top bar:** 56 px of glass, sticky, and content scrolls under it. Order: logo slot (200 × 32, empty until supplied) · scope chip · search/scan field (“Search or scan: SKU, barcode, piece ID, doc no., bill”, Ctrl K) · My work counter · Alerts · theme switch · avatar.
- **Sidebar:** solid, 232 px, collapsible to 64 px. It lists only the sections the user's role assignments grant. The active item uses `--tint` / `--on-tint` at weight 600. Open-item counts are right-aligned in `--text-2`.
- **Page header:** breadcrumb (body-sm) · title (28/34) · status badge · scope chip · context line · **one** primary action plus secondary actions.
- **Body:** stepper or tabs, then workspace (table, grid or form). The right drawer holds preview, exception, approval or history.
- **Below 1024 px:** the sidebar becomes a glass drawer from the left and the header actions go into a “More” menu.

### B · Till

- **All solid, no sidebar**, keyboard and scanner first. Design size 1366 × 768.
- A Store can run several online tills. Only its one registered offline counter may bill without a connection (`PRD-OFF-001`, `POL-16.01`).
- **Status bar:** 52 px. Logo slot · Store and till · connection pill · date and time · cashier + Sign out.
  - Online till: Online ✓ Done, or Connection lost ✕ Stopped. An online till cannot finalise a bill without a connection.
  - Offline counter: Online ✓ Done · Offline ! Attention with the queued count · Paused ! Attention · Authority expired ✕ Stopped · Working set expired ✕ Stopped. The pill is followed by the offline authority left (“Offline authority 19 h left”, a synthetic example; the 24-hour renewal is `PRD-OFF-003`).
- **Authority expired:** a red banner under the status bar says new bills are blocked and that viewing and upload still work. Pay is replaced by a disabled “Pay blocked · offline authority expired” button.
- **Working set expired:** the cached working set passed its validity time (`PRD-OFF-004`, `POL-16.07`; duration **OPEN**). Finalisation is blocked until the till refreshes online; viewing and upload still work.
- **Paused:** billing stays paused until the counter is online and the release is confirmed. Pay is disabled and says why.
- **Device trouble:** a full storage, a wrong clock, a second open tab or an app update stops new bills on that device with a banner that says why. A finished bill is never lost or deleted (`PRD-OFF-019`).
- **Left:** the scan field (56 px), which always has focus and takes a piece ID or a supplier barcode, a bill-level salesperson picker, and the lines table (60 px rows; salesperson per line). A piece-tracked line lists each scanned piece ID under its SKU, so returns and counts stay at piece level (PRD-MER-016).
- **Right (420 px):** Add customer (F2) · subtotal, offers, GST included · To pay (till-total) · tenders (52 px tiles) · Pay (64 px, F12).
  - Tender tiles show only the tenders enabled under policy 7: Cash · Card · UPI · Bank transfer · Store credit · Gift voucher · Customer credit. Bank transfer is confirmed by bank/provider evidence (`PRD-POS-005`, `POL-07.09`); Customer credit shows its approved limit and due date (`PRD-POS-022`) and appears only from stage 5, when receivables exist ([phases.md](../../phases.md)). Split divides To pay across tenders; it starts unallocated and must add up exactly.
  - Cash shows Cash received and Change. Left empty, Cash received means exact cash; 0 means zero (`PRD-POS-007`). The empty field is resolved to the declared cash amount before it is saved (`PRD-MOD-016`).
  - Store credit, Gift voucher, Customer credit and loyalty redemption need online authority and are unavailable while the till is offline (`PRD-OFF-016`, `POL-16.03`). Which tenders may be recorded offline, and their evidence, are OPEN (KDPS Owner and Operations, policy 16; stage 4).
  - The first offline Store starts with Cash (`POL-16.02`). Card or UPI may appear later only where policy 16's evidence procedure is explicitly configured; the offline cash or manual tender records no provider confirmation (`PRD-OFF-017`).
- **Function bar:** 52 px. F2 Customer · F3 Salesperson · F4 Hold cart · F5 Recall · F6 Return (online only) · F7 Manager approval (online only) · F9 Till summary · Esc Remove line.
- **Manager approval (F7):** for a discount or price change above the cashier's limit. Needs online authority (`PRD-OFF-016`, `DEC-062`): greyed online only while the till is offline; a bill needing it cannot be finalised offline. When online, the manager signs in with their own login and reauthenticates as the PRD requires; the approval records that manager and the exact bill version.
- After any action, focus returns to the scan field.

### C · Portal

- Glass top bar (64 px) with **top tabs**, no sidebar, 48 px targets.
- **Self-service:** Check-in · My attendance · My targets · My payslips · Profile.
- **Check-in** records photo, location and time on a registered device. There is no face matching (`PRD-HRM-004`). Attendance outcomes are shown as plain text; a regularisation request is a record with a state (`PRD-HRM-006`), and weekly offs come from the roster (`PRD-HRM-007`).
- **EBO staff:** Today (opening and closing checklist) · Uploads · Petty cash · Cash deposit (PRD: Operator experience).
- **Partner:** Dashboard · Statements · Ledger. The scope chip is locked to the partner’s own Stores. Partner users hold Store personas on those Stores; there is no separate partner persona (`PRD-FRN-007`).
- On the shared store tablet, a registered device, check-in signs the user out automatically.
- On phones the tabs become a bottom bar.

### D · Mobile (responsive web)

- The same web routes in a phone browser. The separate phone client in the PRD stack is parked and not yet in a stage.
- Glass top bar with menu (44 px), logo slot and My work.
- The sidebar becomes a glass drawer from the left: 300 px wide, scope chip at the top, 44 px rows, profile at the bottom.
- **Scan to receive:**
  - Scan field: handheld or Bluetooth scanner (PRD Hardware). Camera scanning is built for phones in the browser, for lookup, receiving and counts, and is switched off by default (`DEC-105`).
  - Condition segmented control: Good · Damaged · Wrong · Unidentified (48 px). It stays selected until changed.
  - A last-scanned card with a running count (“1,186 counted”), compared with the invoice when there is one (“of 1,252 on invoice”), and a split by condition. Counting never waits for an invoice.
  - A recent-scans list.
  - A solid bottom bar: Undo last · Finish count.
  - Each scan confirms with a sound, a vibration and the card.

---

## 7. State colours

### Families

| Family | Glyph | Tokens | Light bg / fg (ratio) | Dark bg / fg (ratio) | Meaning |
|---|---|---|---|---|---|
| Neutral | ○ | `--n-bg` / `--n-fg` | `#ece9e2` / `#4a463f` (7.74:1) | `#2a2a2e` / `#c9c5bd` (8.31:1) | Not started, finished with nothing left to do, or not known yet |
| Pending | ◔ | `--i-bg` / `--i-fg` | `#e3ebfb` / `#1e4aa8` (6.75:1) | `#1c2b4d` / `#a9c2ff` (7.89:1) | Waiting for someone else: approval, sync, reply |
| Moving | ▸ | `--p-bg` / `--p-fg` | `#d9eff0` / `#0c5f66` (6.17:1) | `#133a3d` / `#8fd9df` (7.74:1) | Physically on the way or being worked through |
| Done | ✓ | `--s-bg` / `--s-fg` | `#dcf1e4` / `#1b6b3a` (5.53:1) | `#173726` / `#8fdcac` (8.07:1) | Final and in force; can be relied on |
| Attention | ! | `--w-bg` / `--w-fg` | `#fbeccf` / `#7d4a00` (6.31:1) | `#3d2c0e` / `#f2c475` (8.26:1) | Blocked or needs a decision; not an error yet |
| Stopped | ✕ | `--d-bg` / `--d-fg` | `#fbe3e1` / `#a1261d` (6.11:1) | `#43191a` / `#ffaaa3` (8.28:1) | Undone, rejected or failed; history always kept |
| Quarantine | ◆ | `--q-bg` / `--q-fg` | `#f1e3f6` / `#7a2690` (6.80:1) | `#36193f` / `#e3b0f2` (8.60:1) | Unsellable goods kept apart: damage, wrong or unknown identity |

### All states

Names follow the PRD and the KDPS policies. The state names for Site, Store and business unit, master version, user, import batch, proposal, financial period, number series, exception and approval request are the baseline set by `DEC-105` (DM-4): states 50 to 63 are new, and the "Where it appears" cells of Closed, Ended, Confirmed, Paused, Reopened, Rejected and Failed are extended. Design review confirms the names. The product owner approved on 6 Oct 2026 state 64, Withdrawn (RR-202, code-house-rules CH-11; its Neutral family, like Cancelled and Superseded, confirmed by the product owner, `DEC-117`), and the billing-device states Setting up, Active, Ended and Revoked ([offline-counter.md](../pos/offline-counter.md) 3.1, GC8-7).

| # | State | Family | Glyph | Where it appears |
|---|---|---|---|---|
| 1 | Draft | Neutral | ○ | Booking, PT, adjustment, offer, count, transfer request, supplier return |
| 2 | Cancelled | Neutral | ○ | Booking, transfer before dispatch, held cart, refund request |
| 3 | Cancelled before departure | Neutral | ○ | Supplier return |
| 4 | Closed | Neutral | ○ | Booking, count, exception; Site, Store and business unit; number series |
| 5 | Closed—partially returned | Neutral | ○ | Supplier return |
| 6 | Ended | Neutral | ○ | Offer, end-of-season price list, master version, user, billing device retired after use |
| 7 | Unknown | Neutral | ○ | A value not known yet, such as pre-PT cost, season or identity. In tables the cell is blank instead (§8) |
| 8 | Submitted | Pending | ◔ | PT, adjustment, offer, damage report |
| 9 | Awaiting approval | Pending | ◔ | Any record that needs independent approval |
| 10 | Awaiting outcome | Pending | ◔ | Card or UPI payment, refund, IRN, e-way bill, Tally voucher, bank payment |
| 11 | Queued | Pending | ◔ | Offline counter upload queue, export, Tally batch |
| 12 | Recorded manually | Pending | ◔ | Card or UPI payment recorded by the cashier without provider evidence (`PRD-POS-010`) |
| 13 | Partly received | Pending | ◔ | Booking, transfer |
| 14 | In transit | Moving | ▸ | Transfer while any dispatch has not yet arrived (`PRD-TRF-013`), supplier-return shipment, cash in transit |
| 15 | In progress | Moving | ▸ | Stock count, delivery steps |
| 16 | Dispatched | Moving | ▸ | One dispatch of a transfer, until its arrival is recorded (`PRD-TRF-011`, `PRD-TRF-013`) |
| 17 | Initiated | Moving | ▸ | Supplier return, while any quantity awaits departure or confirmation |
| 18 | Approved | Done | ✓ | Booking, transfer (stock reserved), offer, adjustment, refund |
| 19 | Issued | Done | ✓ | Booking (sent to the supplier), GRN |
| 20 | Confirmed | Done | ✓ | Booking (supplier accepted), damage report, refund, proposal |
| 21 | Official | Done | ✓ | PT |
| 22 | Completed | Done | ✓ | Bill, transfer, supplier return |
| 23 | Live | Done | ✓ | Offer |
| 24 | Authorised | Done | ✓ | Offline counter with valid offline authority |
| 25 | Accepted | Done | ✓ | Delivery (put away), excess, transfer receipt |
| 26 | Resolved | Done | ✓ | Exception |
| 27 | Provider-confirmed | Done | ✓ | Card or UPI payment confirmed by the provider (`PRD-POS-010`) |
| 28 | Settled | Done | ✓ | Card or UPI payment settled in the bank (`PRD-POS-010`) |
| 29 | Signed | Done | ✓ | Policy readiness: the policy's "Signed by, date" line is complete (`DEC-029`, `DEC-092`) |
| 30 | Held | Attention | ! | Damage hold, excess hold, source-conflict hold, expiry hold, ordinary hold, inspection hold (hold kinds: [stock-ledger.md](../stock/stock-ledger.md) 6.1) |
| 31 | Overdue | Attention | ! | Booking balance past its delivery window, exception, billed-retained collection, supplier-return deadline |
| 32 | Offline | Attention | ! | Offline counter |
| 33 | Paused | Attention | ! | Offline counter billing pause, number series |
| 34 | Outcome unknown | Attention | ! | Card or UPI payment, refund, IRN, e-way bill, Tally voucher, bank payment. Look it up before any retry |
| 35 | Stale | Attention | ! | Trust chip, sync |
| 36 | Reopened | Attention | ! | Exception, financial period |
| 37 | Reversed | Stopped | ✕ | PT, adjustment, posted entry |
| 38 | Rejected | Stopped | ✕ | PT, damage report, transfer, adjustment, offer, master version, proposal |
| 39 | Failed | Stopped | ✕ | Sync, export, delivery, refund, payment, import batch |
| 40 | Refused | Stopped | ✕ | Offline bill refused on upload |
| 41 | Conflict | Stopped | ✕ | Offline bill that conflicts on upload |
| 42 | Connection lost | Stopped | ✕ | Online till |
| 43 | Authority expired | Stopped | ✕ | Offline counter |
| 44 | Working set expired | Stopped | ✕ | Offline counter, cached working set past its validity time (`PRD-OFF-004`, `POL-16.07`, `DEC-062`) |
| 45 | Revoked | Stopped | ✕ | A registered device or session reported lost and revoked (`PRD-SEC-008`, `PRD-OFF-019`, `DEC-092`) |
| 46 | Quarantine | Quarantine | ◆ | Stock bucket, quarantine movement |
| 47 | Damaged | Quarantine | ◆ | Damage report, GRN line |
| 48 | Wrong | Quarantine | ◆ | GRN line |
| 49 | Unidentified | Quarantine | ◆ | GRN line, count |
| 50 | Setting up | Neutral | ○ | Site, Store and business unit before any activity is granted; billing device registered, not yet enrolled |
| 51 | Active | Done | ✓ | Site, Store and business unit; user; billing device |
| 52 | Closing | Moving | ▸ | Site, Store and business unit after closure starts |
| 53 | Scheduled | Pending | ◔ | Master version approved with a later start date |
| 54 | In force | Done | ✓ | Master version |
| 55 | Disabled | Stopped | ✕ | User |
| 56 | Staged | Neutral | ○ | Import batch |
| 57 | Validated | Pending | ◔ | Import batch waiting for review |
| 58 | Published | Done | ✓ | Import batch |
| 59 | Proposed | Pending | ◔ | Product and vocabulary proposals |
| 60 | Open | Done | ✓ | Financial period, number series |
| 61 | Locked | Done | ✓ | Financial period |
| 62 | Unresolved | Attention | ! | Exception raised and not yet resolved |
| 63 | Superseded | Neutral | ○ | Approval request ended by a material change |
| 64 | Withdrawn | Neutral | ○ | A Scheduled master version or dated row, such as a role assignment, withdrawn before its start through an approved change, or a request withdrawn before approval, such as a rejected user's pending assignments; the record keeps which and why; never in force ([code-house-rules.md](../platform/code-house-rules.md) 7.3; `DEC-117`) |

Rules:

- Badge: 22 px high, radius 999, padding 0 9 px, 12 px / 600, glyph (11 px) + word. Never show the glyph without the word.
- A record shows **one** status badge: its lifecycle state. Line-level conditions (short, excess, damaged, wrong, unidentified) appear as chips in the line’s Disposition cell, with counts beside the badge, because conditions can coexist (`PRD-REC-006`). Short and excess are never a record's status. A delivery record never takes Damaged, Wrong or Unidentified as its badge.
- A written-off piece that is still present keeps its Quarantine or Damaged state (`PRD-DMG-011`, `POL-17.05`). A write-off record itself uses Draft, Awaiting approval, Approved or Rejected.
- A completed bill is never Cancelled or Reversed. A return is its own record, and a tax-invoice cancellation is a separate tax-document state, names **OPEN** (`PRD-TAX-004`, see Proposed states).
- Unknown is for a value. Outcome unknown is for a result from an outside system: payment provider, GST, Tally or bank.
- New states must join an existing family. Adding a family needs a design review.

### Proposed states (for design review)

Tax-document states are unsettled. Signed and Revoked (`DEC-092`), Working set expired (`DEC-062`) and Withdrawn (product owner, 6 Oct 2026, RR-202) are in the table above. Adding a state needs a design review; the product owner decides the final names.

- An unsigned policy shows the 10.17 banner, not a badge.
- Tax-document states (a cancelled or corrected tax invoice, `PRD-TAX-004`, `DEC-057`): state names and family are **OPEN** (product owner, design review; the CA for the treatment under `POL-10.11`; stage 4). They stay separate from the operational states of bills and returns.
- "Ended" stays in Neutral (an offer or end-of-season price list that has run its course). A device registration or session that was ended by loss is Revoked (Stopped).

---

## 8. India formatting

These formats are the **INR default** for screens built so far. Stock units in quantity columns follow the product's configured unit (`POL-04.03`: pieces, pairs or packs). Display formats for other enabled currencies remain **OPEN** (product owner; `PRD-MOD-014`, `PRD-ORG-011`).

| Kind | Format | Example | Notes |
|---|---|---|---|
| Money · record, total, till | ₹ + Indian grouping + 2 decimals | ₹1,23,456.00 | |
| Money · crore | full grouping | ₹3,41,26,000.00 | Never millions or billions |
| Money · compact | L (Lakh) / Cr (Crore), 2 decimals | ₹12.65 L · ₹3.41 Cr | Dashboard tiles only; the exact value shows on hover or focus |
| Money · in tables | no ₹ in cells; “Value (₹)” in the header | 3,41,26,000.00 | So the decimals line up |
| Negative | true minus sign U+2212 | −₹4,200.00 · −12 | No brackets, never red alone |
| Quantity | Indian grouping, whole numbers | 1,08,420 pcs | |
| Zero | 0 / 0.00 | 0 | Known zero (counted, nothing there) |
| Unknown | **blank cell** in tables; the word “Unknown” (○) in fields and records | | Screen readers say “unknown”. Never a dash for numbers. Totals exclude blanks and a trust chip says so (`PRD-MOD-015`). **Exception:** the till's Cash received field. Left empty it means exact cash, resolved to the declared cash amount before it is saved (`PRD-POS-007`, `PRD-MOD-016`); it is not an unknown. 0 still means zero. |
| Date | DD MMM YYYY | 23 Sep 2026 | Input also accepts 23/9, 23-09-26. Examples use 2026 sample dates (synthetic) |
| Date and time | DD MMM YYYY, HH:mm (24-hour) | 23 Sep 2026, 10:42 | |
| Range | shared parts not repeated | 1–25 Sep 2026 | en dash |
| Percent | integer or 1 decimal | 96% · 50.0% | Changes are shown in pp: −2.4 pp. Ticket MARGIN always shows 2 decimals (`PRD-PTW-011`) |
| Bill no. | mono; length limit and allowed characters **not confirmed** | B01C1/2627/04381 (synthetic layout) | Store B01, billing device C1, FY 2026–27, then the sequence. Each billing device has its own series per tax registration and financial year (`PRD-POS-020`). The format is set per Organisation within the statutory limit, which the CA has not confirmed (`POL-10.07`). **OPEN:** length limit and allowed characters; owner Accounts and the CA; blocks stage 4 |

Alignment:

- All numbers are right-aligned with tabular figures.
- Money always shows 2 decimals, so the decimal points line up.
- Quantity columns carry the unit in the header: “Qty (pcs)”.
- Totals rows have a 2 px `--control` top border, a `--sunken` background and weight 700.

---

## 9. Accessibility (design target: WCAG 2.2 AA)

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
- **Target size (2.5.8):** every control has a hit area of at least 24 × 24 px, even where the drawn control is smaller (16 px checkboxes and radios, 34 × 20 toggles, the 20 px My work pill); 48 px on the till and portal.
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

### 10.3 Scope chip

- **Anatomy:** pill 30–32 px, `--tint` / `--on-tint`, 13 / 600, label + ▾.
- **Dimensions:** legal entity · place · brand. Places are one tree: Sites, with their Stores and business units under them; ticking a Site covers every Store and business unit at it, and ticking a Store every business unit of it, including ones added later; a unit ticked alone covers only itself (`PRD-ACS-021`). Site, Store and business unit stay separate levels and are never merged: one Site can hold units with different entities and books.
- **Label:**
  - One value: its code (“BLR01”); several: “3 places”.
  - Brands follow the same rule: one brand’s name, otherwise “2 brands”.
  - Everything allowed: “All places · All brands” (neutral outline).
  - The legal entity shows only when the user can see more than one.
- **Popover (e3 glass, 340 px):**
  - One checkbox list for legal entity and one for brand, and a checkbox tree for places, each showing only what the user's role assignments allow.
  - A footer with that note and **Apply**.
  - Changes don’t apply until Apply.
- **Rules:** every page shows its active scope. On records, the chip shows the record’s own entity, place (Site, Store or unit) and brand, read-only. Partner users get it locked to their own Stores.
- The chip shows the union of the user's role assignments, but each action is checked inside one assignment's scope (10.18).

### 10.4 Trust chip, “as of · complete %”

- **Anatomy:** 24 px pill, `--sunken` + `--border`, 12 px `--text-2`, with a state marker:

  | State | Marker | Example |
  |---|---|---|
  | Complete | ✓ `--s-fg` (Done) | “as of 23 Sep 2026, 10:42 · 100%” |
  | Partial | ! `--w-fg` (Attention) | “… · **96% complete**” (bold amber) |
  | Stale | ! `--w-fg` (Attention, as the Stale state in §7) | “as of 22 Sep 2026, 18:00 · **stale**” |
  | Refreshing | | “Refreshing…” |
- **Tooltip / focus:** names what is missing (“3 of 72 store days not synced”).
- **Rules:** on every metric, KPI, dashboard tile and reconciliation. It sits next to the heading, right-aligned.

### 10.5 My work counter

- **Anatomy:** “My work” (13 / 500) + a 20 px pill. The pill sits in a hit area of at least 24 × 24 px (§9).
- **States:**

  | State | Pill |
  |---|---|
  | Count | `--accent` / `--on-accent` |
  | Overdue | Attention family: `--w-bg` / `--w-fg`, “! n overdue” (`--danger` is for destructive buttons only, §2) |
  | 100 or more | “99+” |
  | Zero | plain “0” in `--text-3`, no pill |
- **Count:** tasks, approvals and exceptions assigned to the user that are not yet resolved (`PRD-ACS-009`; My work in the PRD's Words used). One inbox covers every persona the user holds. The list is ordered by due time and exposure. Resolved work is tracked inside My work. Approve, reject, delegation and escalation follow `PRD-ACS-010`.
- Items delegated during someone's absence, and escalated overdue items, carry a label saying so.

### 10.6 Restricted field and cell

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
  - Reasons come from Setup › Reason codes, except a decision on a change to that list, which gives a free-text reason (`DEC-104`).

### 10.8 Stepper (delivery record)

- **Anatomy:** 8 steps (Arrival · Count · GRN · Problems · PT · Approval · Labels · Accept), each a 24–28 px circle, a connector line, a label and a sub-label.
- **Labels:** piece-ID labels can print from the Count step, from the receipt count, and assert no price or sale eligibility (`PRD-MER-015`, `POL-04.06`). MRP labels print only after Approval, from official frozen PT values (`PRD-REC-020`). Every print and reprint job is recorded.
- **Accept:** barcode or tag verification, physical acceptance at the selling Site and putaway by the people authorised at the destination (`PRD-REC-021`, `PRD-REC-022`).
- **States:**

  | State | Circle | Label / connector |
  |---|---|---|
  | Done | `--s-bg` fill, `--s-fg` ring, ✓ (Done family, §7) | connector `--s-fg` |
  | Current | `--accent` ring (the accent marks where the user is, not a state) | label weight 700 |
  | Blocked | `--w-bg` fill, `--w-fg` ring, “!” | sub-label with count (“3 open”) |
  | Upcoming | `--control` ring, number | label `--text-2` |
- **Rules:**
  - Done steps can always be opened.
  - A step passes when every line has a result. For a problem, choosing an outcome passes, including “keep on hold”. The clean part of the delivery then moves on while the held part waits (PRD: Receiving and price tickets).
  - A step shows Blocked only while a line has no result.
  - For a transfer receipt, the PT step is read-only: its coverage comes from the source origins.
  - For a quarantine movement there is no PT step.

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
- **Pagination:** “1–25 of 12,480”, rows per page, Prev / numbers / Next. Over 1,000 rows (design default; validate against `PRD-PRF-001`), pages load as the user goes.
- **Cells:**
  - Doc numbers are mono links in `--accent`, underlined.
  - Numbers are right-aligned and tabular.
  - Status is a badge.
  - Restricted cells: see 10.6.
- **States:** row hover `--hover`, row focus (§9), empty / loading / error (10.13).
- **Sticky:** the header row and the first column stay fixed when scrolling.

### 10.10 PT grid

- **Columns:** the 22 columns of the KDPS export profile, in PRD order (PRD: PT workbench):
  - SEASON · BRAND · COLOR · GENDER · SUB CATEGORY · TYPE · ITEM · FIT · SIZE · BARCODE · DESIGN · HSN · QTY · MRP · BASIC · P RATE · INPUT TAX · OUTPUT TAX · NAG · MARGIN · SUGGESTED SUB CATEGORY · SUGGESTED TYPE.
  - Plus a sticky row-number column and a review-mark column.
  - Plus **Supplier cost**, shown beside P RATE and left out of the export (policy 3).
- **Calculated or typed:** the PT's costing profile decides (`PRD-PTW-013`: base-to-ticket, ticket-to-purchase, or both supplied and checked).
  - Calculated columns show “ƒ” in the header.
  - NAG and MARGIN are always calculated: NAG = QTY; MARGIN = (MRP − P RATE) ÷ MRP × 100, rounded half-up to 2 decimals (`PRD-PTW-011`).
  - When both values are supplied, both stay typed and a mismatch shows as an error.
  - SUGGESTED SUB CATEGORY and SUGGESTED TYPE are suggestions; a person must accept them before they change anything.
- **Row:** 36 px. The header is 40 px with a 2 px `--control` bottom border, and is sticky.
- **Cell states:**

  | State | Visual | Behaviour |
  |---|---|---|
  | Typed | `--surface`, `--text` | Editable |
  | Calculated | `--sunken`, `--text-2`, header “ƒ” | Read-only: can’t be typed, pasted or filled; still takes focus so it can be read |
  | Error | `--d-bg`, `--d-fg`, 1.5 px inset `--d-fg`, trailing “!” | `aria-invalid`; message in the status bar below the grid |
  | Changed since last version | `--i-bg`, `--i-fg`, 7 px corner triangle `--i-fg` | Tooltip shows the old value |
  | Suggestion awaiting acceptance | Value in italic `--text-2` inside a 1 px dashed `--accent` box + ✓ | Enter accepts, Delete rejects; a person must accept (no automatic apply) |
  | Focused | 2 px inset `--accent` | |
- **Where a value came from:** every cell records its origin: supplier file, GRN count, typed, calculated, confirmed mapping or AI suggestion (PRD: Source conversion and imports). The status bar names the focused cell's origin. The **Show origin** toggle labels every cell.
- **Review:** each row has a review mark. Rows are marked one by one or by page selection. Editing a reviewed row clears its mark.
- **Saving:** Save is explicit. Unsaved drafts are kept and can be recovered; a draft is never treated as submitted.
- **Two editors:** if someone else changed a cell you also changed, both values show side by side and you choose. Nothing is overwritten silently.
- **Toolbar:**
  - PT no. and version.
  - Count chips: errors (Stopped), suggestions (Pending), changed (Neutral), rows not reviewed (Neutral).
  - Next error (F8).
  - Fill column….
  - Mark page reviewed (toggles to “✓ Page n reviewed”, Done colours).
  - Show origin.
  - Save.
- **Whole-column fill:**
  - A glass popover anchored to the column header; the header is highlighted with `--tint` and a 2 px `--accent` underline.
  - Fields: Value; Apply to: All rows · Only blank cells · This page, each with its row count.
  - A consequence line, such as “Overwrites 8,796 values and fills 1,204 blank cells”.
  - The CTA states the count: “Fill 10,000 rows”.
  - Recorded in PT history as **one** change, which can be undone. Filled rows lose their review marks.
  - Calculated columns never appear in the fill list.
- **Paged loading (large PTs):**
  - PRD target: parse, map and validate a 10,000-line PT import in under 1 minute.
  - Pages of 100 rows (design default; validate against `PRD-PRF-001`); only visible rows are drawn.
  - Footer: “Rows 201–300 of 10,000 · page 3 of 100”, a loading bar (“Loading rows 301–400…”), Go to row, Prev / Next 100.
  - Rows still loading show as skeleton rows.
- **Status bar:** the selected cell’s row, column, origin and message, plus key hints.

### 10.11 Reconciliation table (PRD: Receiving and price tickets)

- **Columns:** Style · size · Invoice · GRN · Existing (earlier PTs) · Proposed (this PT) · Held · Returned / disposed · Disposition.
- **Conservation rule, per line:** `GRN = Existing + Proposed + Held + Returned/disposed`.
- **Invoice vs GRN:** the difference shows under the GRN value in `--w-fg` 12 / 600: “−12 short”, “+6 excess”, or “not on invoice” (invoice 0).
- **Disposition:** one chip per outcome, in the family colour, for example:
  - Short n · record shortage / recount
  - Excess n · accept with explicit authority (supplemental PT) / return to supplier / keep on hold
  - Damaged n · keep in quarantine / return to supplier / write off / dispose
  - Wrong n · return to supplier / accept once identity is resolved and Booking approves (policy 17) / keep on hold
  - Unidentified n · resolve identity / return to supplier / keep on hold
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
  - Lasts 6 s (design default; validate against `PRD-PRF-001`), pauses on hover or focus, polite live region, never takes focus. **Undo** on a toast is a UI affordance only; it does not define a business undo window.
  - Moves above an open drawer’s footer.
- In-app only before stage 5: alerts reach people in My work. Email, WhatsApp and SMS arrive in stage 5 ([phases.md](../../phases.md); `DEC-099`, `PRD-EXC-013`).

### 10.13 Empty, loading, error

| State | Content | Rules |
|---|---|---|
| Empty | 40 px neutral mark · title (“No deliveries waiting”) · one line explaining why, naming the scope · one secondary action | Always explain why the list is empty and what to do next |
| Loading | Skeleton rows at the real row height, using `--sunken` blocks | `aria-busy`; pulse off under reduced motion |
| Error | `--d-bg` glyph · “Couldn’t load …” · cause · mono reference (ERR-xxxxxx) · Retry (primary) | Keep the user’s filters and selection; `role="alert"` |
| Partial | Data shown + trust chip in the Partial state | See 10.4 |

### 10.14 Approval panel (approval limits)

- **Anatomy (e1 card):**
  - Header: record title + “Awaiting approval” badge; prepared by, with date, time and record version.
  - Body:
    - Value label + value (kpi). The label names the value basis required by `PRD-ACS-015` for that action. An unknown value is never shown as zero (`PRD-ACS-016`).
    - **Limit bar:** 10 px track in `--sunken`, the approver’s limit in `--tint` ending in a 2 px `--accent` edge, and a value marker (4 × 18 px): `--accent` inside the limit, `--w-fg` outside.
    - Scale: “₹0.00 · Your limit up to ₹X · Next: <next approver>”. The scale follows the limit's value basis and unit (`PRD-ACS-015`): money for cost, bill value, documented valuation (no-bill returns, `DEC-039`) or amount paid; a quantity in the product's unit or a discount percentage where the limit is configured that way.
    - A message block in the family tint.
    - The policy reference: number and name. Show an effective date only once the policy is signed and its values are configured.
  - Footer: `--sunken` background with Reject… and the approve action.
- **States:**

  | Case | Message | Action |
  |---|---|---|
  | Within limit | Done: “Within your limit. You didn’t prepare this, so you can approve.” | **Approve** |
  | Above limit | Attention: “Above your limit by ₹n. <Next approver> can approve this.” | Approve **disabled**. No send action: the request already waits for an approver whose limit covers it and escalates when overdue (access-and-approvals 9.4; product owner, 6 Oct 2026, DEC-116) |
  | No approver set up | Attention: “No one is set up to approve this amount yet. It stays pending until policy 2 names an approver.” | Approve **disabled** |
  | Preparer | Stopped: “You prepared this, so a different person must approve.” | Approve **disabled** |
  | Unknown value | Attention: “The value isn’t known yet. Only an approver whose authority covers an unknown value can approve this.” | Approve **disabled** unless the approver's authority covers unknown value (`PRD-ACS-016`) |
  | No upper limit | “No upper limit (set in policy 2)”. Shown only when unlimited authority is configured on purpose | **Approve** |
- **Rules:**
  - Approval is by an authorised person other than the preparer, never through another role (`POL-02.07`, `POL-02.08`). Limits are configured per action and approver (`POL-02.09`); their values and the approvers stay OPEN until policy 2 is signed (`POL-02.10`). Every amount on a sample panel is synthetic.
  - Limits come from Setup › Approval limits (policy 2) and are checked as **permissions**, never role names. The next approver comes from the same settings; the screen never assumes the Owner.
  - The limit is always shown next to the button.
  - Approval binds to the exact record version shown. A material change needs a fresh approval.
  - Reject always asks for a reason.
  - An action whose approval has no value, such as an access change (DM-8), shows "No value" in place of the value and no limit bar; the Done message then says only that the reader did not prepare it. The panel shows the version's material facts, asks a reason (from the list in force, or in the reader's own words for a reason-list change, `DEC-104`) and a fresh authenticator code, and shows a decided, superseded or withdrawn request without the form (access-and-approvals 14 "As built"; `S1-F01-T16`).

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

### 10.17 Live action unavailable (policy gate)

- Shown in place of an action whose KDPS policy is not signed or whose values are not configured (PRD: Required policy configuration).
- **Anatomy:** a banner in the Attention family: “Live action unavailable” · the missing policy (number and name) · what is missing (signature, limit, approver, mapping) · a link to Setup › Policy readiness.
- The action stays visible but disabled, with the same reason as its tooltip.
- On `dev` with synthetic data, the action may work for design and development, with a synthetic-data banner.
- On `kdps-test`, gated actions stay disabled until their policy is signed and configured, even though the data is real KDPS data (`DEC-071`). Show an environment banner; chip wording is a design choice after policy signatures.
- In the side-by-side test the earlier POS stays the system of record: Apparel OS issues no tax invoice and bills no real customer (`PRD-LIF-026`). Its imports of the earlier POS's daily sales report and stock-on-hand are for checking and reports only and never move stock (`PRD-LIF-014`).
- Show the state, the blocking reason and the next action (`PRD-UXP-003`).

### 10.18 Several personas

- Personas are the PRD's 14 kinds of work, with IDs (P-OWN … P-AUD). A user can hold several; a persona grants nothing. Only role assignments grant access ([personas.md](../access/personas.md)).
- **Persona chip:** 24 px pill in Neutral, mono ID + name (“P-STM Store manager”). Shown on the profile menu, on record history (“Approved by Meera N. · P-OPS”) and on approval panels.
- **Menu:** the union of the sections the role assignments grant. Each section appears once, with the tabs of every persona merged.
- **Home:** one block per persona held, in the user's chosen order. The first block's persona sets the landing page. Where the user's roles do not grant that persona's landing screen, the first screen they grant in the persona's menu opens instead ([personas.md](../access/personas.md) section 2; DEC-116).
- **Scope:** an action is enabled only where one assignment covers the current scope. Otherwise it is disabled and the reason names the gap: “Your Store manager assignment covers BLR01 only.”
- **Independence:** a person who prepared a record cannot approve it through another persona. The approval panel shows the Preparer case (10.14).

### 10.19 Two stage 1 screens from existing parts

Decided by the product owner, 6 Oct 2026. Both use only the components above; the builder adds them to [ui-blueprint.html](ui-blueprint.html) with the code.

- **Setup › Exception rules** gets a tab for the due times and escalation of approvals and tasks, per action type and Site (access-and-approvals 9.4, 11.3).
- **Failed jobs** is a simple list in the operations view (`PRD-SEC-013`; module-map 4.1).

### 10.20 Sign-in screens (back office)

Built with `S1-F01-T15` from the parts above; they follow [access-and-approvals.md](../access/access-and-approvals.md) 3.1 to 3.3 (`PRD-SEC-001`, `POL-02.17`). **Design choice.**

- **Layout:** while no session is in force, the back-office shell shows only the environment banner and one solid card (e1, 448 px wide at most) in the content area: no top bar, no sidebar, no screen.
- **Sign in:** Organisation code (mono), Login, Password, Authenticator code (mono, numeric keyboard, optional, with help saying to leave it empty only before an app is set up), and **Sign in** as the one primary action. A refusal is a Danger banner at the top of the card with the code's text and the reference; an unavailable sign-in is an Attention banner that also names what is missing. The one refusal never says which part was wrong. The password and the code are cleared after a refused attempt (`PRD-SEC-006`).
- **Set up your authenticator app:** **Show the setup key** (primary) reveals the key once, in groups of four in mono, beside an Attention banner saying it is shown only now, and the setup link for the phone; then the code field and **Confirm the app**. No QR code yet (RR-280).
- **Choose your own password:** New password, New password again (checked on the screen only, never sent), a fresh authenticator code, and **Change password**.
- After each step the screens ask the server what is still to do, so a reload returns to the same step; when nothing is left, the shell opens on the landing screen (`DEC-116`). Focus moves to each step's title.

---

## 11. Content style

- Plain, short English (India) for now. All screen text is kept outside the code, so Hindi can be added in stage 5 (and for stage 6 screens in stage 6) without layout changes.
- Use the PRD's words exactly (its “Words used” tables). Sentence case for everything except codes and the PT grid’s canonical column names.
- Name the people and the rule (“Needs an approver whose limit covers ₹1,26,900.00”), not the system (“Permission denied”).
- Every block or error says **why** and **what to do next**.
- Dates and numbers follow §8.

---

## 12. Open items affecting this language

| Item | Who decides | Needed by |
|---|---|---|
| Approval limit values and approvers | Owner and Admin, policy 2 (**OPEN**) | Stage 1, live approvals |
| Reason list (Setup › Reason codes) (`POL-02.23`) | Owner and Admin, policy 2 (**OPEN**) | Stage 1 |
| One real messy delivery to test the reconciliation layout | KDPS Owner (**OPEN**) | Stage 2 |
| Piece-label layout; label and receipt printer models; the label printers' command language. Labels print through the local helper on any PC with the printer (`DEC-084`) | KDPS Operations and design (**OPEN**) | Stage 2 |
| Bill number format: length limit and allowed characters (`POL-10.07`) | Accounts and the CA (**OPEN**) | Stage 4 |
| Logo artwork | KDPS Owner (**OPEN**) | Stage 4, before the pilot switch |
| Finance screen detail | Product owner (**OPEN**) | Stage 5 |
| Hindi text and a Devanagari font check for stages 1–5 | Product owner and KDPS Owner (**OPEN**) | Stage 5 |
| Hindi for stage 6 screens (HRMS self-service, incentives, payslips) | Product owner and KDPS Owner (**OPEN**) | Stage 6 |
| WCAG 2.2 AA is the target for every screen (`DEC-105`) | — | Stage 1 screens |
