# DailyMealBox — Specification vs. Codebase Analysis

**Project:** rogas (Backend + Frontend)
**Reviewed:** `readonlyfiles/` (6 documents) against `Backend/` and `Frontend/` source
**Prepared:** 4 September 2026
**Nature of this document:** read-only analysis. No code or files were changed.

---

## 1. What's in `readonlyfiles/`

Six Word documents, all describing one feature line called **DailyMealBox** — a subscription meal-box product (like HelloFresh/dietitian meal plans) being added to what is otherwise a general food-delivery platform. They are not independent specs; they are layered amendments to one evolving PRD:

| File | Role | Size |
|---|---|---|
| `DailyMealBox_PRD_Part1_CustomerApp_FINAL.docx` | Customer app spec (v3.0 "Final") | 67 tables |
| `DailyMealBox_PRD_Part2_VendorApp_FINAL.docx` | Vendor/maker app spec (v3.0 "Final") | 49 tables |
| `DailyMealBox_PRD_Part3_DriverApp_FINAL.docx` | Driver/delivery-partner app spec (v3.0 "Final") | 29 tables |
| `DailyMealBox_Admin_Controls_Matrix.docx` | Master list of every admin-configurable toggle (v2.0) | 122 controls |
| `DailyMealBox_MASTER_AMENDMENT_1.docx` | 26 fixes/additions to Parts 1–4 (incl. the "Organic Pantry Box" feature) | 35 tables |
| `DailyMealBox_Amendment__v2_ Extra.docx` | A **second, larger** amendment — 26 items plus **six further addenda** (Qoox, Settlement/Legal CMS, Be Diet gaps, Dietly gaps, Smart Rotation, Hot/Cold labels) stacked on top of each other | 65 tables |

Despite three files being labelled "FINAL" and the amendment file being labelled "FINAL — after this amendment PRDs are complete" (10 June), the same file then keeps growing through six more addenda dated 11–15 June, each again declaring "specification complete." **The admin-control count grows from 100 → 122 → 160 → 165 → 170 → 175 → 177 → 181 → 183 across the documents.** This is scope-creep in the paperwork itself, independent of the codebase — worth flagging to whoever is managing this spec, because "FINAL" has been used seven times for six different states of the document.

---

## 2. What the product is supposed to be, in one paragraph

A subscription-first meal-box app (not a marketplace) for Warsaw → Berlin → Paris, with five vendor types (Home Cook, Cloud Kitchen, Restaurant, Catering, and later a 5th "Shop Partner" for an organic grocery add-on), a driver app with PIN-based chain-of-custody (collection PIN at the vendor, delivery PIN/photo at the customer), a full EU VAT engine (food VAT owned by vendor, delivery VAT owned by a separate "Fleet Partner" logistics company, platform commission VAT owned by DailyMealBox), a 7-role admin panel (Super Admin, Accountant, Customer Service, City Manager, Marketing Manager, Web Manager, and a later 7th role, Fleet Manager), and — by the last addendum — 183 individually admin-toggleable features delivered over-the-air via Firebase Remote Config so nothing needs an app-store release.

---

## 3. What already exists in the codebase

This is a large, working codebase, not a stub. The DailyMealBox line has real, non-trivial implementation:

**Backend** (`Backend/src/modules/dailymealbox/`): dedicated modules for `subscription`, `mealplan`, `office` (B2B), `payment`, `serviceManagement`, `tracking`, `vendor`, `delivery`, `notifications`. Specific evidence of spec fidelity:
- `subscription.model.js` already carries VAT split fields (`foodVat`, `deliveryVat`, `platformFee` as separate rate + amount), skip/pause limits matching ACM-13/14 exactly (`maxSkipsPerMonth: 2`, `maxPauseDays: 2`), B2B invoice fields (`invoiceType`, `companyNip`), and an office/B2B link (`companyId` → `OfficeCompany`).
- `KitchenPartner` and `FleetPartner` Mongoose models exist, matching the Home-Cook legal entity and delivery-company concepts from the PRD. `kitchenPartner` logic is referenced 39 times in `admin.service.js`, so it's wired into the admin layer, not just a dangling model.
- The general Admin Panel (`modules/food/admin/`) has substantial Part-4 infrastructure already: a 7-role permission matrix (`adminPrd.js` — the roles match the PRD's roles verbatim, including `FLEET_MANAGER`), audit logging, city creation + go-live checklist, a feature-toggle table with **rollback** support, third-party integration config, environment management (Dev/QA/Prod), OTA config records, a fleet-partner dashboard and CRUD, driver-document review/approve/reject, complaint/refund handling, fleet invoice approve/reject/paid, and a VAT report.
- Driver-side: `driver.routes.js` (50KB) and `vendor.routes.js` (58KB) under the dailymealbox module are large, so pickup/route/PIN logic has real depth, not placeholders.

**Frontend**: `modules/CustomerApp` already has `CalendarScreen`, `PlansScreen`, `SubscriptionDetailsScreen`, `TrackerScreen`, `InvoiceSettingsScreen` — a good structural match to the Customer App's Calendar/Plans/Orders tabs. `modules/Office` is a fully separate B2B portal (login, OTP, onboarding steps, employees, assignments, payment history, vendors). A `FleetManagerDashboard.jsx` exists. `AnalyticsScript.jsx` exists (the Amendment v2 "Google Analytics" gap). Legal pages (`CustomerLegalPage`, `VendorLegalPage`, admin-editable `LegalPrivacy`/`LegalTerms`) exist. Restaurant/deliveryman review pages and a `RestaurantVATReport.jsx` exist.

**Verdict on "what exists":** the *original* PRD (Parts 1–3 + the first Admin Controls Matrix, i.e. the pre-amendment "v1/v2" scope — roughly the first 122 controls) is meaningfully reflected in the code. The core subscription loop, VAT split concept, Kitchen Partner model, Office B2B flow, and Admin Panel skeleton are real.

---

## 4. What is missing or only partially built

This is where the two "amendment" documents matter most, because almost nothing in them shows up in the code:

- **Admin Controls Matrix coverage is thin.** The code's `DEFAULT_FEATURE_TOGGLES` list has **~33 toggles** across categories (`ordering`, `slots`, `payments`, `smart`, `delivery`, `driver`, `language`, `notifications`, `marketing`, `fleet`). The spec asks for **183** by name (ACM-1 to ACM-183). No `remoteConfig`, `featureFlag`, or `ACM-` reference exists anywhere in `admin.service.js`. There is no Firebase Remote Config integration visible — the "OTA, no reinstall, 5–15 minute propagation" mechanism that the PRD treats as the backbone of the whole admin system does not appear to be built.
- **The Organic Pantry Box (Master Amendment PB-1 to PB-8) is not implemented as specified.** There *is* a `pantryOrder.routes.js` file under the dailymealbox vendor folder, but reading it shows it's the platform's **pre-existing generic "pantry item" ordering feature** (date+slot picker, Razorpay checkout) reused from the regular restaurant module — not the specific two-gap-shift model (10:00–11:00 / 14:30–16:00), not the "Shop Partner" 5th vendor type, not gap-based collection PINs, no teal-branded UI, no `shop_partner` fields on the vendor schema. This is a **false positive** worth being careful about if anyone reports "pantry is done" — it is a different, older feature wearing a similar name.
- **Smart Rotation** (Addendum 5, multi-vendor subscriptions) — no trace in backend or frontend.
- **Hot/Cold meal temperature labels** (Addendum 6) — no trace.
- **Family Box / Select mode / Medical diet specialisms** (Addendum 3) — no trace.
- **Eco packaging badge / Weekend delivery filter** (Addendum 4) — no trace.
- **Dynamic delivery slot system** (Amendment v2, Gap A) — the subscription model still hardcodes `deliverySlot: enum ['breakfast','lunch','dinner']` and `deliveryDays: enum ['mon_fri','full_week']`. The PRD explicitly calls the current hardcoded 3-slot system a "CRITICAL GAP" that must become fully admin-configurable; the code has not moved past that hardcoded state.
- **GDPR deletion execution flow** (Amendment v1 item #17, EU-law priority) — generic account-deletion services exist per role, but the specific 30-day countdown task, CS checklist, auto-escalation-at-25-days, and PII-anonymisation-with-financial-record-retention flow described in the PRD was not found.
- **Credit notes for refunded B2B invoices** (item #12, EU VAT law) — not found.
- **Legal document CMS with versioning + forced re-acceptance** (Addendum 2, Gap AC) — static legal pages exist, but no versioning/re-acceptance/audit trail collections.
- **Two-Track Home Cook onboarding** (Qoox Addendum, Gap AA) and **cook settlement statements** (Gap AB) — the `KitchenPartner` model has no `cook_track` field, no threshold monitoring, no `cook_settlements` collection.
- **Driver attendance confirmation / no-show detection** (Gap B), **business holiday planning** (Gap G), **bad-debt customer report** (Gap F), **Mailchimp sync** (Gap I), **fleet partner staff accounts / max-5 rule** (item #16), **vendor review-response UI** (Gap T) — none found.
- **Separated meal/delivery/overall ratings** (Gap R) — review pages exist, but nothing indicates the three-way split (`meal_quality` vs `delivery_experience` vs `overall`) the PRD requires so that a late driver can't tank a good vendor's rating.

**Rough scale of the gap:** the two amendment documents alone contain **97+ distinct numbered items** (18 + 8 + 26 + 5 + 5 + 5 + 2 + 4 + 2 = 75, plus the original 26-item Amendment v2 core = ~101 total change items across both amendment files) and raise the admin-control count from 122 to 183. Of the sampled items above — chosen because they're the highest-priority (P0/P0-LAW) ones — the large majority show no code footprint yet.

---

## 5. Structural issues worth flagging (not just "missing features")

- **The codebase's origin shows through.** Several DailyMealBox-adjacent files still default to India-market values: `subscription.model.js` → `pricing.currency: { default: 'INR' }`; `FleetPartner` invoices → `currency: { default: 'INR' }`; the feature-toggle seed list includes `payments.razorpay` and `language.hindi` alongside `payments.przelewy24`/`payments.stripe` and `language.polish`. This strongly suggests the DailyMealBox modules were adapted from an existing Indian food-delivery codebase rather than built fresh for the Warsaw/Berlin/Paris, PLN/EUR market the PRD describes. That's not inherently wrong, but it means every currency/locale default needs an explicit audit before EU launch — a stray `INR` default in a pricing schema is an easy way to ship a real bug.
- **Two "pantry" features risk colliding.** The pre-existing generic pantry-item ordering feature and the specced Organic Pantry Box (gap-shift, Shop Partner, teal UI) are conceptually different products that happen to share a name. If development proceeds by "extending" the existing pantry code to satisfy the DMB spec, expect friction — the existing model's shape (date+slot arrays, Razorpay-first checkout, `FoodItem`/`pantryItem` from the restaurant module) doesn't match the spec's gap-shift/PIN-batch/shop-partner model at all. This should be a conscious "build a new, parallel feature" decision, not a patch.
- **The admin RBAC skeleton is right but under-populated.** The 7 roles and their permission scopes in `adminPrd.js` match the PRD's Quick Reference table almost exactly — a genuinely good sign that whoever built the admin layer read the spec carefully. But a role system with 33 toggles behind it, when the spec assumes 183 and an OTA propagation model, is a shell that isn't carrying much weight yet.
- **The specification itself is the biggest risk to the project, independent of code.** Six rounds of "final" amendments in about two weeks, each adding competitor-audit features (Qoox, Be Diet, Dietly) on top of an already 122-control matrix, is a sign of a requirements process that hasn't been signed off — it's still actively absorbing new competitor research mid-amendment. Before more engineering time goes into chasing ACM-183, it would be worth getting written confirmation from whoever owns the spec that no ACM-184 is coming.

---

## 6. How it "should be" vs. how it currently is — summary table

| Area | Spec says | Code currently does | Gap |
|---|---|---|---|
| Admin controls | 183 controls, all OTA via Remote Config, no reinstall | ~33 toggles, no Remote Config wiring found | Large |
| Delivery slots | Fully admin-defined (name/time/cutoff/days), no hardcoding | Hardcoded enum: breakfast/lunch/dinner, mon_fri/full_week | Large |
| VAT engine | Full per-country matrix, reverse-charge, credit notes, per-line invoice breakdown | Per-subscription VAT rate/amount fields exist; no visible rate-matrix engine, no credit notes | Partial |
| Kitchen Partner (home cook legal entity) | Full model + Two-Track onboarding + settlement statements | Model + admin wiring exists; no track/threshold/settlement logic | Partial |
| Fleet Partner portal | Registration, invoices, staff accounts, doc management, driver invite-by-email | Model + admin CRUD + invoice approve/reject/paid + dashboard exist; invite flow, staff accounts, per-country invoice formats not found | Partial |
| Collection/Delivery PIN | Redis-backed, 4-digit, batch-scoped, 3-attempt lock | `driver.routes.js`/`vendor.routes.js` are large; PIN-specific code not directly confirmed in this pass (worth a closer read before assuming it's missing) | Unconfirmed — verify |
| Organic Pantry Box | New 5th vendor type, 2 gap shifts, teal UI, its own MongoDB collections | A same-named but unrelated legacy pantry feature exists | Effectively missing |
| GDPR deletion | 30-day task, auto-escalation, PII vs. financial-record split | Generic per-role account deletion only | Large |
| Smart Rotation / Hot-Cold / Family Box / Eco badge / Weekend filter / Medical diets | All specified in later addenda | None found | Missing |
| B2B Office accounts | Full flow | Fully separate `Office` frontend module + backend `OfficeCompany` link | Built |
| 7-role Admin RBAC | Named roles + scoped permissions | Matches almost exactly | Built |

---

## 7. Suggested next steps (for discussion, not acted on)

1. **Freeze the spec first.** Get explicit sign-off that `Amendment v2 Extra` (183 controls) is the real final state before scoping more engineering work against it — the document's own history (six "final" declarations) suggests it may not be.
2. **Reconcile the two "pantry" features by name before anyone touches that code** — rename one of them internally so a future ticket titled "pantry" doesn't get picked up against the wrong implementation.
3. **Treat the Admin Controls Matrix as a checklist, not a document to re-read.** Turning the 183 rows into a tracked backlog (even a simple spreadsheet: ACM #, area, built/not-built/partial) would make the next status check much faster than another full document read.
4. **Audit currency/locale defaults** (`INR`, `razorpay`, `hindi`) across the DailyMealBox modules before any EU-facing testing, since these are the kind of default that silently ships.
5. **Verify PIN implementation directly** — this report flags it as "unconfirmed" rather than "missing" because `driver.routes.js` and `vendor.routes.js` are large enough that targeted PIN logic could exist without having been read in this pass; it's the single highest-priority (P0, "most critical cross-app dependency") item in the whole spec and deserves a direct confirmation rather than an inference.

---

*This report reflects a review of the 6 documents in `readonlyfiles/` and a structural read of the `Backend/` and `Frontend/` source trees (directory structure, model schemas, admin service exports, and targeted keyword searches). It is not an exhaustive line-by-line audit of every route handler — where confidence is lower, that's called out explicitly above (see the PIN row).*
