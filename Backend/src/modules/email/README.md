# Transactional email

One place that actually talks to SMTP. Every trigger elsewhere in the app calls `queueEmail()` and is done —
translation, sending, retrying and admin visibility are handled here.

## What the SOPs ask for

The PRDs and the Admin Controls Matrix repeatedly pair every important account-status change with **"FCM + Email,
cannot disable"**: vendor application approved/rejected (ACM-50), driver application approved/rejected (ACM-64),
food/driving licence expiring or expired (ACM-49/67, legal), payout/settlement sent (ACM-51/52), commission rate
changed (ACM-51), vacation-mode notices, pantry order confirmations, card-payment-failure retries, GDPR deletion
confirmations, business-holiday notices, and the driver-invitation-by-email flow (Master Amendment #15, P0). It also
says the receipt/invoice PDF is emailed to the customer, and B2B monthly invoices are emailed to the billing address.

Admin Control #96 ("Email templates") says a **Web Manager edits all system emails**, with default copy shipped by
Appzeto, and that VAT-required invoice fields cannot be edited from there. This service gets that for free by
reusing the platform's existing translation system (below) rather than building a second one — the same admin
screen already used for push-notification text now also edits email subject/body, in every language.

## How it works

- **Content is translated and admin-editable, exactly like push notifications.** The English subject/body text
  written in the calling code *is* the i18n key (namespace `"email"`), looked up for the recipient's language and
  editable from **Admin → Translations → Emails**. There is no separate template model to keep in sync.
- **Language** is resolved automatically from the recipient's account (`ownerType`/`ownerId`, using the same
  per-account language preference push notifications already use) unless a `language` is given directly.
- **Every send is recorded first** (`EmailLog`, collection `email_logs`), so nothing is silently dropped. A failure
  is retried with backoff (5, 10, 20, 40... minutes, capped at 6h) by a background sweep started from `server.js`,
  the same pattern the payments module uses for its own upkeep. After `EMAIL_MAX_ATTEMPTS` (5) it stays `failed`
  for an admin to inspect and resend by hand from **Admin → Email**.
- **Admin → Email** shows whether SMTP is configured, a "Test connection" button (`transporter.verify()`, sends
  nothing), 24h sent/failed/pending counts, and the full send log with a body preview and manual resend.

## Sending an email

```js
import { queueEmail } from '../../email/email.service.js';

await queueEmail({
  to: vendor.ownerEmail,
  subjectKey: 'Your kitchen is live!',
  bodyKey: 'Congratulations, {{restaurantName}}! Your restaurant has been approved...',
  vars: { restaurantName: vendor.restaurantName },
  ownerType: 'RESTAURANT',   // resolves the vendor's own language preference
  ownerId: vendor._id
});
```

`subjectKey`/`bodyKey` are plain English sentences — write the real copy you want sent by default; the i18n catalog
extractor picks them up automatically (`npm run i18n:extract` in `Frontend/`) so they can be translated the same way
every other string in the app is. `bodyKey` may contain blank-line-separated paragraphs (`\n\n`); they become `<p>`
tags in the sent HTML automatically. Attachments: `attachments: [{ filename, path }]` — `path` is a URL or local
path, exactly like the existing `nodemailer` usage in `utils/email.js`.

## Configuration (`Backend/.env`, never committed)

Same variables `utils/email.js` already used — nothing new to set up if those already work:

| Variable | Meaning |
|---|---|
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` | SMTP credentials. |
| `EMAIL_FROM` | From address (falls back to `EMAIL_USER`). |
| `EMAIL_JOBS=false` | Turns the background retry sweep off (tests). |

## What's wired up so far, and what's backlog

**Wired as the first real example** (proves the whole pipeline end to end, with tests):
- Vendor application approved / rejected (`admin.service.js` → `approveRestaurant`/`rejectRestaurant`)
- Driver application approved / rejected (`admin.service.js` → `approveDeliveryPartner`/`rejectDeliveryPartner`)

**Not wired yet** — the SOP lists many more trigger points; this service is ready for all of them (`queueEmail()` is
the whole integration), they just haven't been connected to their trigger points yet:
food/driving licence expiring & expired, payout/settlement sent, commission rate changed, vacation-mode notices,
pantry order confirmation, card-payment-failure retry emails, GDPR deletion confirmation, business-holiday notices,
driver-invitation-by-email (fleet partners, P0), B2C receipt / B2B monthly invoice delivery, gift-subscription
delivery, and Mailchimp marketing sync (a separate integration, not a `queueEmail()` trigger).

## Testing

`EMAIL_TEST_MONGO_URI=mongodb://127.0.0.1:27017 npm run test:email` (needs a **local** MongoDB). The SMTP
transporter is replaced by a fake (`_setTransporterForTests`) — no real network or credentials involved, following
the same pattern the payments module uses for its Razorpay client in tests.

To try it against a real inbox in development: set the four `EMAIL_*` variables to a real SMTP account (e.g. a
Mailtrap or Gmail app-password sandbox), restart the backend, and use **Admin → Email → Test connection**.
