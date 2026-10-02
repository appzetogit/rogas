# DailyMealBox — Amendment v2 Extra: audit of the codebase BEFORE this work

**Audited:** 2 October 2026, branch `claude/trusting-rubin-xzrkpf` at `dc745fc`
**Spec:** `DailyMealBox_Amendment__v2_ Extra.docx` — Gaps A–Z (26 items) + Addenda AA–AL (12 items), ACM-146 → ACM-183
**Platform note:** the SOP is written for native Android apps (Firebase Remote Config, FCM, Google Drive). This codebase is a
React web app (customer, vendor, driver, admin, office) wrapped for mobile, with a Node/Express + MongoDB backend.
Every "Remote Config / OTA" requirement therefore maps to *server-held settings that the web apps re-fetch*, and every
"FCM push" maps to the existing web-push (Firebase Messaging) + in-app notification + email channels.

Legend: ✅ done · 🟡 partial · ❌ missing

| Gap | Title | Status before | What existed |
|---|---|---|---|
| A | Dynamic delivery slots | 🟡 | `DeliverySlot` model + admin CRUD + customer reads slots dynamically. **Missing:** draft/active/deactivating lifecycle, 14-day migration grace, `needs_slot_change`, city/zone scope, custom day selection (ACM-146), per-day slots (ACM-147), max slots/day (ACM-148). |
| B | Driver attendance | 🟡 | `ShiftRecord`, no-show sweep, driver "My Shifts", admin attendance page. **Missing:** platform timezone (slot times were treated as UTC), ACM-152 switch, City-Manager alert record, fleet-partner visibility, min-guarantee rule. |
| C | Annual plan | ❌ | – |
| D | Discounted trial | ❌ | – |
| E | Live stock tracking | ❌ | only a static `capacity` field |
| F | Bad-debt report | ❌ | – |
| G | Business holidays | ❌ | – |
| H | Google Analytics 4 | ❌ | admin "Marketing Tool" page was a non-persisting mock |
| I | Mailchimp | ❌ | – |
| J | WhatsApp invoices | ❌ | – |
| K | Zone delivery pricing | ❌ | one global fee per order |
| L | Fortnightly | ❌ | – |
| M | Pre-order launches | ❌ | – |
| N | Data encryption | ❌ | no field-level encryption, no HSTS/HTTPS enforcement |
| O | Visibility controls (ACM-131–145) | ❌ | – |
| P | Pantry return disposition | ❌ | driver "Cannot deliver" screen was client-side only (fake photo, nothing saved) |
| Q | Custom delivery days | ❌ | `deliveryDays` enum mon_fri/full_week only |
| R | Split ratings | ❌ | one `deliveryRating` that fed the **driver** score only |
| S | Upgrade/downgrade/switch/add slot | ❌ | a customer could only hold one subscription |
| T | Vendor review responses | ❌ | – |
| U | Address zone validation | ❌ | address saved anywhere; plans screen fetched vendors with an empty zone header (all zones) |
| V | Multiple addresses per day | ❌ | max one address per Home/Office/Other label |
| W | Notification preferences | ❌ | – |
| X | Zone-filtered plans | ❌ | vendor list explicitly un-zoned |
| Y | Customer segments | ❌ | – |
| Z | Shift availability confirmation | 🟡 | confirm button + admin "tomorrow" view + 2h admin email. **Missing:** 24h driver reminder, "cannot unconfirm within 2h", holiday handling. |
| AA | Two-track home cook | ❌ | – |
| AB | Track-1 settlement statements | ❌ | – |
| AC | Legal document CMS + re-acceptance | ❌ | static page content only |
| AD | Preferred fleet partner | ❌ | – |
| AE | 10-day menu preview | ❌ | calendar showed today/tomorrow |
| AF | Family Box | ❌ | – |
| AG | Select (single meal) mode | ❌ | – |
| AH | Medical diet specialisms | ❌ | – |
| AI | Eco packaging badge | ❌ | – |
| AJ | Weekend delivery filter | ❌ | – |
| AK | Smart Rotation | ❌ | – |
| AL | Hot/Cold label | ❌ | – |

**Admin controls:** 30 generic feature toggles existed, but **nothing in the apps or backend read them** — toggling them had no effect.
None of ACM-131 → ACM-183 existed.

## Production defects found during the audit (independent of the amendment)

1. **`server.js` deleted every daily order priced in PLN on every restart** — the "fake order cleanup" matched
   `pricing.currency: 'PLN'`, which since the currency clean-up is the real currency of every Polish order.
2. Customer skip / undo-skip / change-meal cut-offs were computed in **Asia/Kolkata** time.
3. Allergen exclusion on the vendor plans endpoint filtered a non-existent field (`allergies` instead of `allergens`),
   so "exclude my allergens" never excluded anything.
4. Driver attendance treated slot times (local) as UTC → no-shows flagged 1–2 hours off in Poland.
