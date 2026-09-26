# Payments (Przelewy24, Stripe, Razorpay)

One provider-agnostic payment service. Every purchase in the platform (subscription, pantry order, wallet top-up, driver
tip, office meal plan, driver cash deposit) goes through it, whichever provider the customer pays with.

| Provider | Used for | Currencies | How the customer pays |
|---|---|---|---|
| **Przelewy24** | Poland (default for `PL`) | PLN, EUR, CZK, GBP, HUF | Redirect to the Przelewy24 page (BLIK, bank transfer, cards) |
| **Stripe** | Every other country (default rule `*`) | any | Redirect to Stripe Checkout (cards, Apple/Google Pay, and BLIK / Przelewy24 when enabled in the Stripe dashboard) |
| **Razorpay** | India (default for `IN`) | INR only | Pop-up inside the app (UPI, cards, net banking) |

Admin panel: **Payments** (sidebar) — switch each provider on or off, choose which providers each country is offered
(with several ticked the customer chooses at checkout), *Test connection*, and the list of all payments with re-check and
refund. Every change is written to the audit log.

## How a payment flows

1. The app asks the server to start a payment (`create-order`, wallet top-up, …). The server works out the **country and
   currency** (zone of the order → phone country code → the default country) and the **provider** (the customer's choice
   if allowed, otherwise the country rule). It computes the price itself; a price sent by the browser is never trusted.
2. The server stores a `PaymentTransaction` (`payment_transactions`) and returns what to do next:
   `redirect` (Przelewy24 / Stripe) or `razorpay` (open the pop-up).
3. The customer pays on the provider's page and is sent back to `APP_PUBLIC_URL/payment/return?tx=…&t=…`.
4. **The provider's webhook is what confirms the payment** (signature checked, amount and currency compared with our
   record, processed exactly once). The return page only asks the server for the result; the server in turn asks the
   provider, so a missing webhook does not lose a payment. A background job (every minute) also settles payments whose
   webhook never arrived and expires abandoned ones after 30 minutes.
5. On success the purpose is delivered exactly once (subscription activated, wallet credited, order placed …). If
   delivery fails the payment is flagged **needs attention** in the admin list and retried automatically.

States: `created → pending → paid | failed | expired | cancelled → partially_refunded | refunded`.

## Configuration (`Backend/.env`, never committed)

| Variable | Meaning |
|---|---|
| `API_PUBLIC_URL` | Public address of this API. Providers call `…/api/v1/payments/webhook/<provider>` on it, so it must be reachable from the internet (not `localhost`). |
| `APP_PUBLIC_URL` | Public address of the web app (customers return here). Falls back to `FRONTEND_URL`. |
| `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_CRC`, `P24_API_KEY` | Przelewy24 credentials from its panel: merchant id, shop (POS) id, the CRC key and the API key ("key to reports"). |
| `P24_SANDBOX` | `true` (default) for `sandbox.przelewy24.pl`, `false` for production. |
| `STRIPE_SECRET_KEY` | `sk_test_…` (test) or `sk_live_…`. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` of the webhook endpoint (see below). |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay credentials. |
| `PAYMENTS_MODE` | `mock` adds a *Test payment* option that always succeeds — **development only**; it is ignored when `NODE_ENV=production`. |
| `PAYMENTS_JOBS` | `false` turns the background upkeep off (tests). |

A provider is offered to customers only when it is **switched on in the admin panel _and_ its keys are present**.

### Webhook addresses to register

* **Przelewy24** – nothing to register: the address is sent with every payment (`urlStatus`).
* **Stripe** – Dashboard → Developers → Webhooks → add endpoint `{API_PUBLIC_URL}/api/v1/payments/webhook/stripe`, events:
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
  `checkout.session.expired`, `charge.refunded`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
* **Razorpay** – Dashboard → Webhooks → `{API_PUBLIC_URL}/api/v1/payments/webhook/razorpay`, events `payment.captured`,
  `payment.failed`, `refund.processed`; the secret goes into `RAZORPAY_WEBHOOK_SECRET`.

The admin Payments page shows these exact addresses and warns when `API_PUBLIC_URL` is not reachable.

## Trying it locally

* **Without any provider account:** set `PAYMENTS_MODE=mock`, restart, and choose *Test payment* at checkout.
* **Przelewy24 sandbox:** put the sandbox credentials in `.env`, keep `P24_SANDBOX=true`. Payments complete when you
  return to the app even without webhooks (the return page and the background job ask Przelewy24). To also test the
  webhook, expose the API with a tunnel (e.g. `ngrok http 5000`) and set `API_PUBLIC_URL` to the tunnel address.
* **Stripe test mode:** use `sk_test_…` keys and a test card (`4242 4242 4242 4242`). For webhooks locally run
  `stripe listen --forward-to localhost:5000/api/v1/payments/webhook/stripe` and use the `whsec_…` it prints.
* Use **Test connection** in the admin panel after adding keys; it checks the credentials without moving money.

## Going live checklist

* `NODE_ENV=production`, `PAYMENTS_MODE` unset, `P24_SANDBOX=false`, live keys, `API_PUBLIC_URL`/`APP_PUBLIC_URL` on HTTPS.
* Przelewy24 production needs an approved merchant account; register the live webhook endpoints for Stripe/Razorpay.
* Make a small real payment per provider and refund it from the admin list.
* Keep an eye on the admin list filter **Needs attention** (paid but not delivered, or amount mismatch).

## Code map

| File | Role |
|---|---|
| `payments.service.js` | start payment, webhooks, sync/reconcile, fulfilment, refunds |
| `payments.settings.js` | admin settings, provider status, country → providers/currency |
| `payments.models.js` | `PaymentTransaction`, `PaymentWebhookEvent`, `PaymentSettings` |
| `payments.locale.js` | country names/dial codes, currency minor units |
| `providers/*.provider.js` | one adapter per provider (create, status, webhook, refund, test) |
| `purposes/*.purpose.js` | what happens when a payment for that purpose succeeds/fails |
| `payments.routes.js` | public API (`/methods`, `/:id/status`, confirm endpoints) and webhook handlers |
| `payments.admin.routes.js` | admin API under `/api/v1/food/admin/payments` |

Tests: `PAYMENTS_TEST_MONGO_URI=mongodb://127.0.0.1:27017 npm run test:payments` (needs a **local** MongoDB; the providers
are replaced by local fakes that verify the same signatures, so no network or money is involved).

Frontend: `Frontend/src/shared/payments/` (method picker, return page, money formatting) and the admin page
`Frontend/src/modules/Food/pages/admin/payments/PaymentsPage.jsx`.
